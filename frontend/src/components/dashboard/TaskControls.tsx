import { Link } from 'react-router';
import { Trash2 } from 'lucide-react';
import type { Task, TaskStatus } from '../../types';
import { ROUTES } from '../../routes';
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER, isPrTask } from '../../lib/taskLabels';
import PrBadge from '../common/PrBadge';

export const PRIORITY_COLOR = {
  low: 'text-priority-low', medium: 'text-priority-medium', high: 'text-priority-high', urgent: 'text-priority-urgent',
} as const;

export interface TaskActions {
  onMoveTask: (id: string, s: TaskStatus) => void;
  onSelectTask?: (t: Task) => void;
  onDeleteTask: (id: string) => void;
}

export function TaskTitle({ task, onSelectTask }: { task: Task; onSelectTask?: (t: Task) => void }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link to={ROUTES.task(task.id)} onClick={() => onSelectTask?.(task)} className="inline-block min-h-6 truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">
        {task.title}
      </Link>
      <PrBadge url={isPrTask(task) ? task.sourceUrl : null} showWithoutLink={isPrTask(task)} />
    </span>
  );
}

export function PriorityText({ priority }: { priority: Task['priority'] }) {
  return <span className={`text-caption font-semibold ${PRIORITY_COLOR[priority] ?? ''}`}>{PRIORITY_LABEL[priority] ?? PRIORITY_LABEL.medium}</span>;
}

// PR 작업은 상태 변경 컨트롤을 렌더하지 않는다(결정 12).
export function RowActions({ task, onMoveTask, onDeleteTask }: { task: Task } & Pick<TaskActions, 'onMoveTask' | 'onDeleteTask'>) {
  return (
    <span className="flex items-center gap-1">
      {!isPrTask(task) && (
        <select aria-label="상태 변경" value={task.status} onChange={(e) => onMoveTask(task.id, e.target.value as TaskStatus)}
          className="min-h-6 rounded border border-border bg-surface px-1 text-body-sm">
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      )}
      <button type="button" aria-label={`${task.title} 삭제`} onClick={() => onDeleteTask(task.id)}
        className="inline-flex min-h-6 min-w-6 items-center justify-center rounded p-1 text-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-focus-ring">
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </span>
  );
}
