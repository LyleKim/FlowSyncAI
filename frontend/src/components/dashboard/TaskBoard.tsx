import { useId, type FC } from 'react';
import { Link } from 'react-router';
import { Trash2 } from 'lucide-react';
import type { Task, TaskStatus } from '../../types';
import type { MutationResult } from '../../hooks/useTasks';
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER, isPrTask } from '../../lib/taskLabels';
import { displayTitle, taskLinkTo } from '../../lib/taskView';
import PrBadge from '../common/PrBadge';
import TaskStatusControl from './TaskStatusControl';
import { Person } from './TaskList';

interface TaskBoardProps {
  tasks: Task[]; // 이미 필터·정렬된 배열. 열 머리 개수도 이 배열 기준
  linkSearch: string;
  onMoveTask: (id: string, s: TaskStatus) => Promise<MutationResult>;
  onDeleteTask: (t: Task) => void;
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'text-status-todo', inprogress: 'text-status-inprogress', review: 'text-status-review', done: 'text-status-done',
};

type CardProps = Omit<TaskBoardProps, 'tasks'> & { task: Task };

const Card: FC<CardProps> = ({ task, linkSearch, onMoveTask, onDeleteTask }) => {
  const title = displayTitle(task);
  const pr = isPrTask(task);
  return (
    <li data-row-id={task.id} className="relative flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-3">
      <span className="flex flex-wrap items-center gap-2">
        {/* 카드 전체가 링크 영역. 위에 얹는 컨트롤은 relative z-10 */}
        <Link to={taskLinkTo(task.id, linkSearch)}
          className="min-h-6 break-words font-medium text-text after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">
          {title}
        </Link>
        {pr && <span className="relative z-10"><PrBadge url={task.sourceUrl} showWithoutLink /></span>}
      </span>
      <span className="break-words text-body-sm text-muted"><Person task={task} /></span>
      <span className="text-caption font-semibold text-muted">우선순위 {PRIORITY_LABEL[task.priority] ?? PRIORITY_LABEL.medium}</span>
      <span className="flex items-center justify-between gap-2">
        <span className="relative z-10"><TaskStatusControl task={task} onMove={onMoveTask} showLockNote /></span>
        {/* PR 작업은 삭제하지 않는다(결정 12 개정: 완료 처리만) */}
        {!pr && (
          <button type="button" aria-label={`‘${title}’ 삭제`} onClick={() => onDeleteTask(task)}
            className="relative z-10 inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm p-1 text-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-focus-ring">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </span>
    </li>
  );
};

export default function TaskBoard({ tasks, ...rest }: TaskBoardProps) {
  const id = useId();
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STATUS_ORDER.map((s) => {
        const cards = tasks.filter((t) => t.status === s);
        const hid = `${id}-${s}`;
        return (
          <section key={s} aria-labelledby={hid} className="rounded-md bg-surface-sunken p-2">
            {/* 화면의 sr-only h2 '작업 목록' 아래 단계 */}
            <h3 id={hid} className={`mb-2 px-1 text-body-sm font-semibold ${STATUS_COLOR[s]}`}>
              {STATUS_LABEL[s]} <span className="text-muted">{cards.length}</span>
            </h3>
            {cards.length === 0
              ? <p className="px-1 text-body-sm text-muted">작업이 없어요</p>
              : <ul className="flex flex-col gap-2">{cards.map((t) => <Card key={t.id} task={t} {...rest} />)}</ul>}
          </section>
        );
      })}
    </div>
  );
}
