import { useLayoutEffect } from 'react';
import type { Task, TaskStatus } from '../../types';
import type { MutationResult } from '../../hooks/useTasks';
import { useToasts } from '../../hooks/useToasts';
import { STATUS_LABEL, STATUS_ORDER, isPrTask } from '../../lib/taskLabels';
import { displayTitle } from '../../lib/taskView';

const STATUS_MOVED: Record<TaskStatus, string> = { todo: '할 일로', inprogress: '진행 중으로', review: '리뷰 중으로', done: '완료로' };

// 이동 직후 목록이 행을 재배치(리마운트)해도 포커스를 되돌리기 위해 모듈 수준에 둔다.
let pendingFocus: string | null = null;

export default function TaskStatusControl({ task, onMove, showLockNote }: {
  task: Task;
  onMove: (id: string, s: TaskStatus) => Promise<MutationResult>;
  showLockNote?: boolean;
}) {
  const { notify } = useToasts();
  useLayoutEffect(() => {
    if (pendingFocus !== task.id) return;
    const el = document.querySelector<HTMLElement>(`[data-status-control="${CSS.escape(task.id)}"]`);
    if (el) { el.focus(); pendingFocus = null; }
  });

  if (isPrTask(task)) {
    return <span className="text-caption text-muted">{STATUS_LABEL[task.status]} · GitHub 기준{showLockNote ? ' · 이동 불가' : ''}</span>;
  }
  const title = displayTitle(task);
  return (
    <select
      aria-label={`‘${title}’ 상태 변경`}
      data-status-control={task.id}
      value={task.status}
      onChange={async (e) => {
        const s = e.target.value as TaskStatus;
        pendingFocus = task.id;
        const r = await onMove(task.id, s);
        if (r.ok) notify(`‘${title}’을 ${STATUS_MOVED[s]} 옮겼어요`, 'info');
        else pendingFocus = null;
      }}
      className="min-h-6 rounded border border-border bg-surface px-1 text-body-sm"
    >
      {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  );
}
