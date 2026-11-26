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

  it('(f2) 지연 커밋 DELETE는 pagehide에도 살아남도록 keepalive로 보낸다', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    await act(async () => {
      await result.current.deleteTask('a');
      await result.current.removeSubtask('b', 's1');
      await result.current.deleteReview('b', 'r1');
    });
    const dels = fetchMock.mock.calls.filter((c) => c[1]?.method === 'DELETE');
    expect(dels).toHaveLength(3);
    for (const c of dels) expect(c[1].keepalive).toBe(true);
  });

  it('(c2) 중복 moveTask의 두 번째 호출은 상태도 바꾸지 않는다', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockImplementationOnce(() => new Promise((res) => setTimeout(() => res(json({})), 20)));
    await act(async () => {
      const p1 = result.current.moveTask('a', 'done');
      const p2 = result.current.moveTask('a', 'review');
      await p1; await p2;
    });
    expect(result.current.tasks.find((t) => t.id === 'a')!.status).toBe('done');
  });

  it('(c3) 중복 toggleSubtask의 두 번째 호출은 상태도 바꾸지 않는다', async () => {
    const { result } = setup([mk('a', { subtasks: [{ id: 's1', title: 's', completed: false }] })]);
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockImplementationOnce(
      () => new Promise((res) => setTimeout(() => res(json({ id: 's1', title: 's', completed: true })), 20)),
    );
    await act(async () => {
      const p1 = result.current.toggleSubtask('a', 's1', true);
      const p2 = result.current.toggleSubtask('a', 's1', false);
      await p1; await p2;
    });
    expect(result.current.tasks[0].subtasks[0].completed).toBe(true);
  });

  it('toggleSubtask 실패 시 롤백·notify 1회', async () => {
    const { result, notify } = setup([mk('a', { subtasks: [{ id: 's1', title: 's', completed: false }] })]);
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await act(async () => { await result.current.toggleSubtask('a', 's1', true); });
    expect(result.current.tasks[0].subtasks[0].completed).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('진행 중 mutation이 있으면 refresh가 tasks를 덮어쓰지 않는다', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    fetchMock.mockImplementationOnce(() => new Promise((res) => setTimeout(() => res(json({})), 30)));
    fetchMock.mockResolvedValueOnce(json([mk('a'), mk('b')]));
    let p!: Promise<unknown>;
    act(() => { p = result.current.moveTask('a', 'done'); });
    await act(() => result.current.refresh());
    expect(result.current.tasks[0].status).toBe('done');
    await act(async () => { await p; });
  });

  it('진행 중 mutation 동안 받은 폴링이 버려져도, mutation 실패 후 다음 refresh가 서버 데이터를 적용한다', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    // ETag 서버 흉내: If-None-Match가 일치하면 304
    fetchMock.mockImplementationOnce(() => new Promise((res) => setTimeout(() => res(json({}, 500)), 30)));
    fetchMock.mockImplementation(async (_u: string, o?: RequestInit) =>
      (o?.headers as Record<string, string> | undefined)?.['If-None-Match'] === 'v2'
        ? new Response(null, { status: 304 })
        : new Response(JSON.stringify([mk('a', { title: 'server' }), mk('b')]), {
            status: 200, headers: { ETag: 'v2' },
          }));
    let p!: Promise<unknown>;
    act(() => { p = result.current.moveTask('a', 'done'); });
    await act(() => result.current.refresh()); // 버려짐 (ETag v2 저장됨)
    await act(async () => { await p; }); // 실패 -> 롤백
    await act(() => result.current.refresh());
    expect(result.current.tasks[0].title).toBe('server');
  });
});
