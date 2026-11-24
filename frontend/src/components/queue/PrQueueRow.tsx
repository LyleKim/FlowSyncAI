import type { ReviewQueueItem } from '../../types/reviewQueue';
import { changeSizeSpoken, formatChangeSize, myReviewLabel, waitBasisLabel, waitLabel } from '../../lib/reviewQueue';
import { formatClock } from '../../lib/repoCopy';

const badge = 'rounded border border-border px-1.5 py-0.5 text-xs';
const linkCls =
  'inline-flex min-h-6 items-center rounded text-accent underline focus-visible:outline-2 focus-visible:outline-focus-ring';

export const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

export function unverifiedLabel(since: string | null): string {
  const t = since && formatClock(since);
  return t ? `확인 안 됨 · ${t} 기준` : '확인 안 됨';
}

export function PrQueueRow({
  item,
  now,
  unverifiedSince,
}: {
  item: ReviewQueueItem;
  now: Date;
  unverifiedSince?: string | null;
}) {
  const review = myReviewLabel(item.myReview, now);
  return (
    <li
      data-row-id={item.id}
      className="grid min-w-0 gap-2 border-b border-border py-3 lg:grid-cols-[10rem_minmax(0,1fr)_auto] lg:gap-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 lg:block">
        <strong>{waitLabel(item.requestedAt, item.requestedAtSource, now)}</strong>{' '}
        <span className="text-sm text-muted">{waitBasisLabel(item.requestedAtSource)}</span>
        {item.reRequested && <span className={`${badge} ml-1`}>다시 요청됨</span>}
      </div>
      <div className="min-w-0">
        <h3 className="min-w-0 break-words font-medium">{item.title}</h3>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          <li className="min-w-0 break-words">
            {item.repo} #{item.number}
          </li>
          <li className="min-w-0 break-words">작성자 {item.author}</li>
          <li>
            <span aria-hidden="true">{formatChangeSize(item.size)}</span>
            <span className="sr-only">{changeSizeSpoken(item.size)}</span>
          </li>
          {item.requestKind === 'team' && <li>팀 요청 · {item.viaTeam}</li>}
          {review && <li>{review}</li>}
          {item.isDraft && <li className={badge}>초안</li>}
          {unverifiedSince !== undefined && <li className={badge}>{unverifiedLabel(unverifiedSince)}</li>}
        </ul>
      </div>
      <div className="min-w-0">
        {isSafeUrl(item.url) ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.repo} #${item.number} GitHub에서 리뷰 (새 탭에서 열려요)`}
            className={linkCls}
          >
            GitHub에서 리뷰
          </a>
        ) : (
          <span className="text-sm text-muted">링크를 열 수 없어요</span>
        )}
      </div>
    </li>
  );
}
