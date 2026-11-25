import { Link } from 'react-router';
import { ROUTES } from '../../routes';

export const TASKS_COPY = {
  loading: '작업을 불러오는 중이에요',
  errorTitle: '서버에 연결할 수 없어요',
  errorStale: '아래 목록은 마지막으로 가져온 내용이에요.',
  errorEmpty: '이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요. 지금은 작업을 보여 드릴 수 없어요.',
  retry: '다시 시도',
  emptyAllTitle: '아직 작업이 없어요',
  emptyAllBody: '직접 만든 작업은 ‘새 작업’으로 만들어요. 리뷰 요청은 ‘내 리뷰 요청’에서 볼 수 있어요.',
  newTask: '새 작업',
  myReviews: '내 리뷰 요청',
  emptyFilteredTitle: '조건에 맞는 작업이 없어요',
  clearFilters: '필터 해제',
} as const;

const btn = 'min-h-9 rounded border border-border bg-surface-raised px-3 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-focus-ring';
const link = 'inline-flex min-h-9 items-center rounded border border-border px-3 text-body-sm font-medium hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus-ring';

export function TasksLoading() {
  return (
    <div role="status" className="space-y-2">
      <p className="text-body-sm text-muted">{TASKS_COPY.loading}</p>
      <div aria-hidden="true" className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded bg-surface-sunken" />)}
      </div>
    </div>
  );
}

export function TasksLoadError({ onRetry, hasStale }: { onRetry: () => void; hasStale: boolean }) {
  return (
    <div role="alert" className={`rounded border border-danger p-4 ${hasStale ? 'mb-4 bg-surface-raised' : 'bg-surface-raised'}`}>
      <h2 className="text-title font-semibold text-danger">{TASKS_COPY.errorTitle}</h2>
      <p className="mt-1 text-body-sm">{hasStale ? TASKS_COPY.errorStale : TASKS_COPY.errorEmpty}</p>
      <button type="button" onClick={onRetry} className={`mt-3 ${btn}`}>{TASKS_COPY.retry}</button>
    </div>
  );
}

export function TasksEmptyAll() {
  return (
    <div className="rounded border border-border bg-surface-raised p-6 text-center">
      <h2 className="text-title font-semibold">{TASKS_COPY.emptyAllTitle}</h2>
      <p className="mt-1 text-body-sm text-muted">{TASKS_COPY.emptyAllBody}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Link to={ROUTES.newTask} className={link}>{TASKS_COPY.newTask}</Link>
        <Link to={ROUTES.me} className={link}>{TASKS_COPY.myReviews}</Link>
      </div>
    </div>
  );
}

export function TasksEmptyFiltered({ activeFilters, onClear }: { activeFilters: { key: string; label: string }[]; onClear: () => void }) {
  return (
    <div className="rounded border border-border bg-surface-raised p-6">
      <h2 className="text-title font-semibold">{TASKS_COPY.emptyFilteredTitle}</h2>
      <ul className="mt-2 list-disc pl-5 text-body-sm text-muted">
        {activeFilters.map((f) => <li key={f.key}>{f.label}</li>)}
      </ul>
      <button type="button" onClick={onClear} className={`mt-3 ${btn}`}>{TASKS_COPY.clearFilters}</button>
    </div>
  );
}
