import { useLayoutEffect, useRef, type RefObject } from 'react';
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
  // select(수동) 또는 상태 영역 span(PR). PR 완료 처리 실패 시엔 안의 버튼으로, 완료 뒤엔 영역 자체로 포커스.
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (pendingFocus !== task.id) return;
    // 같은 작업의 컨트롤이 열린 대화상자와 그 뒤 목록에 동시에 있으면 대화상자 안의 것이 가져간다.
    const modal = document.querySelector('dialog[open]');
    if (modal && !modal.contains(ref.current)) return;
    pendingFocus = null; // 요소가 없어도 항상 해제: 오래된 id가 나중 마운트의 포커스를 훔치지 않게
    const el = ref.current;
    (el?.querySelector('button') ?? el)?.focus();
  });

  const title = displayTitle(task);
  const move = async (s: TaskStatus) => {
    pendingFocus = task.id;
    try {
      const r = await onMove(task.id, s);
      if (r.ok) notify(`‘${title}’을 ${STATUS_MOVED[s]} 옮겼어요`, 'info');
    } finally {
      // 리마운트 커밋이 끝난 뒤에도 남아 있으면 해제(뷰를 벗어난 경우 포함)
      setTimeout(() => { if (pendingFocus === task.id) pendingFocus = null; }, 0);
    }
  };

  if (isPrTask(task)) {
    // 결정 12 개정(사용자 지시): PR 작업은 GitHub 기준이지만 '완료'로 옮기는 것만 허용한다.
    const canComplete = task.status !== 'done';
    const note = showLockNote ? (canComplete ? ' · 완료 처리만 가능해요' : ' · 이동 불가') : '';
    return (
      <span ref={ref} tabIndex={-1} data-status-control={task.id}
        className="inline-flex flex-wrap items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-focus-ring">
        <span className="text-caption text-muted">{STATUS_LABEL[task.status]} · GitHub 기준{note}</span>
        {canComplete && (
          <button type="button" aria-label={`‘${title}’ 완료 처리`} onClick={() => void move('done')}
            className="min-h-6 rounded border border-border bg-surface px-2 text-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring">
            완료 처리
          </button>
        )}
      </span>
    );
  }
  return (
    <select
      aria-label={`‘${title}’ 상태 변경`}
      ref={ref as RefObject<HTMLSelectElement>}
      data-status-control={task.id}
      value={task.status}
      onChange={(e) => void move(e.target.value as TaskStatus)}
      className="min-h-6 rounded border border-border bg-surface px-1 text-body-sm"
    >
      {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  );
}
