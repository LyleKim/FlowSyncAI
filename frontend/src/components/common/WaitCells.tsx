// 대기 칸 막대(10 §6.2): 7칸 × 10px, 칸 사이 2px, 높이 8px. 같은 값이 옆 글자에 있으므로 장식(aria-hidden).
export function WaitCells({ filled }: { filled: number }) {
  return (
    <span data-wait-cells aria-hidden="true" className="inline-flex gap-0.5 align-middle">
      {Array.from({ length: 7 }, (_, i) =>
        i < filled ? (
          <span key={i} data-filled className="block h-2 w-2.5 bg-chart-bar" />
        ) : (
          <span key={i} className="block h-2 w-2.5 border border-border-strong" />
        ),
      )}
    </span>
  );
}
