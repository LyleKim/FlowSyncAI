import { useState } from 'react';
import type { Task, TaskStatus } from '../types';
import type { TaskDraft } from './useTasks';

const fromTask = (t: Task | null, initialStatus: TaskStatus): TaskDraft =>
  t
    ? { title: t.title, description: t.description, status: t.status, priority: t.priority, category: t.category, assigneeId: t.assigneeId, roles: t.roles }
    : { title: '', description: '', status: initialStatus, priority: 'medium', category: '', assigneeId: '' };

/**
 * 사용자가 고친 필드만 따로 들고, 나머지는 매 렌더 task에서 읽는다.
 * 같은 id의 폴링 갱신은 고친 필드를 덮지 않고, id가 바뀌면 고친 내용을 버린다.
 */
export function useTaskForm(task: Task | null, initialStatus: TaskStatus = 'todo') {
  const id = task?.id ?? null;
  const [state, setState] = useState<{ id: string | null; edits: Partial<TaskDraft> }>({ id, edits: {} });
  const edits = state.id === id ? state.edits : {};
  const values: TaskDraft = { ...fromTask(task, initialStatus), ...edits };

  return {
    values,
    isDirty: Object.keys(edits).length > 0,
    setField: <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) =>
      setState((s) => ({ id, edits: { ...(s.id === id ? s.edits : {}), [k]: v } })),
    reset: () => setState({ id, edits: {} }),
    toPayload: (): TaskDraft => ({ ...values, title: values.title.trim(), description: values.description.trim() }),
  };
}
