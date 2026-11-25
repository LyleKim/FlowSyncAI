const CLS = 'inline-flex items-center rounded border border-border bg-surface-raised px-1.5 py-0.5 text-caption font-semibold text-muted shrink-0';

// url이 없으면 숨김. 링크 없는 배지가 필요하면 showWithoutLink를 명시한다.
export default function PrBadge({ url, showWithoutLink }: { url?: string | null; showWithoutLink?: boolean }) {
  if (!url) return showWithoutLink ? <span className={CLS}>리뷰 요청</span> : null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GitHub에서 열기"
      onClick={(e) => e.stopPropagation()}
      className={`${CLS} hover:text-text focus-visible:outline-2 focus-visible:outline-focus-ring`}
    >
      리뷰 요청
    </a>
  );
}
