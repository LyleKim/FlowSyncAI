export function QueueSummary({
  waitingCount,
  oldestLabel,
  awaitingCount,
  draftCount,
  showDrafts,
  onShowDraftsChange,
  partial,
  truncated,
}: {
  waitingCount: number;
  oldestLabel: string | null;
  awaitingCount: number;
  draftCount: number;
  showDrafts: boolean;
  onShowDraftsChange: (v: boolean) => void;
  partial: boolean;
  truncated: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <p>
        리뷰 대기 {waitingCount}건{oldestLabel ? ` · 가장 오래 ${oldestLabel}` : ''}
        {partial ? ' (확인된 레포 기준)' : ''}
        {truncated ? ' (일부만 가져옴)' : ''}
      </p>
      <p className="text-muted">작성자 응답 대기 {awaitingCount}건</p>
      {draftCount > 0 && (
        <>
          <label className="inline-flex min-h-6 items-center gap-2">
            <input type="checkbox" checked={showDrafts} onChange={(e) => onShowDraftsChange(e.target.checked)} />
            초안 {draftCount}건 보기
          </label>
          {!showDrafts && <p className="text-muted">초안 {draftCount}건은 숨겨져 있어요</p>}
        </>
      )}
    </div>
  );
}
