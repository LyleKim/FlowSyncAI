import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { Task, TaskStatus } from '../../types';
import type { MutationResult } from '../../hooks/useTasks';
import { PRIORITY_LABEL, isPrTask } from '../../lib/taskLabels';
import { displayTitle, taskLinkTo, type TaskSortKey } from '../../lib/taskView';
import { formatDate } from '../../lib/date';
import PrBadge from '../common/PrBadge';
import TaskStatusControl from './TaskStatusControl';

interface TaskListProps {
  tasks: Task[]; // 이미 필터·정렬된 배열(내부 필터·정렬 state 없음)
  sort: { key: TaskSortKey; dir: 'asc' | 'desc' };
  onSortChange: (key: TaskSortKey) => void;
  linkSearch: string;
  onMoveTask: (id: string, s: TaskStatus) => Promise<MutationResult>;
  onDeleteTask: (t: Task) => void;
}

// 좁은 폭(<md)에서는 같은 DOM의 행을 카드로 접는다. display를 바꾸면 표 의미가 사라지므로 role을 명시한다.
const TH = 'block px-3 py-2 text-left text-caption font-semibold text-muted md:table-cell';
const TH_NARROW_HIDDEN = `${TH} sr-only md:not-sr-only`;
const TD = 'flex items-center gap-2 px-3 py-1 text-body-sm md:table-cell md:py-2 before:min-w-16 before:text-caption before:text-muted before:content-[attr(data-label)] md:before:content-none';

function SortHeader({ k, label, sort, onSortChange }: { k: TaskSortKey; label: string } & Pick<TaskListProps, 'sort' | 'onSortChange'>) {
  const active = sort.key === k;
  const Icon = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th role="columnheader" scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={TH}>
      <button type="button" onClick={() => onSortChange(k)}
        className="inline-flex min-h-6 items-center gap-1 rounded-sm font-semibold hover:text-text focus-visible:outline-2 focus-visible:outline-focus-ring">
        {label}
        {active && <Icon size={14} aria-hidden="true" />}
      </button>
    </th>
  );
}

function Person({ task }: { task: Task }) {
  const pr = isPrTask(task);
  const name = ((pr ? task.author : task.assigneeId) ?? '').trim();
  if (name) return <>{pr ? '작성' : '담당'} {name}</>;
  return <><span aria-hidden="true">—</span><span className="sr-only">{pr ? '작성자 정보 없음' : '담당자 없음'}</span></>;
}

export default function TaskList({ tasks, sort, onSortChange, linkSearch, onMoveTask, onDeleteTask }: TaskListProps) {
  const sh = { sort, onSortChange };
  return (
    <table role="table" className="block w-full border-collapse rounded-md border border-border bg-surface-raised md:table">
      <caption className="sr-only">전체 작업 목록</caption>
      <thead role="rowgroup" className="block border-b border-border md:table-header-group">
        <tr role="row" className="flex flex-wrap md:table-row">
          <SortHeader k="title" label="작업" {...sh} />
          <th role="columnheader" scope="col" className={TH_NARROW_HIDDEN}>출처</th>
          <SortHeader k="status" label="상태" {...sh} />
          <th role="columnheader" scope="col" className={TH_NARROW_HIDDEN}>사람</th>
          <SortHeader k="priority" label="우선순위" {...sh} />
          <SortHeader k="createdAt" label="생성" {...sh} />
          <th role="columnheader" scope="col" className={`${TH} sr-only`}>삭제</th>
        </tr>
      </thead>
      <tbody role="rowgroup" className="block md:table-row-group">
        {tasks.map((t) => {
          const title = displayTitle(t);
          const pr = isPrTask(t);
          return (
            <tr role="row" key={t.id} data-row-id={t.id} className="block border-b border-border py-2 last:border-b-0 md:table-row md:py-0">
              <td role="cell" className="block px-3 py-1 md:table-cell md:py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Link to={taskLinkTo(t.id, linkSearch)}
                    className="min-h-6 break-words font-medium text-text hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">
                    {title}
                  </Link>
                  {pr && <PrBadge url={t.sourceUrl} showWithoutLink />}
                </span>
              </td>
              <td role="cell" data-label="출처" className={TD}>{pr ? '리뷰 요청' : '직접'}</td>
              <td role="cell" data-label="상태" className={TD}><TaskStatusControl task={t} onMove={onMoveTask} /></td>
              <td role="cell" data-label="사람" className={`${TD} break-words`}><Person task={t} /></td>
              <td role="cell" data-label="우선순위" className={TD}>{PRIORITY_LABEL[t.priority] ?? PRIORITY_LABEL.medium}</td>
              <td role="cell" data-label="생성" className={TD}>{formatDate(t.createdAt)}</td>
              <td role="cell" className="block px-3 py-1 md:table-cell md:py-2 md:text-right">
                <button type="button" aria-label={`‘${title}’ 삭제`} onClick={() => onDeleteTask(t)}
                  className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm p-1 text-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-focus-ring">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
