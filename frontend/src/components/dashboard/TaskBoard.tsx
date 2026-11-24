import type { Task, TaskStatus } from '../../types';
import { countByStatus, filterTasks } from '../../lib/taskFilters';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/taskLabels';
import { PriorityText, RowActions, TaskTitle, type TaskActions } from './TaskControls';

interface TaskBoardProps extends TaskActions {
  tasks: Task[];
  selectedStatus?: TaskStatus | null;
  onSelectedStatusChange?: (s: TaskStatus | null) => void;
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'text-status-todo', inprogress: 'text-status-inprogress', review: 'text-status-review', done: 'text-status-done',
};

export default function TaskBoard({ tasks, selectedStatus, onSelectedStatusChange, ...actions }: TaskBoardProps) {
  const counts = countByStatus(tasks);
  const columns = selectedStatus ? [selectedStatus] : STATUS_ORDER;
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUS_ORDER.map((s) => (
          <button key={s} type="button" aria-pressed={selectedStatus === s}
            onClick={() => onSelectedStatusChange?.(selectedStatus === s ? null : s)}
            className="min-h-6 rounded-lg border border-border bg-surface-raised px-3 py-2 text-left aria-pressed:border-accent focus-visible:outline-2 focus-visible:outline-focus-ring">
            <span className={`text-body-sm font-semibold ${STATUS_COLOR[s]}`}>{STATUS_LABEL[s]}</span>
            <span className="ml-2 text-body-sm text-muted">{counts[s]}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {columns.map((s) => {
          const cards = filterTasks(tasks, { status: s });
          return (
            <section key={s} aria-label={`${STATUS_LABEL[s]} 열`} className="rounded-lg bg-surface-sunken p-2">
              <h2 className={`mb-2 px-1 text-body-sm font-semibold ${STATUS_COLOR[s]}`}>{STATUS_LABEL[s]}</h2>
              {cards.length === 0 && <p className="px-1 text-caption text-muted">비어 있어요.</p>}
              <ul className="flex flex-col gap-2">
                {cards.map((t) => (
                  <li key={t.id} data-row-id={t.id} className="flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-3">
                    <TaskTitle task={t} onSelectTask={actions.onSelectTask} />
                    <PriorityText priority={t.priority} />
                    <RowActions task={t} onMoveTask={actions.onMoveTask} onDeleteTask={actions.onDeleteTask} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
