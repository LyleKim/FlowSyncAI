import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/integrationsApi', () => ({ listWatchedRepos: vi.fn() }));
import { listWatchedRepos } from '../services/integrationsApi';
import { useAreaRepos } from './useAreaRepos';

const list = vi.mocked(listWatchedRepos);
beforeEach(() => vi.clearAllMocks());

describe('useAreaRepos', () => {
  it('성공 → ready + repos', async () => {
    list.mockResolvedValue([{ id: 1 } as never]);
    const { result } = renderHook(() => useAreaRepos());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.repos).toHaveLength(1);
  });

  it('실패 → error, retry로 복구', async () => {
    list.mockRejectedValueOnce(new Error('x')).mockResolvedValue([{ id: 1 } as never]);
    const { result } = renderHook(() => useAreaRepos());
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('언마운트 후 늦은 응답은 무시(경고 없음)', async () => {
    let resolve!: (v: never[]) => void;
    list.mockReturnValue(new Promise((r) => (resolve = r)));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => useAreaRepos());
    unmount();
    await act(async () => resolve([]));
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
