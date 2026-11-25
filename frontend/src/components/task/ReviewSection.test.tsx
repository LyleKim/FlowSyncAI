import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ToastProvider, useToasts } from '../../hooks/useToasts';
import { TasksProvider, useTasksContext } from '../../hooks/TasksContext';
import { ToastHost } from '../common/ToastHost';
import { renderWithRouter } from '../../test/render';
import { routeFetch } from '../../test/routeFetch';
import type { Task } from '../../types';
import { ReviewSection } from './ReviewSection';

const reviews = [
  { id: 'r1', role: '개발자', comment: '로직 확인 필요', createdAt: '2026-11-20T00:00:00Z', reviewerId: 'kim', urgency: 'urgent' as const },
  { id: 'r2', role: '디자이너', comment: '간격 조정', createdAt: '2026-11-21T00:00:00Z', reviewerId: 'park', urgency: 'normal' as const },
];
const mk = (o: Partial<Task> = {}): Task => ({
  id: 't1', title: '버그', description: '', status: 'todo', priority: 'medium', category: '',
  assigneeId: 'lee', subtasks: [], roleReviews: reviews, createdAt: '2026-11-20T00:00:00Z', kind: 'manual', ...o,
});

let list: Task[] = [];
function Inner() {
  const { tasks, refresh } = useTasksContext();
  const t = tasks.find((x) => x.id === 't1');
  return <><button onClick={() => void refresh()}>폴링</button>{t && <ReviewSection task={t} />}</>;
}
function Wrap() {
  const { notify } = useToasts();
  return <TasksProvider notify={notify}><Inner /></TasksProvider>;
}
const setup = (task: Task, extra: Parameters<typeof routeFetch>[0] = {}) => {
  list = [task];
  const r = routeFetch({ 'GET /api/v1/tasks/': () => ({ json: list }), ...extra });
  return { ...r, ...renderWithRouter(<ToastProvider><Wrap /><ToastHost /></ToastProvider>) };
};
afterEach(() => vi.unstubAllGlobals());
const opts = { hidden: true } as const;

describe('ReviewSection', () => {
  it('(a) 기본 접힘, summary "역할 검토 (2)"', async () => {
    setup(mk());
    const s = await screen.findByText('역할 검토 (2)');
    expect(s.closest('details')).not.toHaveAttribute('open');
  });

  it('(b) 폴링으로 task가 새 객체가 되어도 입력 보존', async () => {
    const { user } = setup(mk());
    const box = await screen.findByLabelText('내용');
    await user.type(box, '초안');
    list = [mk()];
    await user.click(screen.getByRole('button', { name: '폴링', ...opts }));
    await waitFor(() => expect(screen.getByLabelText('내용')).toHaveValue('초안'));
  });

  it('(c) 성공하면 폼 초기화, 실패하면 보존 + role=alert', async () => {
    let fail = true;
    const { user, calls } = setup(mk(), {
      'POST /api/v1/tasks/t1/reviews/': () =>
        fail ? { status: 500 } : { json: { id: 'r3', role: '개발자', comment: '새 검토', createdAt: '2026-11-22T00:00:00Z', taskStatus: 'inprogress' } },
    });
    const box = await screen.findByLabelText('내용');
    await user.type(box, '새 검토');
    await user.click(screen.getByRole('button', { name: '검토 추가', ...opts }));
    await waitFor(() => expect(screen.getAllByRole('alert', opts).length).toBeGreaterThan(0));
    expect(screen.getByLabelText('내용')).toHaveValue('새 검토');
    // 토스트 1 + 인라인 alert 1이 아닌, 인라인 폼 실패 안내가 있어야 한다
    expect(document.querySelector('details [role="alert"]')).not.toBeNull();
    fail = false;
    await user.click(screen.getByRole('button', { name: '검토 추가', ...opts }));
    await waitFor(() => expect(screen.getByLabelText('내용')).toHaveValue(''));
    expect(document.querySelector('details [role="alert"]')).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('(c2) 내용이 비면 요청하지 않는다', async () => {
    const { user, calls } = setup(mk());
    await user.click(await screen.findByRole('button', { name: '검토 추가', ...opts }));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('(d) "확인함" 클릭은 isAccepted PATCH, 항목별 이름 구분', async () => {
    const { user, calls } = setup(mk(), {
      'PATCH /api/v1/tasks/t1/reviews/r2/': () => ({ json: { ...reviews[1], isAccepted: true, acceptedAt: '2026-11-22T00:00:00Z' } }),
    });
    await user.click(await screen.findByRole('button', { name: '‘park’ 검토 확인함', ...opts }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ isAccepted: true }));
    expect(await screen.findByText(/확인함 · /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '‘park’ 검토 확인함', ...opts })).toBeNull();
  });

  it('(e) 영어 병기·이모지 없음, 긴급은 텍스트', async () => {
    setup(mk());
    await screen.findByText('역할 검토 (2)');
    const text = document.body.textContent ?? '';
    for (const w of ['Accept', 'Urgent', 'Developer', 'Designer']) expect(text).not.toContain(w);
    expect(screen.getByText('긴급', { selector: 'span' })).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeNull();
  });

  it('(f) 삭제 버튼이 항상 접근 가능', async () => {
    const { user, calls } = setup(mk(), { 'DELETE /api/v1/tasks/t1/reviews/r1/': () => ({ status: 204 }) });
    const b = await screen.findByRole('button', { name: '‘kim’ 검토 삭제', ...opts });
    expect(b.className).not.toMatch(/opacity-0|invisible|group-hover/);
    await user.click(b);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  it('(g) 연속 제출은 한 번만 POST', async () => {
    const { user, calls } = setup(mk(), {
      'POST /api/v1/tasks/t1/reviews/': () => ({ json: { id: 'r3', role: '개발자', comment: 'x', createdAt: '2026-11-22T00:00:00Z' } }),
    });
    await user.type(await screen.findByLabelText('내용'), 'x');
    const b = screen.getByRole('button', { name: '검토 추가', ...opts });
    await user.dblClick(b);
    await waitFor(() => expect(screen.getByLabelText('내용')).toHaveValue(''));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});
