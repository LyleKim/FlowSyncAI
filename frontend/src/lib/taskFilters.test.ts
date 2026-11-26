import { describe, it, expect } from 'vitest';
import { searchTasks, countByStatus, filterTasks, sortByCreatedAt } from './taskFilters';
import { Task } from '../types';

const mk = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', description: '', status: 'todo', priority: 'low',
  category: '', assigneeId: '', subtasks: [], createdAt: '2026-01-01T00:00:00Z', ...o,
});
const tasks = [
  mk({ id: 'a', title: 'Login Bug', category: '백엔드', assigneeId: 'kim', createdAt: '2026-01-02T00:00:00Z' }),
  mk({ id: 'b', title: 'x', description: 'Fix CSS', status: 'done', assigneeId: 'lee' }),
];

describe('taskFilters', () => {
  it('searchTasks', () => {
    expect(searchTasks(tasks, 'login').map(t => t.id)).toEqual(['a']);
    expect(searchTasks(tasks, 'css').map(t => t.id)).toEqual(['b']);
    expect(searchTasks(tasks, '백엔').map(t => t.id)).toEqual(['a']);
    expect(searchTasks(tasks, '  ')).toHaveLength(2);
  });
  it('countByStatus', () => {
    expect(countByStatus([])).toEqual({ all: 0, todo: 0, inprogress: 0, review: 0, done: 0 });
    expect(countByStatus(tasks)).toMatchObject({ all: 2, todo: 1, done: 1 });
  });
  it('filterTasks', () => {
    expect(filterTasks(tasks, {})).toHaveLength(2);
    expect(filterTasks(tasks, { status: 'done' }).map(t => t.id)).toEqual(['b']);
    expect(filterTasks(tasks, { assignee: 'kim' }).map(t => t.id)).toEqual(['a']);
  });
  it('sortByCreatedAt does not mutate', () => {
    expect(sortByCreatedAt(tasks, 'desc').map(t => t.id)).toEqual(['a', 'b']);
    expect(sortByCreatedAt(tasks, 'asc').map(t => t.id)).toEqual(['b', 'a']);
    expect(tasks[0].id).toBe('a');
  });
});
