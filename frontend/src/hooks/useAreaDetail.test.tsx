import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/areasApi', async () => {
  const actual = await vi.importActual<typeof import('../services/areasApi')>('../services/areasApi');
  return { ...actual, fetchAreaDetail: vi.fn() };
});
import { AreasApiError, fetchAreaDetail } from '../services/areasApi';
import { useAreaDetail } from './useAreaDetail';

const fetchD = vi.mocked(fetchAreaDetail);
const detail = (id: string) => ({ id }) as never;
beforeEach(() => vi.clearAllMocks());

describe('useAreaDetail', () => {
  it('성공 → ready', async () => {
    fetchD.mockResolvedValue(detail('a'));
    const { result } = renderHook(() => useAreaDetail(1, 'a', 30));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data?.id).toBe('a');
  });

  it('404 area_not_found → gone', async () => {
    fetchD.mockRejectedValue(new AreasApiError('없음', 404, 'area_not_found'));
    const { result } = renderHook(() => useAreaDetail(1, 'a', 30));
    await waitFor(() => expect(result.current.status).toBe('gone'));
  });

  it('500 → error, retry 재호출', async () => {
    fetchD.mockRejectedValueOnce(new AreasApiError('boom', 500, null)).mockResolvedValue(detail('a'));
    const { result } = renderHook(() => useAreaDetail(1, 'a', 30));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.status).toBe(500);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchD).toHaveBeenCalledTimes(2);
  });

  it('areaId 변경 시 이전 데이터 즉시 비움', async () => {
    fetchD.mockImplementation(async (_r, id) => detail(id));
    const { result, rerender } = renderHook(({ id }) => useAreaDetail(1, id, 30), {
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ id: 'b' });
    expect(result.current.data).toBeNull();
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.data?.id).toBe('b'));
  });

  it('언마운트 시 abort', async () => {
    let sig: AbortSignal | undefined;
    fetchD.mockImplementation((_r, _a, _d, s) => {
      sig = s;
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useAreaDetail(1, 'a', 30));
    unmount();
    expect(sig?.aborted).toBe(true);
  });
});
