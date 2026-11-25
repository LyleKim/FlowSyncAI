import { useEffect, useRef, useState } from 'react';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/taskLabels';
import type { assigneeOptions } from '../../lib/taskView';
import type { countByStatus } from '../../lib/taskFilters';
import { DEFAULT_VIEW_STATE, type TaskKindFilter, type TaskViewState } from '../../lib/taskView';

interface Props {
  state: TaskViewState;
  onChange: (patch: Partial<TaskViewState>) => void;
  assignees: ReturnType<typeof assigneeOptions>;
  counts: ReturnType<typeof countByStatus>;
  hasMe: boolean;
  resultCount: number;
}

const field = 'min-h-8 w-full rounded border border-border bg-surface px-2 text-body-sm text-text focus-visible:outline-2 focus-visible:outline-focus-ring md:w-auto';
const btn = (on: boolean) =>
  `min-h-6 rounded border px-2 text-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring ${
    on ? 'border-accent bg-accent text-accent-contrast' : 'border-border bg-surface text-text hover:bg-surface-sunken'}`;

export default function TaskFilterBar({ state, onChange, assignees, counts, hasMe, resultCount }: Props) {
  const [draft, setDraft] = useState(state.q);
  const composing = useRef(false);
  // 외부(뒤로가기 등)에서 q가 바뀔 때만 draft를 덮어쓴다
  useEffect(() => { setDraft(state.q); }, [state.q]);

  const filtered = state.q !== '' || state.status !== 'all' || state.kind !== 'all' || state.assignee !== '';
  const statusChips: [TaskViewState['status'], string, number][] = [
    ['all', '전체', counts.all],
    ...STATUS_ORDER.map((s): [TaskViewState['status'], string, number] => [s, STATUS_LABEL[s], counts[s]]),
  ];

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <label className="flex w-full flex-col gap-1 text-caption text-muted md:w-64">
        작업 검색
        <input type="search" value={draft} placeholder="제목, 담당자, 작성자로 검색" className={field}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(e) => { composing.current = false; onChange({ q: e.currentTarget.value }); }}
          onChange={(e) => { setDraft(e.target.value); if (!composing.current) onChange({ q: e.target.value }); }} />
      </label>
      <label className="flex w-full flex-col gap-1 text-caption text-muted md:w-auto">
        출처
        <select value={state.kind} className={field} onChange={(e) => onChange({ kind: e.target.value as TaskKindFilter })}>
          <option value="all">전체</option>
          <option value="pr">리뷰 요청</option>
          <option value="manual">직접 만든 작업</option>
        </select>
      </label>
      <label className="flex w-full flex-col gap-1 text-caption text-muted md:w-auto">
        담당자
        <select value={state.assignee} className={field} onChange={(e) => onChange({ assignee: e.target.value })}>
          <option value="">전체</option>
          {hasMe && <option value="me">나</option>}
          <option value="none">담당자 없음</option>
          {assignees.map(a => <option key={a.value} value={a.value}>{`${a.label} (${a.count})`}</option>)}
        </select>
      </label>
      {state.view === 'list' && (
        <div role="group" aria-label="상태 필터" className="flex w-full flex-wrap gap-1 md:w-auto">
          {statusChips.map(([v, label, n]) => (
            <button key={v} type="button" aria-pressed={state.status === v} className={btn(state.status === v)}
              onClick={() => onChange({ status: v })}>{`${label} ${n}`}</button>
          ))}
        </div>
      )}
      <div role="group" aria-label="보기 전환" className="flex w-full gap-1 md:w-auto">
        {(['list', 'board'] as const).map(v => (
          <button key={v} type="button" aria-pressed={state.view === v} className={`${btn(state.view === v)} flex-1 md:flex-none`}
            onClick={() => onChange({ view: v })}>{v === 'list' ? '목록' : '보드'}</button>
        ))}
      </div>
      <p role="status" className="text-body-sm text-muted">{`작업 ${resultCount}개`}</p>
      {filtered && (
        <button type="button" className={`${btn(false)} w-full md:w-auto`}
          onClick={() => onChange({ q: DEFAULT_VIEW_STATE.q, status: 'all', kind: 'all', assignee: '' })}>필터 해제</button>
      )}
    </div>
  );
}
