import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../services/reviewQueueApi', async () => {
  const actual = await vi.importActual<typeof import('../services/reviewQueueApi')>('../services/reviewQueueApi');
  return { ...actual, fetchReviewQueue: vi.fn() };
});
const syncNow = vi.hoisted(() => vi.fn());
vi.mock('./PrSyncContext', () => ({ usePrSyncContext: () => ({ syncNow }) }));
const me = vi.hoisted(() => ({ login: null as string | null, teams: [] as string[] }));
vi.mock('./useMyLogin', () => ({
  useMyLogin: () => ({ login: me.login }),
  useMyTeams: () => ({ teams: me.teams }),
}));

import { fetchReviewQueue, QueueFetchError } from '../services/reviewQueueApi';
import { TASKS_POLL_INTERVAL_MS } from '../services/taskSync';
import { makeQueue, makeQueueItem } from '../test/fixtures/reviewQueue';
import type { ReviewQueueResponse } from '../types/reviewQueue';
import { useReviewQueue } from './useReviewQueue';
import { ReviewQueueProvider, useReviewQueueContext } from './ReviewQueueContext';
import { useReviewBadge } from './useReviewBadge';

const fetchQ = vi.mocked(fetchReviewQueue);
const flush = () => act(async () => {});
const q = (login: string, items = [makeQueueItem()]) => makeQueue({ login, items });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  fetchQ.mockImplementation(async (p) => q(p.login));
  syncNow.mockResolvedValue(undefined);
  me.login = null;
  me.teams = [];
});
afterEach(() => vi.useRealTimers());

describe('useReviewQueue', () => {
  it('(a) 첫 로드 성공 loading → ready', async () => {
    const { result } = renderHook(() => useReviewQueue('a'));
    expect(result.current.loadState).toBe('loading');
    await flush();
    expect(result.current.loadState).toBe('ready');
    expect(result.current.data?.login).toBe('a');
    expect(fetchQ).toHaveBeenCalledWith({ login: 'a', teams: undefined }, expect.any(AbortSignal));
  });

  it('(a2) 팀을 그대로 넘긴다', async () => {
    renderHook(() => useReviewQueue('a', ['acme/web']));
    await flush();
    expect(fetchQ.mock.calls[0][0]).toEqual({ login: 'a', teams: ['acme/web'] });
  });

  it('(b) 첫 로드 실패 → error, data null', async () => {
    fetchQ.mockRejectedValue(new QueueFetchError('server', '서버 오류', 500));
    const { result } = renderHook(() => useReviewQueue('a'));
    await flush();
    expect(result.current.loadState).toBe('error');
    expect(result.current.data).toBeNull();
    expect(result.current.loadError?.kind).toBe('server');
  });

  it('(c) 성공 후 refresh 실패 → data 유지, refreshError, 다음 성공에서 해제', async () => {
    const { result } = renderHook(() => useReviewQueue('a'));
    await flush();
    const first = result.current.data;
    fetchQ.mockRejectedValueOnce(new QueueFetchError('network', 'x'));
    await act(() => result.current.refresh());
    expect(result.current.data).toBe(first);
    expect(result.current.refreshError?.kind).toBe('network');
    expect(result.current.loadError).toBeNull();
    expect(result.current.loadState).toBe('ready');
    expect(result.current.refreshing).toBe(false);
    await act(() => result.current.refresh());
    expect(result.current.refreshError).toBeNull();
  });

  it('(d) refresh는 syncNow 후 GET, syncNow 실패해도 GET', async () => {
    const { result } = renderHook(() => useReviewQueue('a'));
    await flush();
    fetchQ.mockClear();
    const order: string[] = [];
    syncNow.mockImplementation(async () => {
      order.push('sync');
      throw new Error('sync 실패');
    });
    fetchQ.mockImplementation(async (p) => (order.push('get'), q(p.login)));
    await act(() => result.current.refresh());
    expect(order).toEqual(['sync', 'get']);
    expect(syncNow).toHaveBeenCalledWith();
  });

  it('(e) refresh 동시 2회 → syncNow 1회, GET 1회, refreshing 동안 true', async () => {
    const { result } = renderHook(() => useReviewQueue('a'));
    await flush();
    fetchQ.mockClear();
    const s = deferred<void>();
    syncNow.mockReturnValue(s.promise);
    let p1!: Promise<void>, p2!: Promise<void>;
    act(() => {
      p1 = result.current.refresh();
      p2 = result.current.refresh();
    });
    expect(result.current.refreshing).toBe(true);
    s.resolve();
    await act(() => Promise.all([p1, p2]));
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(fetchQ).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });

  it('(f) a 요청 중 b로 바뀌면 a의 늦은 응답은 무시되고 a의 신호는 취소된다', async () => {
    const a = deferred<ReviewQueueResponse>();
    fetchQ.mockImplementation((p) => (p.login === 'a' ? a.promise : Promise.resolve(q(p.login))));
    const { result, rerender } = renderHook(({ l }) => useReviewQueue(l), { initialProps: { l: 'a' } });
    const sigA = fetchQ.mock.calls[0][1]!;
    rerender({ l: 'b' });
    await flush();
    expect(sigA.aborted).toBe(true);
    expect(result.current.data?.login).toBe('b');
    a.resolve(q('a'));
    await flush();
    expect(result.current.data?.login).toBe('b');
  });

  it('(f2) 취소된 a의 늦은 실패도 b 상태를 건드리지 않는다', async () => {
    const a = deferred<ReviewQueueResponse>();
    fetchQ.mockImplementation((p) => (p.login === 'a' ? a.promise : Promise.resolve(q(p.login))));
    const { result, rerender } = renderHook(({ l }) => useReviewQueue(l), { initialProps: { l: 'a' } });
    rerender({ l: 'b' });
    await flush();
    a.reject(new QueueFetchError('server', 'x', 500));
    await flush();
    expect(result.current.loadState).toBe('ready');
    expect(result.current.refreshError).toBeNull();
  });

  it('(g) login null → idle, 요청 0회', async () => {
    const { result } = renderHook(() => useReviewQueue(null));
    await act(() => result.current.refresh());
    await act(() => vi.advanceTimersByTimeAsync(TASKS_POLL_INTERVAL_MS));
    expect(result.current.loadState).toBe('idle');
    expect(fetchQ).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('(h) 3분마다 reload 1회, 숨김이면 0회', async () => {
    renderHook(() => useReviewQueue('a'));
    await flush();
    fetchQ.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(TASKS_POLL_INTERVAL_MS));
    expect(fetchQ).toHaveBeenCalledTimes(1);
    expect(syncNow).not.toHaveBeenCalled();
    hidden = true;
    await act(() => vi.advanceTimersByTimeAsync(TASKS_POLL_INTERVAL_MS));
    expect(fetchQ).toHaveBeenCalledTimes(1);
  });

  it('(i) retryRepo(2) → syncNow(2) 후 GET, 그동안 retryingRepoId 2', async () => {
    const { result } = renderHook(() => useReviewQueue('a'));
    await flush();
    fetchQ.mockClear();
    const s = deferred<void>();
    syncNow.mockReturnValue(s.promise);
    let p!: Promise<void>;
    act(() => {
      p = result.current.retryRepo(2);
    });
    expect(syncNow).toHaveBeenCalledWith(2);
    expect(result.current.retryingRepoId).toBe(2);
    expect(fetchQ).not.toHaveBeenCalled();
    s.resolve();
    await act(() => p);
    expect(fetchQ).toHaveBeenCalledTimes(1);
    expect(result.current.retryingRepoId).toBeNull();
  });

  it('(f3) syncNow 대기 중 a → b로 바뀌어도 b의 로드가 취소되지 않고 a로 GET하지 않는다', async () => {
    const b = deferred<ReviewQueueResponse>();
    fetchQ.mockImplementation((p) => (p.login === 'b' ? b.promise : Promise.resolve(q(p.login))));
    const { result, rerender } = renderHook(({ l }) => useReviewQueue(l), { initialProps: { l: 'a' } });
    await flush();
    const s = deferred<void>();
    syncNow.mockReturnValue(s.promise);
    let p!: Promise<void>;
    act(() => {
      p = result.current.refresh();
    });
    fetchQ.mockClear();
    rerender({ l: 'b' });
    s.resolve();
    await act(() => p);
    b.resolve(q('b'));
    await flush();
    expect(fetchQ.mock.calls.map((c) => c[0].login)).toEqual(['b']);
    expect(result.current.loadState).toBe('ready');
    expect(result.current.data?.login).toBe('b');
  });

  it('retryRepo가 겹치면 먼저 끝난 쪽이 retryingRepoId를 지우지 않는다', async () => {
    const { result } = renderHook(() => useReviewQueue('a'));
    await flush();
    const s1 = deferred<void>();
    const s2 = deferred<void>();
    syncNow.mockReturnValueOnce(s1.promise).mockReturnValueOnce(s2.promise);
    let p1!: Promise<void>, p2!: Promise<void>;
    act(() => {
      p1 = result.current.retryRepo(1);
      p2 = result.current.retryRepo(2);
    });
    s1.resolve();
    await act(() => p1);
    expect(result.current.retryingRepoId).toBe(2);
    s2.resolve();
    await act(() => p2);
    expect(result.current.retryingRepoId).toBeNull();
  });

  it('언마운트하면 진행 중 요청을 취소하고 폴링을 멈춘다', async () => {
    fetchQ.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useReviewQueue('a'));
    const sig = fetchQ.mock.calls[0][1]!;
    unmount();
    expect(sig.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(TASKS_POLL_INTERVAL_MS));
    expect(fetchQ).toHaveBeenCalledTimes(1);
  });
});

describe('(j) ReviewQueueProvider · useReviewBadge', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <ReviewQueueProvider>{children}</ReviewQueueProvider>;

  it('Provider가 없으면 undefined (R8)', () => {
    const { result } = renderHook(() => useReviewBadge());
    expect(result.current).toBeUndefined();
  });

  it('로그인 없음 → undefined', async () => {
    const { result } = renderHook(() => useReviewBadge(), { wrapper });
    await flush();
    expect(result.current).toBeUndefined();
    expect(fetchQ).not.toHaveBeenCalled();
  });

  it('대기 3건(초안 1건 포함) → 2, 대기 0 → undefined', async () => {
    me.login = 'a';
    fetchQ.mockResolvedValue(
      q('a', [
        makeQueueItem({ id: '1' }),
        makeQueueItem({ id: '2' }),
        makeQueueItem({ id: '3', isDraft: true }),
        makeQueueItem({ id: '4', group: 'awaiting_author' }),
      ]),
    );
    const { result } = renderHook(() => useReviewBadge(), { wrapper });
    await flush();
    expect(result.current).toBe(2);

    fetchQ.mockResolvedValue(q('a', [makeQueueItem({ group: 'closed', closedReason: 'merged' })]));
    const other = renderHook(() => useReviewBadge(), { wrapper });
    await flush();
    expect(other.result.current).toBeUndefined();
  });

  it('로그인 a → b 변경 시 a의 숫자가 남지 않는다', async () => {
    me.login = 'a';
    const b = deferred<ReviewQueueResponse>();
    fetchQ.mockImplementation((p) => (p.login === 'a' ? Promise.resolve(q('a')) : b.promise));
    const { result, rerender } = renderHook(() => useReviewBadge(), { wrapper });
    await flush();
    expect(result.current).toBe(1);
    me.login = 'b';
    rerender();
    expect(result.current).toBeUndefined();
    b.resolve(q('b', [makeQueueItem({ id: 'x' }), makeQueueItem({ id: 'y' })]));
    await flush();
    expect(result.current).toBe(2);
  });

  it('Provider 하나에서 화면과 배지가 GET 1회를 공유한다 (R9)', async () => {
    me.login = 'a';
    function Screen() {
      const { data, login } = useReviewQueueContext();
      return <p>{`${login}:${data?.items.length ?? '-'}`}</p>;
    }
    function Badge() {
      return <span>{`badge:${useReviewBadge() ?? '-'}`}</span>;
    }
    render(
      <ReviewQueueProvider>
        <Screen />
        <Badge />
      </ReviewQueueProvider>,
    );
    await flush();
    expect(screen.getByText('a:1')).toBeInTheDocument();
    expect(screen.getByText('badge:1')).toBeInTheDocument();
    expect(fetchQ).toHaveBeenCalledTimes(1);
  });

  it('Provider가 값 변화 없이 리렌더되면 소비자는 다시 그려지지 않는다(PrSync 상태 변화 등)', async () => {
    me.login = 'a';
    let renders = 0;
    function Consumer() {
      useReviewQueueContext();
      renders++;
      return null;
    }
    const child = <Consumer />;
    const { rerender } = render(<ReviewQueueProvider>{child}</ReviewQueueProvider>);
    await flush();
    const before = renders;
    rerender(<ReviewQueueProvider>{child}</ReviewQueueProvider>);
    expect(renders).toBe(before);
  });
});
