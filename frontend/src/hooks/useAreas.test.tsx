import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../services/areasApi', async () => {
  const actual = await vi.importActual<typeof import('../services/areasApi')>('../services/areasApi');
  return { ...actual, fetchAreas: vi.fn(), fetchAreaAliases: vi.fn() };
});
import { AreasApiError, fetchAreaAliases, fetchAreas } from '../services/areasApi';
import { REFRESH_COOLDOWN_MS, useAreas } from './useAreas';

const fetchA = vi.mocked(fetchAreas);
const aliases = vi.mocked(fetchAreaAliases);
const resp = (repoId: number, days = 30) => ({ repoId, days, areas: [] }) as never;
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchA.mockImplementation(async (r, d) => resp(r, d));
  aliases.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('useAreas', () => {
  it('(a) 첫 성공 → ready', async () => {
    const { result } = renderHook(() => useAreas(1, 30));
    expect(result.current.status).toBe('loading');
    await flush();
    expect(result.current.status).toBe('ready');
    expect(result.current.data?.repoId).toBe(1);
    expect(result.current.stale).toBe(false);
  });

  it('(b) days 변경 시 즉시 data null · loading', async () => {
    const { result, rerender } = renderHook(({ d }) => useAreas(1, d), { initialProps: { d: 30 } });
    await flush();
    rerender({ d: 90 });
    expect(result.current.data).toBeNull();
    expect(result.current.status).toBe('loading');
    await flush();
    expect(result.current.data?.days).toBe(90);
  });

  it('(c) 느린 A 응답이 B 뒤에 와도 B 유지', async () => {
    let resolveA!: (v: never) => void;
    let sigA: AbortSignal | undefined;
    fetchA.mockImplementation((r, d, o) => {
      if (r !== 1) return Promise.resolve(resp(r, d));
      sigA = o?.signal;
      return new Promise((res) => (resolveA = res));
    });
    const { result, rerender } = renderHook(({ r }) => useAreas(r, 30), { initialProps: { r: 1 } });
    rerender({ r: 2 });
    await flush();
    expect(result.current.data?.repoId).toBe(2);
    expect(sigA?.aborted).toBe(true);
    await act(async () => resolveA(resp(1)));
    expect(result.current.data?.repoId).toBe(2);
  });

  it('(d) 성공 뒤 재요청 실패 → data 유지·stale·code 보존', async () => {
    const { result } = renderHook(() => useAreas(1, 30));
    await flush();
    fetchA.mockRejectedValue(new AreasApiError('깃허브', 502, 'github_unavailable'));
    await act(async () => {
      result.current.refresh();
    });
    expect(result.current.data).not.toBeNull();
    expect(result.current.stale).toBe(true);
    expect(result.current.error?.code).toBe('github_unavailable');
    expect(result.current.status).toBe('ready');
  });

  it('(e) 첫 요청 502 → data null · error', async () => {
    fetchA.mockRejectedValue(new AreasApiError('깃허브', 502, 'github_unavailable'));
    const { result } = renderHook(() => useAreas(1, 30));
    await flush();
    expect(result.current.data).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('github_unavailable');
  });

  it('(f) refresh 연타 3회 → 추가 호출 1회, 30초 후 canRefresh', async () => {
    const { result } = renderHook(() => useAreas(1, 30));
    await flush();
    expect(result.current.canRefresh).toBe(true);
    await act(async () => {
      result.current.refresh();
      result.current.refresh();
      result.current.refresh();
    });
    expect(fetchA).toHaveBeenCalledTimes(2);
    expect(fetchA.mock.calls[1][2]).toMatchObject({ refresh: true });
    expect(result.current.canRefresh).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_COOLDOWN_MS);
    });
    expect(result.current.canRefresh).toBe(true);
  });

  it('(f2) 진행 중 refresh()는 요청을 만들지 않는다', async () => {
    fetchA.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useAreas(1, 30));
    await flush();
    await act(async () => result.current.refresh());
    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(result.current.canRefresh).toBe(false);
  });

  it('(g2) 이후 별칭 실패는 직전 목록 유지 + aliasesFailed', async () => {
    const al = [{ id: 1 }] as never;
    aliases.mockResolvedValueOnce(al);
    const { result } = renderHook(() => useAreas(1, 30));
    await flush();
    aliases.mockRejectedValue(new Error('x'));
    await act(async () => {
      vi.advanceTimersByTime(0);
      result.current.refresh();
    });
    expect(result.current.aliases).toBe(al);
    expect(result.current.aliasesFailed).toBe(true);
  });

  it('(g) 별칭 reject → aliasesFailed · ready', async () => {
    aliases.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useAreas(1, 30));
    await flush();
    expect(result.current.aliasesFailed).toBe(true);
    expect(result.current.status).toBe('ready');
  });

  it('(h) repoId null → idle · fetch 없음', async () => {
    const { result } = renderHook(() => useAreas(null, 30));
    await flush();
    expect(result.current.status).toBe('idle');
    expect(fetchA).not.toHaveBeenCalled();
  });

  it('(j) 실패 후 다시 시도: 진행 중 pending, 실패마다 failSeq 증가', async () => {
    fetchA.mockRejectedValue(new AreasApiError('깃허브', 502, 'github_unavailable'));
    const { result } = renderHook(() => useAreas(1, 30));
    await flush();
    expect(result.current.pending).toBe(false);
    expect(result.current.failSeq).toBe(1);
    let reject!: (e: unknown) => void;
    fetchA.mockImplementation(() => new Promise((_, rej) => (reject = rej)));
    await act(async () => result.current.refresh());
    expect(result.current.pending).toBe(true);
    expect(result.current.status).toBe('error');
    await act(async () => reject(new AreasApiError('깃허브', 502, 'github_unavailable')));
    expect(result.current.pending).toBe(false);
    expect(result.current.failSeq).toBe(2);
  });

  it('(i) 언마운트 시 abort', async () => {
    let sig: AbortSignal | undefined;
    fetchA.mockImplementation((_r, _d, o) => {
      sig = o?.signal;
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useAreas(1, 30));
    unmount();
    expect(sig?.aborted).toBe(true);
  });
});
