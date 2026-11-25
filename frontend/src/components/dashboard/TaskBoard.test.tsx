import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '../../hooks/useToasts';
import type { Task, TaskStatus } from '../../types';
import TaskBoard from './TaskBoard';

const mk = (o: Partial<Task>): Task => ({
  id: 't1', title: '로그인 버그 수정', description: '', status: 'todo', priority: 'high',
  category: '', assigneeId: 'minji-park', subtasks: [], createdAt: '2026-11-20T00:00:00Z', kind: 'manual', ...o,
});
const TASKS = [
  mk({}),
  mk({ id: 't2', title: '문서 정리', status: 'todo', priority: 'low' }),
  mk({ id: 'pr-1', title: '결제 PR', status: 'review', kind: 'pr', assigneeId: '', author: 'jaeho-lee' }),
];
const ok = async () => ({ ok: true as const, value: undefined });

const setup = (tasks: Task[] = TASKS) => {
  const p = { tasks, linkSearch: '?view=board&kind=all', onMoveTask: vi.fn(ok), onDeleteTask: vi.fn() };
  const user = userEvent.setup();
  const r = render(<MemoryRouter><ToastProvider><TaskBoard {...p} /></ToastProvider></MemoryRouter>);
  return { ...r, user, p };
};
const card = (id: string) => document.querySelector(`[data-row-id="${id}"]`) as HTMLElement;

describe('TaskBoard', () => {
  it('(a) 4열 머리가 항상 동시에 있고 개수 포함', () => {
    setup();
    const hs = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(hs).toEqual(['할 일 2', '진행 중 0', '리뷰 중 1', '완료 0']);
    expect(screen.getByRole('region', { name: '리뷰 중 1' })).toBeInTheDocument();
  });

  it('(b) 열은 list, 카드는 listitem', () => {
    setup();
    const todo = screen.getByRole('region', { name: '할 일 2' });
    expect(within(within(todo).getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(card('t1').tagName).toBe('LI');
  });

  it('(c) 카드 제목은 linkSearch를 보존하는 링크, 클릭 div 없음', () => {
    setup();
    expect(screen.getByRole('link', { name: '로그인 버그 수정' })).toHaveAttribute('href', '/tasks/t1?view=board&kind=all');
    expect(within(card('t1')).getByText('담당 minji-park')).toBeInTheDocument();
    expect(within(card('pr-1')).getByText('작성 jaeho-lee')).toBeInTheDocument();
    expect(within(card('t1')).getByText('우선순위 높음')).toBeInTheDocument();
    const src = readFileSync('frontend/src/components/dashboard/TaskBoard.tsx', 'utf8');
    expect(src).not.toMatch(/<(div|span|li|section)[^>]*onClick/);
  });

  it('(d) PR 카드는 combobox 없이 이동 불가, 수동 카드는 combobox, 컨트롤 이름은 카드마다 다름', async () => {
    const { user, p } = setup();
    expect(within(card('pr-1')).queryByRole('combobox')).toBeNull();
    expect(within(card('pr-1')).getByText('리뷰 중 · GitHub 기준 · 이동 불가')).toBeInTheDocument();
    expect(within(card('t1')).getByRole('combobox', { name: '‘로그인 버그 수정’ 상태 변경' })).toBeInTheDocument();
    const del = within(card('t2')).getByRole('button', { name: '‘문서 정리’ 삭제' });
    expect(del.className).toMatch(/relative/);
    expect(del.className).toMatch(/z-10/);
    await user.click(del);
    expect(p.onDeleteTask).toHaveBeenCalledWith(TASKS[1]);
  });

  it('(e) 상태 이동으로 카드가 다른 열로 가도 포커스는 그 카드의 상태 컨트롤', async () => {
    function Harness() {
      const [tasks, setTasks] = useState(TASKS);
      const onMoveTask = async (id: string, s: TaskStatus) => {
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: s } : t)));
        return { ok: true as const, value: undefined };
      };
      return <TaskBoard tasks={tasks} linkSearch="" onMoveTask={onMoveTask} onDeleteTask={() => {}} />;
    }
    const user = userEvent.setup();
    render(<MemoryRouter><ToastProvider><Harness /></ToastProvider></MemoryRouter>);
    await user.selectOptions(screen.getByRole('combobox', { name: '‘로그인 버그 수정’ 상태 변경' }), 'done');
    const done = screen.getByRole('region', { name: '완료 1' });
    const sel = within(done).getByRole('combobox', { name: '‘로그인 버그 수정’ 상태 변경' });
    expect(sel).toHaveFocus();
  });

  it('(f) 빈 열은 "작업이 없어요"', () => {
    setup();
    const ip = screen.getByRole('region', { name: '진행 중 0' });
    expect(within(ip).getByText('작업이 없어요')).toBeInTheDocument();
    expect(within(ip).queryByRole('listitem')).toBeNull();
  });

  it('(g) 소스 가드', () => {
    const src = readFileSync('frontend/src/components/dashboard/TaskBoard.tsx', 'utf8');
    expect(src).not.toMatch(/getPriorityStyle|getCategoryStyle|h-\[19\.5rem\]|h-72|border-l-\[|hover:-translate|🔥|desc:/);
    expect(src).not.toMatch(/animate-|draggable|onDrag|adjacentStatus|selectedStatus/);
    expect(src).not.toMatch(/(?<![\w:-])(w|min-w)-(64|72|80|96|\[\d+px\])/);
    expect(src).not.toMatch(/(?<![\w:-])grid-cols-[2-9]/);
    expect(src).toMatch(/md:grid-cols-2/);
    expect(src).toMatch(/xl:grid-cols-4/);
  });
});
