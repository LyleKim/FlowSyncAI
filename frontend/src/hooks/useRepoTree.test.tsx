import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRepoTree } from './useRepoTree';

describe('useRepoTree', () => {
  it('읽기·다시 읽기, 실패해도 같은 레포의 직전 트리는 유지, null이면 idle', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ root: { path: '' }, treeHash: 'a' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'github_unavailable' }), { status: 502 }));
    vi.stubGlobal('fetch', f);
    const { result, rerender } = renderHook(({ id }) => useRepoTree(id), { initialProps: { id: 1 as number | null } });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error?.code).toBe('github_unavailable'));
    expect(result.current.data?.treeHash).toBe('a');
    rerender({ id: null });
    expect(result.current.status).toBe('idle');
    vi.unstubAllGlobals();
  });
});
