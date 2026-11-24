import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { ToastProvider, useToasts } from '../hooks/useToasts';
import { TasksProvider, useTasksContext } from '../hooks/TasksContext';
import { ToastHost } from '../components/common/ToastHost';
import { renderWithRouter } from '../test/render';
import { routeFetch } from '../test/routeFetch';
import type { Task } from '../types';
import TasksScreen from './TasksScreen';

const mk = (o: Partial<Task>): Task => ({
  id: 't1', title: '로그인 버그 수정', description: '', status: 'todo', priority: 'medium',
  category: '', assigneeId: '', subtasks: [], createdAt: '2026-11-20T00:00:00Z', kind: 'manual', ...o,
});
const TASKS = [
  mk({ id: 't1' }),
  mk({ id: 'pr-1', title: '결제 PR', status: 'review', kind: 'pr', createdAt: '2026-11-21T00:00:00Z' }),
  mk({ id: 't2', title: '문서 정리', status: 'done', createdAt: '2026-11-19T00:00:00Z' }),
];

function Wrap({ children }: { children: ReactNode }) {
  const { notify } = useToasts();
  return <TasksProvider notify={notify}>{children}</TasksProvider>;
}
function Probe() {
  const { refresh } = useTasksContext();
  const loc = useLocation();
  return <><button onClick={() => void refresh()}>폴링</button><output data-testid="search">{loc.search}</output></>;
}
const setup = (route = '/tasks', extra: Record<string, () => { status?: number; json?: unknown }> = {}) => {
  const r = routeFetch({ 'GET /api/v1/tasks/': () => ({ json: TASKS }), ...extra });
  return { ...r, ...renderWithRouter(
    <ToastProvider><Wrap><Probe /><TasksScreen /></Wrap><ToastHost /></ToastProvider>, { route }) };
};
afterEach(() => vi.unstubAllGlobals());

describe('TasksScreen', () => {
  it('(a) 상태 라벨은 "리뷰 중"', async () => {
    setup('/tasks?view=board');
    expect(await screen.findByRole('button', { name: /리뷰 중/ })).toBeInTheDocument();
    expect(screen.queryByText('검토 중')).not.toBeInTheDocument();
  });

  it('(b) 목록 기본값, 제목은 링크이고 Enter로 이동 가능한 a 요소', async () => {
    setup();
    expect(screen.getByRole('button', { name: '목록' })).toHaveAttribute('aria-pressed', 'true');
    const link = await screen.findByRole('link', { name: /로그인 버그 수정/ });
    expect(link).toHaveAttribute('href', '/tasks/t1');
    expect(document.querySelectorAll('div[onclick]').length).toBe(0);
    expect(screen.getByRole('link', { name: '새 작업' })).toHaveAttribute('href', '/tasks/new');
  });

  it('(b2) 검색은 제목으로 거른다', async () => {
    const { user } = setup();
    await screen.findByRole('link', { name: /로그인/ });
    await user.type(screen.getByRole('searchbox', { name: '작업 검색' }), '문서');
    expect(screen.queryByRole('link', { name: /로그인/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /문서 정리/ })).toBeInTheDocument();
  });

  it('(c) 보드 포털 카드는 button이고 Enter로 ?status= 가 바뀐다', async () => {
    const { user } = setup('/tasks?view=board');
    const card = await screen.findByRole('button', { name: /리뷰 중/ });
    card.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('search')).toHaveTextContent('status=review');
    expect(screen.queryByRole('link', { name: /로그인/ })).not.toBeInTheDocument();
  });

  it('(d) view 토글이 URL에 반영되고 재렌더해도 유지', async () => {
    const { user, unmount } = setup();
    await user.click(screen.getByRole('button', { name: '보드' }));
    expect(screen.getByTestId('search')).toHaveTextContent('view=board');
    expect(screen.getByRole('button', { name: '보드' })).toHaveAttribute('aria-pressed', 'true');
    unmount();
    setup('/tasks?view=board');
    expect(screen.getByRole('button', { name: '보드' })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each(['list', 'board'])('(e) %s: PR 작업엔 상태 변경 컨트롤 없음, 수동엔 있음', async (view) => {
    setup(`/tasks?view=${view}`);
    await screen.findByRole('link', { name: /로그인/ });
    const manual = screen.getByRole('link', { name: /로그인/ }).closest('[data-row-id]') as HTMLElement;
    const pr = screen.getByRole('link', { name: /결제 PR/ }).closest('[data-row-id]') as HTMLElement;
    expect(within(manual).getByLabelText('상태 변경')).toBeInTheDocument();
    expect(within(pr).queryByLabelText('상태 변경')).not.toBeInTheDocument();
  });

  it('(f) 삭제: 즉시 숨김, 폴링 재수신에도 숨김, 되돌리기로 복귀', async () => {
    const { user } = setup();
    await screen.findByRole('link', { name: /로그인/ });
    await user.click(screen.getByRole('button', { name: /로그인 버그 수정.*삭제/ }));
    expect(screen.queryByRole('link', { name: /로그인/ })).not.toBeInTheDocument();
    expect(screen.getByText('‘로그인 버그 수정’ 작업을 삭제했어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '폴링' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('link', { name: /로그인/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(await screen.findByRole('link', { name: /로그인/ })).toBeInTheDocument();
  });

  it('(g) 상태 이동 실패 시 롤백하고 오류를 알린다', async () => {
    const { user } = setup('/tasks', { 'PATCH /api/v1/tasks/t1/': () => ({ status: 500 }) });
    await screen.findByRole('link', { name: /로그인/ });
    const row = screen.getByRole('link', { name: /로그인/ }).closest('[data-row-id]') as HTMLElement;
    await user.selectOptions(within(row).getByLabelText('상태 변경'), 'done');
    expect(await screen.findByRole('alert')).toHaveTextContent('작업 상태를 변경하지 못했습니다.');
    expect(within(row).getByLabelText('상태 변경')).toHaveValue('todo');
  });
});
