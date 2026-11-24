import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/integrationsApi', () => ({
  listWatchedRepos: vi.fn(),
  syncPullRequests: vi.fn(),
  formatSyncResult: (r: { created: number }) => `${r.created}개 추가됨`,
}));
vi.mock('../services/taskSync', () => ({
  invalidateTasksCacheHeaders: vi.fn(),
  TASKS_POLL_INTERVAL_MS: 180000,
}));

import { listWatchedRepos, syncPullRequests } from '../services/integrationsApi';
import { usePrSync } from './usePrSync';

const list = vi.mocked(listWatchedRepos);
const sync = vi.mocked(syncPullRequests);
const res = { created: 0, skipped: 0, errors: [] };

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([{ id: 2 } as never]);
  sync.mockResolvedValue(res);
});

describe('usePrSync', () => {
  it('레포 0개면 sync 미호출', async () => {
    list.mockResolvedValue([]);
    renderHook(() => usePrSync({ onCreated: async () => {} }));
    await waitFor(() => expect(list).toHaveBeenCalled());
    await act(async () => {});
    expect(sync).not.toHaveBeenCalled();
  });

  it('동시 2회 호출은 1회로 합쳐진다', async () => {
    const { result } = renderHook(() => usePrSync({ onCreated: async () => {} }));
    await act(async () => {
      await Promise.all([result.current.syncNow(), result.current.syncNow()]);
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('created>0이면 onCreated 호출', async () => {
    sync.mockResolvedValue({ ...res, created: 2 });
    const onCreated = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePrSync({ onCreated }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('syncNow(2)는 repoId 인자, syncNow()는 인자 없이', async () => {
    const { result } = renderHook(() => usePrSync({ onCreated: async () => {} }));
    await act(async () => {});
    sync.mockClear();
    await act(() => result.current.syncNow(2));
    expect(sync).toHaveBeenLastCalledWith(2);
    await act(() => result.current.syncNow());
    expect(sync).toHaveBeenLastCalledWith();
  });

  it('실패 시 error unknown, 성공 시각 유지', async () => {
    const { result } = renderHook(() => usePrSync({ onCreated: async () => {} }));
    await waitFor(() => expect(result.current.status.lastSuccessAt).not.toBeNull());
    const prev = result.current.status.lastSuccessAt;
    sync.mockRejectedValue(new Error('x'));
    await act(() => result.current.syncNow());
    expect(result.current.status.error?.kind).toBe('unknown');
    expect(result.current.status.lastSuccessAt).toBe(prev);
  });
});
