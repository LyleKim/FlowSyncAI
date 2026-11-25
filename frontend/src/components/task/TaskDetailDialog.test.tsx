import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router';
import type { ReactNode } from 'react';
import { ToastProvider, useToasts } from '../../hooks/useToasts';
import { TasksProvider, useTasksContext } from '../../hooks/TasksContext';
import { ToastHost } from '../common/ToastHost';
import AppShell from '../layout/AppShell';
import { AppRoutes } from '../../routes';
import { renderWithRouter } from '../../test/render';
import { routeFetch } from '../../test/routeFetch';
import type { Task } from '../../types';

const mk = (o: Partial<Task>): Task => ({
  id: 't1', title: '로그인 버그 수정', description: '원래 설명', status: 'todo', priority: 'medium',
  category: '', assigneeId: 'lee', subtasks: [], createdAt: '2026-11-20T00:00:00Z', kind: 'manual', ...o,
});
const PR = mk({ id: 'pr-1', title: '결제 PR', kind: 'pr', assigneeId: '', author: 'octocat', sourceUrl: 'https://github.com/a/b/pull/1' });

function Wrap({ children }: { children: ReactNode }) {
  const { notify } = useToasts();
  return <TasksProvider notify={notify}>{children}</TasksProvider>;
}
function Probe() {
  const { refresh } = useTasksContext();
  const loc = useLocation();
  const nav = useNavigate();
  return <><button onClick={() => void refresh()}>폴링</button>
    <button onClick={() => nav('/tasks/없는1')}>없는1로</button><button onClick={() => nav('/tasks/없는2')}>없는2로</button><output data-testid="loc">{loc.pathname + loc.search}</output></>;
}

let list: Task[] = [];
const setup = (route: string, extra: Parameters<typeof routeFetch>[0] = {}) => {
  list = [mk({}), PR];
  const r = routeFetch({ 'GET /api/v1/tasks/': () => ({ json: list }), ...extra });
  return { ...r, ...renderWithRouter(
    <ToastProvider><Wrap><Probe /><AppShell><AppRoutes /></AppShell></Wrap><ToastHost /></ToastProvider>, { route }) };
};
const loc = () => screen.getByTestId('loc').textContent;
afterEach(() => vi.unstubAllGlobals());

describe('TaskDetailDialog', () => {
  it('(a) /tasks/t1: 대화상자 이름은 작업 제목, 포커스는 제목', async () => {
    setup('/tasks/t1');
    const d = await screen.findByRole('dialog', { name: '로그인 버그 수정' });
    expect(document.activeElement).toBe(within(d).getByRole('heading', { name: '로그인 버그 수정' }));
    expect(within(d).getByText('원래 설명')).toBeInTheDocument();
    expect(within(d).getByText('담당자')).toBeInTheDocument();
  });

  it('(b) Esc로 닫히고 포커스가 열었던 목록 링크로, 목록 검색 유지', async () => {
    const { user } = setup('/tasks?status=todo');
    const link = await screen.findByRole('link', { name: '로그인 버그 수정' });
    await user.click(link);
    const d = await screen.findByRole('dialog');
    fireEvent(d, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(loc()).toBe('/tasks?status=todo'));
    expect(document.activeElement).toBe(link);
  });

  it('(c) 상태 select 변경은 대화상자를 닫지 않는다', async () => {
    const { user, calls } = setup('/tasks/t1', { 'PATCH /api/v1/tasks/t1/': () => ({ json: {} }) });
    const d = await screen.findByRole('dialog');
    await user.selectOptions(within(d).getByLabelText('상태'), 'done');
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(d).getByLabelText('상태')).toHaveValue('done');
  });

  it('(d) PR 작업: 상태 select·작업 삭제 없음, 완료 처리만, 작성자 표시', async () => {
    const { user, calls } = setup('/tasks/pr-1', { 'PATCH /api/v1/tasks/pr-1/': () => ({ json: {} }) });
    const d = await screen.findByRole('dialog', { name: '결제 PR' });
    expect(within(d).queryByLabelText('상태')).not.toBeInTheDocument();
    expect(within(d).queryByRole('combobox', { name: /상태/ })).not.toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /삭제/ })).not.toBeInTheDocument();
    expect(within(d).getByText('작성자')).toBeInTheDocument();
    expect(within(d).getByText('octocat')).toBeInTheDocument();
    await user.click(within(d).getByRole('button', { name: '‘결제 PR’ 완료 처리' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')!.url).toContain('/api/v1/tasks/pr-1/');
    await waitFor(() => expect(within(d).queryByRole('button', { name: /완료 처리/ })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('‘결제 PR’을 완료로 옮겼어요')).toHaveLength(1);
    expect(document.activeElement).toBe(d.querySelector('[data-status-control="pr-1"]'));
  });

  it('(e) 삭제: 되돌리기 토스트 + 목록 검색을 유지한 채 이동, 목록에서 숨김', async () => {
    const { user } = setup('/tasks?q=로그인');
    await user.click(await screen.findByRole('link', { name: '로그인 버그 수정' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '작업 삭제' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('‘로그인 버그 수정’ 작업을 삭제했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
    await waitFor(() => expect(loc()).toBe('/tasks?q=로그인'));
    expect(screen.queryByRole('link', { name: '로그인 버그 수정' })).not.toBeInTheDocument();
  });

  it('(f) 로드 후 없는 id: 안내 + /tasks로 replace, 포커스는 main', async () => {
    setup('/tasks/없는id');
    expect(await screen.findByText('작업을 찾을 수 없어요. 이미 삭제됐을 수 있어요.')).toBeInTheDocument();
    await waitFor(() => expect(loc()).toBe('/tasks')); // 라우터 이동은 transition이라 알림보다 늦을 수 있다
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('(f2) 열어 둔 작업이 폴링으로 사라지면 안내 + 목록으로', async () => {
    const { user } = setup('/tasks/t1');
    await screen.findByRole('dialog');
    list = [PR];
    await user.click(screen.getByRole('button', { name: '폴링' }));
    expect(await screen.findByText('작업을 찾을 수 없어요. 이미 삭제됐을 수 있어요.')).toBeInTheDocument();
    await waitFor(() => expect(loc()).toBe('/tasks')); // 라우터 이동은 transition이라 알림보다 늦을 수 있다
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('(g) 폴링으로 제목이 바뀌어도 편집 중인 설명은 유지', async () => {
    const { user } = setup('/tasks/t1');
    const d = await screen.findByRole('dialog');
    await user.click(within(d).getByRole('button', { name: '정보 수정' }));
    const desc = within(d).getByLabelText('설명');
    await user.clear(desc);
    await user.type(desc, '작성 중인 설명');
    list = [mk({ title: '서버가 바꾼 제목' }), PR];
    await user.click(screen.getByRole('button', { name: '폴링' }));
    expect(await screen.findByRole('dialog', { name: '서버가 바꾼 제목' })).toBeInTheDocument();
    expect(within(d).getByLabelText('설명')).toHaveValue('작성 중인 설명');
  });

  it('(h) 필수 제목을 비우고 저장하면 aria-invalid + 설명 연결', async () => {
    const { user, calls } = setup('/tasks/t1');
    const d = await screen.findByRole('dialog');
    await user.click(within(d).getByRole('button', { name: '정보 수정' }));
    const title = within(d).getByLabelText(/제목/);
    await user.clear(title);
    await user.click(within(d).getByRole('button', { name: '저장' }));
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('제목을 입력해 주세요.');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    // 오류는 알리고 포커스는 제목 입력으로
    expect(title).toHaveFocus();
    expect(within(d).getByRole('alert')).toHaveTextContent('제목을 입력해 주세요.');
    await user.click(within(d).getByRole('button', { name: '저장' }));
    expect(title).toHaveFocus();
  });

  it('(f3) 같은 대화상자에서 없는 id를 두 번 만나도 매번 안내하고 돌아간다', async () => {
    const { user } = setup('/tasks/t1');
    await screen.findByRole('dialog', { name: '로그인 버그 수정' });
    await user.click(screen.getByRole('button', { name: '없는1로', hidden: true }));
    await waitFor(() => expect(loc()).toBe('/tasks/t1'));
    expect(screen.getAllByText('작업을 찾을 수 없어요. 이미 삭제됐을 수 있어요.')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '없는2로', hidden: true }));
    await waitFor(() => expect(screen.getAllByText('작업을 찾을 수 없어요. 이미 삭제됐을 수 있어요.')).toHaveLength(2));
    await waitFor(() => expect(loc()).toBe('/tasks/t1'));
  });

  it('(i) /tasks/new: "새 작업", 체크리스트·역할 검토 없음, 만들면 새 id로 replace', async () => {
    const created = mk({ id: 't9', title: '새로 만든 작업' });
    const { user, calls } = setup('/tasks/new', { 'POST /api/v1/tasks/': () => ({ status: 201, json: created }) });
    const d = await screen.findByRole('dialog', { name: '새 작업' });
    expect(within(d).queryByText(/체크리스트|역할 검토/)).not.toBeInTheDocument();
    await user.type(within(d).getByLabelText(/제목/), '새로 만든 작업');
    await user.click(within(d).getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(loc()).toBe('/tasks/t9'));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ title: '새로 만든 작업', status: 'todo' });
    expect(await screen.findByRole('dialog', { name: '새로 만든 작업' })).toBeInTheDocument();
  });
});
