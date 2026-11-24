import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTasks } from './useTasks';
import type { Task } from '../types';

const mk = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, description: '', status: 'todo', priority: 'medium', category: '', assigneeId: '',
  subtasks: [], createdAt: '2026-01-01T00:00:00Z', roleReviews: [], ...over,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
const setup = (list: Task[] = [mk('a'), mk('b')]) => {
  fetchMock.mockImplementationOnce(async () => json(list));
  const notify = vi.fn();
  const hook = renderHook(() => useTasks({ notify }));
  return { notify, ...hook };
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useTasks', () => {
  it('(a) moveTask 500이면 롤백·notify 1회·ok:false', async () => {
    const { result, notify } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockResolvedValueOnce(json({}, 500));
    let r: Awaited<ReturnType<typeof result.current.moveTask>>;
    await act(async () => { r = await result.current.moveTask('a', 'done'); });
    expect(r!.ok).toBe(false);
    expect(result.current.tasks.find((t) => t.id === 'a')!.status).toBe('todo');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('(b) moveTask 네트워크 reject도 동일', async () => {
    const { result, notify } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockRejectedValueOnce(new TypeError('net'));
    await act(async () => { await result.current.moveTask('a', 'done'); });
    expect(result.current.tasks[0].status).toBe('todo');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('(c) 같은 id 동시 moveTask는 fetch 1회', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockImplementationOnce(() => new Promise((res) => setTimeout(() => res(json({})), 20)));
    const rs: { ok: boolean }[] = [];
    await act(async () => {
      const p1 = result.current.moveTask('a', 'done');
      const p2 = result.current.moveTask('a', 'review');
      rs.push(await p1, await p2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 초기 GET + PATCH 1회
    expect(rs.map((r) => r.ok)).toEqual([true, false]);
  });

  it('(d) addReview는 taskStatus·roleReviews 반영, 추가 PATCH 없음', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockResolvedValueOnce(
      json({ id: 'r1', role: 'dev', comment: 'x', createdAt: '2026-02-01T00:00:00Z', taskStatus: 'inprogress' }, 201),
    );
    await act(async () => { await result.current.addReview('a', { role: 'dev', comment: 'x' }); });
    const t = result.current.tasks.find((x) => x.id === 'a')!;
    expect(t.status).toBe('inprogress');
    expect(t.roleReviews).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false);
  });

  it('(e) 폴링 not-modified/error에서 tasks 유지', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await act(() => result.current.refresh());
    expect(result.current.tasks).toHaveLength(2);
    fetchMock.mockRejectedValueOnce(new Error('x'));
    await act(() => result.current.refresh());
    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.loadState).toBe('ready');
  });

  it('첫 로드 실패면 loadState error', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loadState).toBe('error'));
  });

  it('(f) deleteTask 성공 시 제거, 실패 시 유지', async () => {
    const { result, notify } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await act(async () => { await result.current.deleteTask('a'); });
    expect(result.current.tasks).toHaveLength(2);
    expect(notify).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(async () => { await result.current.deleteTask('a'); });
    expect(result.current.tasks.map((t) => t.id)).toEqual(['b']);
  });
});
