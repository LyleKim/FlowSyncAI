import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoleReview, SubTask, Task, TaskStatus } from '../types';
import {
  fetchTasksFromServer,
  invalidateTasksCacheHeaders,
  TASKS_POLL_INTERVAL_MS,
} from '../services/taskSync';
import { postJson } from '../services/apiClient';

export type MutationResult<T = void> = { ok: true; value: T } | { ok: false; error: string; notified?: boolean };
export type TaskDraft = Omit<
  Task,
  'id' | 'createdAt' | 'subtasks' | 'roleReviews' | 'hasUnreflectedReview' | 'lastReviewAddedAt'
>;
type Notify = (msg: string, kind: 'error' | 'info') => void;

export interface TasksApi {
  tasks: Task[];
  loadState: 'loading' | 'ready' | 'error';
  refresh(): Promise<void>;
  moveTask(id: string, s: TaskStatus): Promise<MutationResult>;
  createTask(d: TaskDraft): Promise<MutationResult<Task>>;
  updateTask(id: string, patch: Partial<TaskDraft>): Promise<MutationResult<Task>>;
  deleteTask(id: string): Promise<MutationResult>;
  addSubtask(taskId: string, title: string): Promise<MutationResult<SubTask>>;
  toggleSubtask(taskId: string, subtaskId: string, completed: boolean): Promise<MutationResult>;
  removeSubtask(taskId: string, subtaskId: string): Promise<MutationResult>;
  replaceSubtasks(taskId: string, items: SubTask[]): Promise<MutationResult<SubTask[]>>;
  addReview(taskId: string, r: Omit<RoleReview, 'id' | 'createdAt'>): Promise<MutationResult<RoleReview>>;
  updateReview(taskId: string, reviewId: string, patch: Partial<RoleReview>): Promise<MutationResult>;
  deleteReview(taskId: string, reviewId: string): Promise<MutationResult>;
}

const send = async (method: string, url: string, body?: unknown, post = false) => {
  const res = post
    ? await postJson(url, body)
    : await fetch(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
  if (!res.ok) throw new Error(`${method} ${url} ${res.status}`);
  return res;
};

export function useTasks(deps: { notify?: Notify } = {}): TasksApi {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<TasksApi['loadState']>('loading');
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const notifyRef = useRef(deps.notify);
  notifyRef.current = deps.notify;
  const loadedRef = useRef(false);
  const inflight = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const r = await fetchTasksFromServer();
    if (r.status === 'updated') {
      loadedRef.current = true;
      // 진행 중 mutation의 낙관적 상태를 폴링 결과로 덮어쓰지 않는다.
      if (inflight.current.size === 0) setTasks(r.tasks);
      else invalidateTasksCacheHeaders(); // 버린 응답의 ETag로 다음 폴링이 304가 되지 않게
      setLoadState('ready');
    } else if (r.status === 'not-modified') {
      if (loadedRef.current) setLoadState('ready');
    } else if (!loadedRef.current) {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    // 저장된 ETag가 있으면 첫 로드가 304로 끝나 빈 목록이 되므로 먼저 버린다.
    invalidateTasksCacheHeaders();
    refresh();
    const id = window.setInterval(refresh, TASKS_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // 같은 key가 진행 중이면 요청 없이 실패 반환. 실패 시 rollback 후 notify 1회.
  const mutate = async <T,>(
    key: string,
    errMsg: string,
    fn: () => Promise<T>,
    rollback?: () => void,
    apply?: () => void, // 낙관적 갱신: 중복 가드를 통과한 뒤에만 실행
  ): Promise<MutationResult<T>> => {
    if (inflight.current.has(key)) return { ok: false, error: '이미 처리 중입니다.' };
    inflight.current.add(key);
    try {
      apply?.();
      const value = await fn();
      invalidateTasksCacheHeaders();
      return { ok: true, value };
    } catch {
      rollback?.();
      notifyRef.current?.(errMsg, 'error');
      return { ok: false, error: errMsg, notified: true };
    } finally {
      inflight.current.delete(key);
    }
  };

  const patchTask = (taskId: string, up: (t: Task) => Task) =>
    setTasks((prev) => prev.map((t) => (t.id === taskId ? up(t) : t)));
  const base = (id: string) => `/api/v1/tasks/${id}/`;

  const moveTask: TasksApi['moveTask'] = (id, status) => {
    const old = tasksRef.current.find((t) => t.id === id);
    if (!old) return Promise.resolve({ ok: false, error: '작업을 찾을 수 없습니다.' });
    return mutate(`move:${id}`, '작업 상태를 변경하지 못했습니다.', async () => {
      await send('PATCH', base(id), { status });
    }, () => patchTask(id, (t) => ({ ...t, status: old.status })),
    () => patchTask(id, (t) => ({ ...t, status })));
  };

  const createTask: TasksApi['createTask'] = (d) =>
    mutate('create', '작업을 만들지 못했습니다.', async () => {
      const created: Task = await (await send('POST', '/api/v1/tasks/', d, true)).json();
      setTasks((prev) => [created, ...prev]);
      return created;
    });

  const updateTask: TasksApi['updateTask'] = (id, patch) =>
    mutate(`update:${id}`, '작업을 저장하지 못했습니다.', async () => {
      const updated: Task = await (await send('PATCH', base(id), patch)).json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    });

  const deleteTask: TasksApi['deleteTask'] = (id) =>
    mutate(`delete:${id}`, '작업을 삭제하지 못했습니다.', async () => {
      await send('DELETE', base(id));
      setTasks((prev) => prev.filter((t) => t.id !== id));
    });

  const addSubtask: TasksApi['addSubtask'] = (taskId, title) =>
    mutate(`addSub:${taskId}`, '체크리스트 항목을 추가하지 못했습니다.', async () => {
      const created: SubTask = await (
        await send('POST', `${base(taskId)}subtasks/`, { title, completed: false }, true)
      ).json();
      patchTask(taskId, (t) => ({ ...t, subtasks: [...t.subtasks, created] }));
      return created;
    });

  const toggleSubtask: TasksApi['toggleSubtask'] = (taskId, subtaskId, completed) => {
    const old = tasksRef.current.find((t) => t.id === taskId)?.subtasks.find((s) => s.id === subtaskId);
    const set = (c: boolean) =>
      patchTask(taskId, (t) => ({
        ...t,
        subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, completed: c } : s)),
      }));
    return mutate(`toggle:${subtaskId}`, '체크리스트 항목을 변경하지 못했습니다.', async () => {
      const updated: SubTask = await (
        await send('PATCH', `${base(taskId)}subtasks/${subtaskId}/`, { completed })
      ).json();
      patchTask(taskId, (t) => ({ ...t, subtasks: t.subtasks.map((s) => (s.id === subtaskId ? updated : s)) }));
    }, () => set(old?.completed ?? !completed), () => set(completed));
  };

  const removeSubtask: TasksApi['removeSubtask'] = (taskId, subtaskId) =>
    mutate(`rmSub:${subtaskId}`, '체크리스트 항목을 삭제하지 못했습니다.', async () => {
      await send('DELETE', `${base(taskId)}subtasks/${subtaskId}/`);
      patchTask(taskId, (t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) }));
    });

  const replaceSubtasks: TasksApi['replaceSubtasks'] = (taskId, items) =>
    mutate(`replace:${taskId}`, '체크리스트를 저장하지 못했습니다.', async () => {
      const updated: SubTask[] = await (await send('PUT', `${base(taskId)}subtasks/`, items)).json();
      // 서버가 PUT 중 hasUnreflectedReview/lastReviewAddedAt도 초기화한다.
      patchTask(taskId, (t) => ({ ...t, subtasks: updated, hasUnreflectedReview: false, lastReviewAddedAt: undefined }));
      return updated;
    });

  const addReview: TasksApi['addReview'] = (taskId, review) =>
    mutate(`addRev:${taskId}`, '리뷰를 추가하지 못했습니다.', async () => {
      const data = await (await send('POST', `${base(taskId)}reviews/`, review, true)).json();
      const { taskStatus, ...created } = data as RoleReview & { taskStatus?: TaskStatus };
      patchTask(taskId, (t) => ({
        ...t,
        roleReviews: [...(t.roleReviews || []), created],
        status: taskStatus ?? t.status,
        hasUnreflectedReview: true,
        lastReviewAddedAt: created.createdAt,
      }));
      return created;
    });

  const updateReview: TasksApi['updateReview'] = (taskId, reviewId, patch) =>
    mutate(`updRev:${reviewId}`, '리뷰를 수정하지 못했습니다.', async () => {
      const updated: RoleReview = await (
        await send('PATCH', `${base(taskId)}reviews/${reviewId}/`, patch)
      ).json();
      patchTask(taskId, (t) => ({
        ...t,
        roleReviews: (t.roleReviews || []).map((r) => (r.id === reviewId ? updated : r)),
      }));
    });

  const deleteReview: TasksApi['deleteReview'] = (taskId, reviewId) =>
    mutate(`delRev:${reviewId}`, '리뷰를 삭제하지 못했습니다.', async () => {
      await send('DELETE', `${base(taskId)}reviews/${reviewId}/`);
      patchTask(taskId, (t) => ({ ...t, roleReviews: (t.roleReviews || []).filter((r) => r.id !== reviewId) }));
    });

  return {
    tasks, loadState, refresh, moveTask, createTask, updateTask, deleteTask,
    addSubtask, toggleSubtask, removeSubtask, replaceSubtasks, addReview, updateReview, deleteReview,
  };
}
