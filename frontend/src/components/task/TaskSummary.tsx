import type { Task } from '../../types';
import { formatDate } from '../../lib/date';
import { PRIORITY_LABEL, isPrTask } from '../../lib/taskLabels';
import PrBadge from '../common/PrBadge';

// 제목은 대화상자 h2가 보여 주므로 여기서 반복하지 않는다.
export function TaskSummary({ task }: { task: Task }) {
  const pr = isPrTask(task);
  // PR 작업의 assigneeId는 ""이고 사람은 author(API 계약 §6).
  const person = (pr ? task.author : task.assigneeId) || '';
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-caption text-muted">
        <span>만든 날 {formatDate(task.createdAt)}</span>
        <PrBadge url={pr ? task.sourceUrl : null} showWithoutLink={pr} />
      </p>
      <p className="whitespace-pre-wrap text-body-sm">{task.description || <span className="text-muted">설명이 없어요.</span>}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
        <dt className="text-muted">{pr ? '작성자' : '담당자'}</dt>
        <dd className="flex items-center gap-2">
          {person ? <span>{person}</span> : <span className="text-muted">없음</span>}
        </dd>
        <dt className="text-muted">우선순위</dt>
        <dd>{PRIORITY_LABEL[task.priority] ?? PRIORITY_LABEL.medium}</dd>
        <dt className="text-muted">분류</dt>
        <dd>{task.category || <span className="text-muted">없음</span>}</dd>
      </dl>
    </div>
  );
}
