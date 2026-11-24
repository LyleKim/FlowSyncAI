import type { Task, TaskStatus } from '../../types';
import { filterTasks } from '../../lib/taskFilters';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/taskLabels';
import { formatDate } from '../../lib/date';
import { PriorityText, RowActions, TaskTitle, type TaskActions } from './TaskControls';

interface TaskListProps extends TaskActions {
  tasks: Task[];
  selectedStatus?: TaskStatus | null;
  onSelectedStatusChange?: (s: TaskStatus | null) => void;
}

export default function TaskList({ tasks, selectedStatus, onSelectedStatusChange, ...actions }: TaskListProps) {
  const rows = filterTasks(tasks, { status: selectedStatus ?? undefined });
  return (
    <div>
      {onSelectedStatusChange && (
        <label className="mb-3 flex items-center gap-2 text-body-sm">
          상태
          <select value={selectedStatus ?? ''} onChange={(e) => onSelectedStatusChange((e.target.value || null) as TaskStatus | null)}
            className="min-h-6 rounded border border-border bg-surface px-1">
            <option value="">전체</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">조건에 맞는 작업이 없어요.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
          {rows.map((t) => (
            <li key={t.id} data-row-id={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <TaskTitle task={t} onSelectTask={actions.onSelectTask} />
                <span className="text-caption text-muted">
                  {STATUS_LABEL[t.status]} · <PriorityText priority={t.priority} /> · {formatDate(t.createdAt)}
                </span>
              </div>
              <RowActions task={t} onMoveTask={actions.onMoveTask} onDeleteTask={actions.onDeleteTask} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
