import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TasksProvider } from './TasksContext';
import { useChecklistGenerator } from './useChecklistGenerator';
import { routeFetch } from '../test/routeFetch';
import type { Task } from '../types';

const task: Task = { id: 't1', title: 'x', description: '', status: 'todo', priority: 'medium', category: '',
  assigneeId: '', subtasks: [], createdAt: '2026-11-20T00:00:00Z', kind: 'manual' };
afterEach(() => vi.unstubAllGlobals());

describe('useChecklistGenerator', () => {
  it('진행 중 언마운트돼도 이후 상태 갱신·오류 노출 없음, 재진입 가능', async () => {
    routeFetch({ 'GET /api/v1/tasks/': () => ({ json: [task] }) });
    const base = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal('fetch', vi.fn(async (i: RequestInfo | URL, init?: RequestInit) => {
      if (String(i).includes('generate-checklist')) { await gate; return new Response('{}', { status: 502 }); }
      return base(i, init);
    }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useChecklistGenerator(task), {
      wrapper: ({ children }: { children: ReactNode }) => <TasksProvider>{children}</TasksProvider>,
    });
    let p!: Promise<void>;
    act(() => { p = result.current.generate(); });
    unmount();
    release();
    await p;
    expect(err).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull(); // 언마운트 후 갱신이 반영되지 않았다
    err.mockRestore();
  });
});
