import { describeRepoError, formatFetched } from '../../lib/repoCopy';
import { minutesAgo } from '../../lib/date';
import type { SyncStatusInfo } from '../../services/syncStatus';

const STALE_MIN = 6;

export default function SyncStatusLine({
  status,
  onRefresh,
  now = new Date(),
  repo,
}: {
  status: SyncStatusInfo;
  onRefresh: () => void;
  now?: Date;
  repo?: string;
}) {
  const { lastSuccessAt, syncing, error, truncated } = status;
  const stale = !!lastSuccessAt && minutesAgo(lastSuccessAt, now) > STALE_MIN;
  const resetMs = error?.kind === 'rate_limit' && error.resetAt ? Date.parse(error.resetAt) - now.getTime() : 0;
  const limited = error?.kind === 'rate_limit';
  // repo 이름이 없으면 제목이 어색하지 않은 중립 표기를 쓴다
  const view = error
    ? describeRepoError(
        repo ?? (error.kind === 'not_found' ? '연결된' : '연결된 레포'),
        { ...error, message: '' },
        lastSuccessAt,
        now,
      )
    : null;
  const blocked = !!view && (!view.canRetry || !!view.retryDisabledReason);
  const disabled = syncing || blocked || limited;
  const hint = limited
    ? resetMs > 0
      ? `${Math.ceil(resetMs / 60000)}분 뒤에 다시 가져올 수 있어요`
      : '잠시 뒤에 다시 가져올 수 있어요'
    : syncing
      ? '가져오는 중이에요'
      : '';
  // live region은 가져오기 상태가 바뀔 때만 바뀐다. 오류는 아래 role=alert가 알린다.
  const live = syncing ? '가져오는 중이에요' : !error && lastSuccessAt ? `가져왔어요${truncated ? ' · 일부만 가져왔어요' : ''}` : '';

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      {/* 상대 시각은 useNow로 매분 바뀌므로 live region 밖에 둔다(매분 재낭독 방지). */}
      <span>
        {formatFetched(lastSuccessAt, now)}
        {stale && ' · 오래됨'}
        {truncated && ' · 일부만 가져왔어요'}
      </span>
      <span role="status" className="sr-only">{live}</span>
      <button
        type="button"
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) onRefresh();
        }}
        className="min-h-6 min-w-6 rounded border border-border px-2 py-0.5 aria-disabled:opacity-60"
      >
        지금 가져오기
      </button>
      {hint && <span aria-hidden={hint === live || undefined}>{hint}</span>}
      {view?.retryDisabledReason && <span>{view.retryDisabledReason}</span>}
      {view && (
        <div role="alert" className="w-full text-danger">
          <p>{view.title}</p>
          <p>{view.body}</p>
          {view.adminCopy && <p>{view.adminCopy}</p>}
        </div>
      )}
    </div>
  );
}
