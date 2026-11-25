const CLS = 'inline-flex items-center rounded border border-border bg-surface-raised px-1.5 py-0.5 text-caption font-semibold text-muted shrink-0';

// url=null은 PR이 아님(숨김), url 생략은 링크 없는 배지.
export default function PrBadge({ url }: { url?: string | null }) {
  if (url === null) return null;
  if (!url) return <span className={CLS}>리뷰 요청</span>;
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
