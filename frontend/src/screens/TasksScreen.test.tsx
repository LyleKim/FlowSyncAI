import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { useLocation, useNavigationType } from 'react-router';
import type { ReactNode } from 'react';
import { ToastProvider, UNDO_WINDOW_MS, useToasts } from '../hooks/useToasts';
import { TasksProvider, useTasksContext } from '../hooks/TasksContext';
import type { TasksApi } from '../hooks/useTasks';
import { ToastHost } from '../components/common/ToastHost';
import { AppRoutes } from '../routes';
import { assigneeOptions } from '../lib/taskView';
import { setMyLogin } from '../lib/storage';
import { renderWithRouter } from '../test/render';
import { routeFetch } from '../test/routeFetch';
import type { Task } from '../types';
import { liveRegions } from '../test/live';

// 기본은 실제 Provider. 오류+이전 데이터는 실제 훅으로 만들 수 없어 그 테스트만 값을 덮어쓴다.
const ctx = vi.hoisted(() => ({ override: null as Partial<TasksApi> | null }));
vi.mock('../hooks/TasksContext', async (orig) => {
  const m = await orig<typeof import('../hooks/TasksContext')>();
  return { ...m, useTasksContext: () => { const real = m.useTasksContext(); return ctx.override ? { ...real, ...ctx.override } : real; } };
});

const mk = (o: Partial<Task>): Task => ({
  id: 't1', title: '로그인 버그 수정', description: '', status: 'todo', priority: 'medium',
  category: '', assigneeId: '', subtasks: [], createdAt: '2026-11-20T00:00:00Z', kind: 'manual', ...o,
});
const BASE = [
  mk({ id: 't1' }),
  mk({ id: 'pr-1', title: '결제 PR', status: 'review', kind: 'pr', createdAt: '2026-11-21T00:00:00Z' }),
  mk({ id: 't2', title: '문서 정리', status: 'done', createdAt: '2026-11-19T00:00:00Z' }),
];
let list: Task[] = BASE;
let poll: () => Promise<void> = async () => {};

function Wrap({ children }: { children: ReactNode }) {
  const { notify } = useToasts();
  return <TasksProvider notify={notify}>{children}</TasksProvider>;
}
function Probe() {
  const { refresh } = useTasksContext();
  poll = refresh;
  const loc = useLocation();
  const nav = useNavigationType();
  return <><button onClick={() => void refresh()}>폴링</button><output data-testid="search">{loc.search}</output>
    <output data-testid="loc">{loc.pathname + loc.search}</output><output data-testid="nav">{nav}</output></>;
}
const setup = (route = '/tasks', extra: Record<string, () => { status?: number; json?: unknown }> = {}, tasks: Task[] = BASE) => {
  list = tasks;
  const r = routeFetch({ 'GET /api/v1/tasks/': () => ({ json: list }), ...extra });
  return { ...r, ...renderWithRouter(
    <ToastProvider><Wrap><Probe /><AppRoutes /></Wrap><ToastHost /></ToastProvider>, { route }) };
};
const rowIds = () => [...document.querySelectorAll('[data-row-id]')].map((e) => e.getAttribute('data-row-id'));
const loc = () => screen.getByTestId('loc').textContent;
const listHeading = () => screen.getByRole('heading', { level: 2, name: '작업 목록' });
afterEach(() => { ctx.override = null; vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('TasksScreen', () => {
  it('(a) 상태 라벨은 "리뷰 중"', async () => {
    setup('/tasks?view=board');
    expect(await screen.findByRole('heading', { name: /리뷰 중/ })).toBeInTheDocument();
    expect(screen.queryByText('검토 중')).not.toBeInTheDocument();
  });

  it('(b) 목록 기본값, 제목은 링크이고 Enter로 이동 가능한 a 요소', async () => {
    setup();
    expect(screen.getByRole('button', { name: '목록' })).toHaveAttribute('aria-pressed', 'true');
    const link = await screen.findByRole('link', { name: /로그인 버그 수정/ });
    expect(link).toHaveAttribute('href', '/tasks/t1');
    expect(document.querySelectorAll('[data-row-id]')).toHaveLength(3);
    expect(screen.getByRole('link', { name: '새 작업' })).toHaveAttribute('href', '/tasks/new');
  });

  it('(b2) 검색은 제목으로 거른다', async () => {
    const { user } = setup();
    await screen.findByRole('link', { name: /로그인/ });
    await user.type(screen.getByRole('searchbox', { name: '작업 검색' }), '문서');
    expect(screen.queryByRole('link', { name: /로그인/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /문서 정리/ })).toBeInTheDocument();
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
    expect(within(manual).getByLabelText(/상태 변경/)).toBeInTheDocument();
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

  it('(g) 상태 이동 실패 시 롤백하고 오류를 알리며 행 순서는 그대로', async () => {
    const { user } = setup('/tasks', { 'PATCH /api/v1/tasks/t1/': () => ({ status: 500 }) });
    await screen.findByRole('link', { name: /로그인/ });
    const before = rowIds();
    const row = screen.getByRole('link', { name: /로그인/ }).closest('[data-row-id]') as HTMLElement;
    await user.selectOptions(within(row).getByLabelText(/상태 변경/), 'done');
    expect(await screen.findByRole('alert')).toHaveTextContent('작업 상태를 변경하지 못했습니다.');
    expect(within(row).getByLabelText(/상태 변경/)).toHaveValue('todo');
    expect(rowIds()).toEqual(before);
  });

  describe('지연 DELETE', () => {
    const del = (calls: { method: string; url: string }[]) => calls.filter((c) => c.method === 'DELETE');
    const start = async (extra = {}) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const r = setup('/tasks', { 'DELETE /api/v1/tasks/t1/': () => ({ status: 204 }), ...extra });
      await screen.findByRole('link', { name: /로그인/ });
      await r.user.click(screen.getByRole('button', { name: /로그인 버그 수정.*삭제/ }));
      return r;
    };
    const wait = () => act(async () => { await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100); });

    it('(h) 창이 끝나면 DELETE가 정확히 1회, 그 사이 폴링 재수신에도 숨김', async () => {
      const { calls } = await start();
      expect(del(calls)).toHaveLength(0);
      await act(() => poll());
      expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
      expect(screen.queryByRole('link', { name: /로그인/ })).not.toBeInTheDocument();
      await wait();
      expect(del(calls).map((c) => c.url)).toEqual(['/api/v1/tasks/t1/']);
      expect(screen.queryByRole('link', { name: /로그인/ })).not.toBeInTheDocument();
    });

    it('(i) DELETE가 500이면 행이 돌아오고 오류 알림', async () => {
      await start({ 'DELETE /api/v1/tasks/t1/': () => ({ status: 500 }) });
      await wait();
      expect(await screen.findByRole('link', { name: /로그인/ })).toBeInTheDocument();
      expect(liveRegions('alert')).toHaveLength(1);
    });

    it('(j) 창 안에서 되돌리면 DELETE 없이 행이 돌아온다', async () => {
      const { calls, user } = await start();
      await user.click(screen.getByRole('button', { name: '되돌리기' }));
      await wait();
      expect(del(calls)).toHaveLength(0);
      expect(screen.getByRole('link', { name: /로그인/ })).toBeInTheDocument();
    });
  });

  describe('조립(T-T7)', () => {
    it('(T-a) 기본 진입은 목록, h1 하나, 표 caption, 목록 h2는 tabindex -1', async () => {
      setup();
      await screen.findByRole('link', { name: /로그인/ });
      expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['전체 작업']);
      expect(screen.getByRole('table', { name: '전체 작업 목록' })).toBeInTheDocument();
      expect(listHeading()).toHaveAttribute('tabindex', '-1');
    });

    it('(T-b) ?view=board&kind=pr&status=zzz → 예외 없이 보드·PR만, 상태 칩 없음', async () => {
      setup('/tasks?view=board&kind=pr&status=zzz');
      await screen.findByRole('link', { name: /결제 PR/ });
      expect(rowIds()).toEqual(['pr-1']);
      expect(screen.getByRole('button', { name: '보드' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('group', { name: '상태 필터' })).not.toBeInTheDocument();
    });

    it('(T-b2) 보드는 ?status=를 무시하고 4열을 모두 센다', async () => {
      setup('/tasks?view=board&status=review');
      await screen.findByRole('link', { name: /결제 PR/ });
      const cols = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).filter((t) => t !== '작업 목록');
      expect(cols).toEqual(['할 일 1', '진행 중 0', '리뷰 중 1', '완료 1']);
    });

    it('(T-c) 출처 필터 후 상세로 가도 목록·필터 유지, 닫으면 같은 URL로', async () => {
      const { user } = setup();
      await screen.findByRole('link', { name: /로그인/ });
      await user.selectOptions(screen.getByRole('combobox', { name: '출처' }), 'pr');
      expect(loc()).toBe('/tasks?kind=pr');
      await user.click(screen.getByRole('link', { name: /결제 PR/ }));
      await screen.findByRole('dialog');
      expect(loc()).toBe('/tasks/pr-1?kind=pr');
      expect(rowIds()).toEqual(['pr-1']);
      expect(screen.getByRole('combobox', { name: '출처' })).toHaveValue('pr');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }));
      await waitFor(() => expect(loc()).toBe('/tasks?kind=pr'));
      expect(rowIds()).toEqual(['pr-1']);
    });

    it('(T-d) 담당자 선택지 = assigneeOptions, 로그인 없으면 "나" 없음, 저장 후 "나"는 담당자·작성자 일치만', async () => {
      const tasks = [
        mk({ id: 't1', assigneeId: 'minji-park' }),
        mk({ id: 't2', title: '문서 정리', assigneeId: 'Lee' }),
        mk({ id: 't3', title: '리팩터링', assigneeId: 'lee ' }),
        mk({ id: 'pr-1', title: '결제 PR', kind: 'pr', status: 'review', author: 'minji-park' }),
      ];
      const { user } = setup('/tasks', {}, tasks);
      await screen.findByRole('link', { name: /로그인/ });
      const sel = screen.getByRole('combobox', { name: '담당자' });
      const values = () => within(sel).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
      expect(values()).toEqual(['', 'none', ...assigneeOptions(tasks).map((a) => a.value)]);
      act(() => { setMyLogin('minji-park'); });
      expect(values()).toContain('me');
      await user.selectOptions(sel, 'me');
      expect(rowIds().sort()).toEqual(['pr-1', 't1']);
    });

    it('(T-e) 첫 로드 실패: 서버 오류 하나, 빈 상태 문구 없음, 다시 시도가 refresh', async () => {
      const { user, calls } = setup('/tasks', { 'GET /api/v1/tasks/': () => ({ status: 500 }) });
      expect(await screen.findByText('서버에 연결할 수 없어요')).toBeInTheDocument();
      expect(screen.queryByText('아직 작업이 없어요')).not.toBeInTheDocument();
      expect(liveRegions('alert')).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: '다시 시도' }));
      await waitFor(() => expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2));
    });

    it('(T-e2) 오류인데 이전 데이터가 있으면 안내 하나와 목록을 함께', async () => {
      ctx.override = { loadState: 'error', tasks: BASE };
      setup();
      expect(liveRegions('alert')).toHaveLength(1);
      expect(screen.getByText('아래 목록은 마지막으로 가져온 내용이에요.')).toBeInTheDocument();
      expect(rowIds()).toHaveLength(3);
    });

    it('(T-f) 로딩 중에는 status 안내, 빈 상태 문구 없음', () => {
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      renderWithRouter(<ToastProvider><Wrap><AppRoutes /></Wrap></ToastProvider>, { route: '/tasks' });
      expect(screen.getByText('작업을 불러오는 중이에요').closest('[role="status"]')).not.toBeNull();
      expect(screen.queryByText('아직 작업이 없어요')).not.toBeInTheDocument();
      expect(screen.queryByText('조건에 맞는 작업이 없어요')).not.toBeInTheDocument();
    });

    it('(T-g) 작업 0개 → 전체 빈 상태, 필터 결과 0 → 필터 나열 + 필터 해제로 복구', async () => {
      const { unmount } = setup('/tasks', {}, []);
      expect(await screen.findByText('아직 작업이 없어요')).toBeInTheDocument();
      expect(screen.queryByText('조건에 맞는 작업이 없어요')).not.toBeInTheDocument();
      unmount();
      const { user } = setup('/tasks?q=없는검색어&kind=manual');
      expect(await screen.findByText('조건에 맞는 작업이 없어요')).toBeInTheDocument();
      expect(screen.getByText('검색어 “없는검색어”')).toBeInTheDocument();
      expect(screen.getByText('출처 직접 만든 작업')).toBeInTheDocument();
      const clears = screen.getAllByRole('button', { name: '필터 해제' });
      await user.click(clears[clears.length - 1]);
      expect(loc()).toBe('/tasks');
      expect(rowIds()).toHaveLength(3);
    });

    it('(T-g2) 검색 입력은 history를 쌓지 않는다(replace), 다른 필터는 push', async () => {
      const { user } = setup();
      await screen.findByRole('link', { name: /로그인/ });
      await user.selectOptions(screen.getByRole('combobox', { name: '출처' }), 'manual');
      expect(screen.getByTestId('nav')).toHaveTextContent('PUSH');
      await user.type(screen.getByRole('searchbox', { name: '작업 검색' }), '문서');
      expect(loc()).toBe('/tasks?q=%EB%AC%B8%EC%84%9C&kind=manual');
      expect(screen.getByTestId('nav')).toHaveTextContent('REPLACE');
    });

    it('(T-j) 포커스된 행이 폴링 갱신으로 사라지면 h2로 포커스', async () => {
      setup();
      (await screen.findByRole('link', { name: /로그인/ })).focus();
      list = BASE.filter((t) => t.id !== 't1');
      await act(() => poll());
      expect(rowIds()).not.toContain('t1');
      expect(document.activeElement).toBe(listHeading());
    });

    it('(T-j2) 딥링크로 연 상세를 닫으면 필터를 유지한 목록으로, 포커스는 h2', async () => {
      const { user } = setup('/tasks/t1?kind=manual');
      const d = await screen.findByRole('dialog');
      await user.click(within(d).getByRole('button', { name: '닫기' }));
      await waitFor(() => expect(loc()).toBe('/tasks?kind=manual'));
      expect(document.activeElement).toBe(listHeading());
    });

    it('(T-j3) 목록에서 연 상세에서 삭제하면 검색 유지·행 숨김·포커스는 h2', async () => {
      const { user } = setup('/tasks?kind=manual');
      await user.click(await screen.findByRole('link', { name: /로그인/ }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '작업 삭제' }));
      await waitFor(() => expect(loc()).toBe('/tasks?kind=manual'));
      expect(rowIds()).toEqual(['t2']);
      expect(document.activeElement).toBe(listHeading());
    });

    it('(T-k) 보드로 바꾸면 status가 지워지고 목록으로 돌아오면 칩이 돌아온다', async () => {
      const { user } = setup('/tasks?status=todo');
      await screen.findByRole('link', { name: /로그인/ });
      expect(screen.getByRole('button', { name: /^할 일/ })).toHaveAttribute('aria-pressed', 'true');
      await user.click(screen.getByRole('button', { name: '보드' }));
      expect(loc()).toBe('/tasks?view=board');
      expect(screen.queryByRole('group', { name: '상태 필터' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '목록' }));
      expect(screen.getByRole('group', { name: '상태 필터' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^전체/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('(T-k2) 상태 칩 개수는 상태를 뺀 필터 기준', async () => {
      setup('/tasks?status=done&kind=manual');
      await screen.findByRole('link', { name: /문서 정리/ });
      const chips = within(screen.getByRole('group', { name: '상태 필터' })).getAllByRole('button').map((b) => b.textContent);
      expect(chips).toEqual(['전체 2', '할 일 1', '진행 중 0', '리뷰 중 0', '완료 1']);
      expect(rowIds()).toEqual(['t2']);
    });

    it('(T-l) 200건을 행 200개로 렌더한다(구조 단언, 시간 임계값 없음)', async () => {
      const many = Array.from({ length: 200 }, (_, i) => mk({ id: `m${i}`, title: `작업 ${i}`, createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString() }));
      setup('/tasks', {}, many);
      await screen.findByRole('link', { name: '작업 199' });
      expect(rowIds()).toHaveLength(200);
      expect(rowIds()[0]).toBe('m199'); // 기본 정렬: 생성 최신순
    });
  });
});
