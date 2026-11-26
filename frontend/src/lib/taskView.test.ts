import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIEW_STATE, parseTaskViewParams, toTaskViewParams, tasksPath, taskLinkTo,
  applyTaskFilter, sortTasks, nextSort, assigneeOptions, displayTitle, TaskViewState,
} from './taskView';
import { Task } from '../types';
import { normalizeTask } from '../services/taskSync';

const mk = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', description: '', status: 'todo', priority: 'low',
  category: '', assigneeId: '', subtasks: [], createdAt: '2026-01-01T00:00:00Z', ...o,
});
const P = (s: string) => parseTaskViewParams(new URLSearchParams(s));

describe('url params', () => {
  it('unknown values fall back to defaults', () => {
    expect(P('status=zzz&view=x&kind=&sort=nope&dir=up')).toEqual(DEFAULT_VIEW_STATE);
  });
  it('board forces status all', () => {
    expect(P('view=board&status=review').status).toBe('all');
    expect(P('view=board&status=review').view).toBe('board');
  });
  it('first duplicate wins; q trimmed and capped', () => {
    expect(P('status=todo&status=done').status).toBe('todo');
    expect(P('q=%20%20hi%20').q).toBe('hi');
    expect(P('q=' + 'a'.repeat(300)).q).toHaveLength(200);
  });
  it('defaults serialize to empty and round-trip', () => {
    expect(toTaskViewParams(DEFAULT_VIEW_STATE).toString()).toBe('');
    const s: TaskViewState = {
      view: 'list', q: '한글 q&=', status: 'review', kind: 'pr', assignee: 'me', sort: 'priority', dir: 'asc',
    };
    expect(parseTaskViewParams(toTaskViewParams(s))).toEqual(s);
    const b: TaskViewState = { ...s, view: 'board', status: 'all' };
    expect(parseTaskViewParams(toTaskViewParams(b))).toEqual(b);
    expect(toTaskViewParams({ ...s, view: 'board' }).has('status')).toBe(false);
  });
  it('tasksPath / taskLinkTo', () => {
    expect(tasksPath({ kind: 'pr' })).toBe('/tasks?kind=pr');
    expect(tasksPath({})).toBe('/tasks');
    expect(taskLinkTo('a b', '?view=board&kind=pr')).toEqual({ pathname: '/tasks/a%20b', search: '?view=board&kind=pr' });
  });
});

describe('applyTaskFilter', () => {
  const f = { q: '', status: 'all' as const, kind: 'all' as const, assignee: '' };
  const ts = [
    mk({ id: 't1', assigneeId: ' Minji ', sourceUrl: 'https://github.com/o/r/pull/1' }),
    mk({ id: 'pr-1', kind: undefined, assigneeId: '', author: 'jaeho-lee' }),
    mk({ id: 't3', assigneeId: 'minji-park' }),
    mk({ id: 't4', assigneeId: 'x', author: 'minji-park', kind: 'pr' }),
  ];
  const ids = (r: Task[]) => r.map(t => t.id);
  it('assignee', () => {
    expect(ids(applyTaskFilter(ts, { ...f, assignee: 'minji' }, { me: null }))).toEqual(['t1']);
    expect(ids(applyTaskFilter(ts, { ...f, assignee: 'none' }, { me: null }))).toEqual(['pr-1']);
    expect(ids(applyTaskFilter(ts, { ...f, assignee: 'me' }, { me: 'minji-park' }))).toEqual(['t3', 't4']);
    expect(applyTaskFilter(ts, { ...f, assignee: 'me' }, { me: null })).toHaveLength(4);
  });
  it('q matches author/assignee too', () => {
    expect(ids(applyTaskFilter(ts, { ...f, q: 'jaeho' }, { me: null }))).toEqual(['pr-1']);
    expect(ids(applyTaskFilter(ts, { ...f, q: 'minji' }, { me: null }))).toEqual(['t1', 't3', 't4']);
  });
  it('kind uses isPrTask, not sourceUrl', () => {
    expect(ids(applyTaskFilter(ts, { ...f, kind: 'manual' }, { me: null }))).toEqual(['t1', 't3']);
    expect(ids(applyTaskFilter(ts, { ...f, kind: 'pr' }, { me: null }))).toEqual(['pr-1', 't4']);
  });
  it('status', () => {
    expect(applyTaskFilter([mk({ status: 'done' }), mk({})], { ...f, status: 'done' }, { me: null })).toHaveLength(1);
  });
});

describe('assigneeOptions', () => {
  it('merges case/whitespace variants, skips empty', () => {
    expect(assigneeOptions(['Minji', 'minji ', ''].map(a => mk({ assigneeId: a }))))
      .toEqual([{ value: 'minji', label: 'Minji', count: 2 }]);
  });
  it('handles 100 inputs', () => {
    const r = assigneeOptions(Array.from({ length: 100 }, (_, i) => mk({ assigneeId: `u${i % 7}` })));
    expect(r).toHaveLength(7);
    expect(r[0].count).toBeGreaterThanOrEqual(r[6].count);
  });
});

describe('sort', () => {
  const ts = [mk({ id: 'a', priority: 'low' }), mk({ id: 'b', priority: 'urgent' }), mk({ id: 'c', priority: 'low' })];
  it('priority desc, stable, immutable', () => {
    const copy = [...ts];
    expect(sortTasks(ts, 'priority', 'desc').map(t => t.id)).toEqual(['b', 'a', 'c']);
    expect(ts).toEqual(copy);
  });
  it('status/title', () => {
    expect(sortTasks([mk({ id: 'a', status: 'done' }), mk({ id: 'b', status: 'todo' })], 'status', 'asc').map(t => t.id)).toEqual(['b', 'a']);
    expect(sortTasks([mk({ id: 'a', title: '나' }), mk({ id: 'b', title: '가' })], 'title', 'asc').map(t => t.id)).toEqual(['b', 'a']);
  });
  it('nextSort', () => {
    expect(nextSort({ key: 'title', dir: 'asc' }, 'title')).toEqual({ key: 'title', dir: 'desc' });
    expect(nextSort({ key: 'title', dir: 'asc' }, 'priority')).toEqual({ key: 'priority', dir: 'asc' });
    expect(nextSort({ key: 'title', dir: 'asc' }, 'createdAt')).toEqual({ key: 'createdAt', dir: 'desc' });
  });
});

describe('displayTitle', () => {
  it('strips leading [PR] only', () => {
    expect(displayTitle({ title: '[PR] #58 x' })).toBe('#58 x');
    expect(displayTitle({ title: '[PR]' })).toBe('[PR]');
    expect(displayTitle({ title: '' })).toBe('');
    expect(displayTitle({ title: 'a [PR] b' })).toBe('a [PR] b');
  });
});

describe('normalizeTask', () => {
  it('assigneeId "Unknown"/빈 값 → "" (담당자 없음)', () => {
    expect(normalizeTask(mk({ assigneeId: 'Unknown' })).assigneeId).toBe('');
    expect(normalizeTask(mk({ assigneeId: ' unknown ' })).assigneeId).toBe('');
    expect(normalizeTask(mk({ assigneeId: 'kim' })).assigneeId).toBe('kim');
    const t = [normalizeTask(mk({ assigneeId: 'Unknown' }))];
    expect(applyTaskFilter(t, { ...DEFAULT_VIEW_STATE, assignee: 'none' }, { me: null })).toHaveLength(1);
    expect(assigneeOptions(t)).toEqual([]);
  });
});
