import { describeRepoError, formatFetched } from '../../lib/repoCopy';
import { minutesAgo } from '../../lib/date';
import type { SyncStatusInfo } from '../../services/syncStatus';

const STALE_MIN = 6;

export default function SyncStatusLine({
  status,
  onRefresh,
  now = new Date(),
}: {
  status: SyncStatusInfo;
  onRefresh: () => void;
  now?: Date;
}) {
  const { lastSuccessAt, syncing, error, truncated } = status;
  const stale = !!lastSuccessAt && minutesAgo(lastSuccessAt, now) > STALE_MIN;
  const resetMs = error?.kind === 'rate_limit' && error.resetAt ? Date.parse(error.resetAt) - now.getTime() : 0;
  const limited = error?.kind === 'rate_limit';
  const disabledText = limited
    ? resetMs > 0
      ? `${Math.ceil(resetMs / 60000)}분 뒤에 다시 가져올 수 있어요`
      : '잠시 뒤에 다시 가져올 수 있어요'
    : syncing
      ? '가져오는 중이에요'
      : '';
  const disabled = syncing || limited;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span role="status">
        {formatFetched(lastSuccessAt, now)}
        {stale && ' · 오래됨'}
        {truncated && ' · 일부만 가져왔어요'}
      </span>
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
      {disabled && disabledText && <span>{disabledText}</span>}
      {error && (
        <p role="alert" className="w-full text-danger">
          {describeRepoError('연결된 레포', { ...error, message: '' }, lastSuccessAt, now).title}
        </p>
      )}
    </div>
  );
}
