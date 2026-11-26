import type { ReviewQueueItem } from '../../types/reviewQueue';
import { closedBadge, myReviewLabel } from '../../lib/reviewQueue';
import { isSafeUrl, unverifiedLabel } from './PrQueueRow';

export function PrCompactRow({
  item,
  now,
  unverifiedSince,
}: {
  item: ReviewQueueItem;
  now: Date;
  unverifiedSince?: string | null;
}) {
  const closed = item.group === 'closed';
  const right = closed ? closedBadge(item) : myReviewLabel(item.myReview, now);
  return (
    <li
      data-row-id={item.id}
      className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2"
    >
      <div className="min-w-0">
        {isSafeUrl(item.url) ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.title} (새 탭에서 열려요)`}
            className="inline-flex min-h-6 min-w-0 items-center break-words rounded text-accent underline focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            {item.title}
          </a>
        ) : (
          <>
            <span className="min-w-0 break-words">{item.title}</span>{' '}
            <span className="text-sm text-muted">링크를 열 수 없어요</span>
          </>
        )}
        <p className="min-w-0 break-words text-sm text-muted">
          {item.repo} #{item.number} · 작성자 {item.author}
          {unverifiedSince !== undefined && ` · ${unverifiedLabel(unverifiedSince)}`}
        </p>
      </div>
      {right && (
        <span className={closed ? 'rounded border border-border px-1.5 py-0.5 text-xs' : 'text-sm text-muted'}>
          {right}
        </span>
      )}
    </li>
  );
}
