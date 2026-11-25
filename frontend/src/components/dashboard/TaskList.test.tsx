import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '../../hooks/useToasts';
import type { Task } from '../../types';
import type { TaskSortKey } from '../../lib/taskView';
import TaskList from './TaskList';

const mk = (o: Partial<Task>): Task => ({
  id: 't1', title: '로그인 버그 수정', description: '', status: 'todo', priority: 'high',
  category: '', assigneeId: 'minji-park', subtasks: [], createdAt: '2026-11-20T00:00:00Z', kind: 'manual', ...o,
});
const TASKS = [
  mk({}),
  mk({ id: 'pr-1', title: '결제 PR', status: 'review', kind: 'pr', assigneeId: '', author: 'jaeho-lee' }),
  mk({ id: 'pr-2', title: '정산 PR', status: 'review', kind: 'pr', assigneeId: '', author: null }),
];

const setup = (o: { tasks?: Task[]; sort?: { key: TaskSortKey; dir: 'asc' | 'desc' } } = {}) => {
  const p = {
    tasks: o.tasks ?? TASKS, sort: o.sort ?? { key: 'createdAt' as TaskSortKey, dir: 'desc' as const },
    onSortChange: vi.fn(), linkSearch: '?view=list&kind=pr',
    onMoveTask: vi.fn(async () => ({ ok: true as const, value: undefined })), onDeleteTask: vi.fn(),
  };
  const user = userEvent.setup();
  const r = render(<MemoryRouter><ToastProvider><TaskList {...p} /></ToastProvider></MemoryRouter>);
  return { ...r, user, p };
};
const row = (id: string) => document.querySelector(`[data-row-id="${id}"]`) as HTMLElement;

describe('TaskList', () => {
  it('(a) 제목 링크가 linkSearch를 보존', () => {
    setup();
    expect(screen.getByRole('table', { name: '전체 작업 목록' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인 버그 수정' })).toHaveAttribute('href', '/tasks/t1?view=list&kind=pr');
  });

  it('(b) PR 행은 상태 컨트롤 없이 GitHub 기준 글자, 수동 행은 combobox', () => {
    setup();
    expect(within(row('pr-1')).queryByRole('combobox')).toBeNull();
    expect(within(row('pr-1')).getByText('리뷰 중 · GitHub 기준')).toBeInTheDocument();
    expect(within(row('t1')).getByRole('combobox', { name: '‘로그인 버그 수정’ 상태 변경' })).toBeInTheDocument();
    expect(within(row('pr-1')).getByText('리뷰 요청', { selector: 'td *' })).toBeInTheDocument();
  });

  it('(c) 사람 열: 담당/작성/없음', () => {
    setup();
    expect(within(row('t1')).getByText('담당 minji-park')).toBeInTheDocument();
    expect(within(row('pr-1')).getByText('작성 jaeho-lee')).toBeInTheDocument();
    const cell = within(row('pr-2')).getByText('작성자 정보 없음').closest('[role="cell"]') as HTMLElement;
    expect(within(cell).getByText('—')).toHaveAttribute('aria-hidden', 'true');
  });

  it('(d) 정렬 머리: 클릭하면 onSortChange, aria-sort는 sort prop과 일치', async () => {
    const { user, p } = setup({ sort: { key: 'priority', dir: 'asc' } });
    const th = (name: string) => screen.getByRole('button', { name }).closest('th') as HTMLElement;
    expect(th('우선순위')).toHaveAttribute('aria-sort', 'ascending');
    for (const n of ['작업', '상태', '생성']) expect(th(n)).toHaveAttribute('aria-sort', 'none');
    await user.click(screen.getByRole('button', { name: '우선순위' }));
    expect(p.onSortChange).toHaveBeenCalledWith('priority');
    expect(p.onSortChange).toHaveBeenCalledTimes(1);
  });

  it('(e) 삭제 버튼: 행마다 다른 이름, 항상 보임, 클릭하면 onDeleteTask(task)', async () => {
    const { user, p } = setup();
    const btn = screen.getByRole('button', { name: '‘로그인 버그 수정’ 삭제' });
    expect(btn.className).not.toMatch(/\bhidden\b|opacity-0/);
    await user.click(btn);
    expect(p.onDeleteTask).toHaveBeenCalledTimes(1);
    expect(p.onDeleteTask).toHaveBeenCalledWith(TASKS[0]);
  });

  it('(f) 200자 제목은 잘림 클래스 없음', () => {
    setup({ tasks: [mk({ title: '가'.repeat(200) })] });
    let el: HTMLElement | null = screen.getByRole('link');
    while (el && el.tagName !== 'TR') {
      expect(el.className).not.toMatch(/truncate|whitespace-nowrap|text-ellipsis/);
      el = el.parentElement;
    }
  });

  it('(g) 소스 가드', () => {
    const src = readFileSync('frontend/src/components/dashboard/TaskList.tsx', 'utf8');
    expect(src).not.toMatch(/<(div|span)[^>]*onClick/);
    expect(src).not.toMatch(/🔥|animate-/);
    expect(src).not.toMatch(/(?<![\w:-])(w|min-w)-(64|72|80|96|\[\d+px\])/);
  });

  it('(h) 빈 tasks여도 caption과 머리 유지, 표 역할 명시', () => {
    setup({ tasks: [] });
    const table = screen.getByRole('table', { name: '전체 작업 목록' });
    expect(within(table).getAllByRole('columnheader').length).toBe(7);
    expect(within(table).getAllByRole('row')).toHaveLength(1);
    for (const el of table.querySelectorAll('tr, th, td, thead, tbody')) expect(el).toHaveAttribute('role');
  });
});
