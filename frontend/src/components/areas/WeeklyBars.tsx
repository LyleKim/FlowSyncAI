import { BAR_MAX_CELLS, barCells, currentWeekIndex, describeWeekly, isClipped } from '../../lib/areaChart';
import type { AreaWeek } from '../../types/areas';

// 모든 행이 같은 눈금을 쓰도록 크기 상수는 여기 한 곳에만 둔다
const CELL = 4;
const BAR_W = 10;
const GAP = 6;
const STEP = BAR_W + GAP;
const TOP = 2; // 잘림 표식 여백
const FLOOR = TOP + BAR_MAX_CELLS * CELL;
const INSET = 0.75; // 속 빈 막대 윤곽(1.5)이 잘리지 않게 반 두께만큼 안쪽으로
const HEIGHT = FLOOR + 2;

interface Props {
  weekly: AreaWeek[];
  generatedAt: string;
  days: number;
  variant?: 'row' | 'detail';
  state?: 'data' | 'unknown';
  weekCount?: number;
}

const md = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

export function WeeklyBars({ weekly, generatedAt, days, variant = 'row', state = 'data', weekCount = 0 }: Props) {
  const unknown = state === 'unknown';
  const n = unknown ? weekCount : weekly.length;
  const width = Math.max(n, 1) * STEP - GAP;
  const cur = unknown ? -1 : currentWeekIndex(weekly, generatedAt);
  const name = unknown ? '데이터 없음' : describeWeekly(weekly, cur, days);
  const detail = variant === 'detail' && !unknown;
  const col = (i: number) => ({
    width: BAR_W,
    marginRight: i < n - 1 ? GAP : 0,
    display: 'inline-flex',
    justifyContent: 'center',
  });

  return (
    // relative: sr-only 날짜(position:absolute)가 가로 스크롤 상자를 벗어나 페이지 폭을 늘리지 않게
    <div className={`relative inline-block text-(--text-muted) ${detail ? 'px-3' : 'max-w-full'}`}>
      {detail && (
        <div aria-hidden="true" style={{ width, whiteSpace: 'nowrap' }} className="text-xs tabular-nums">
          {weekly.map((w, i) => (
            <span key={w.weekStart} style={col(i)}>{w.commits}</span>
          ))}
        </div>
      )}
      {/* row: 좁은 폭에서는 모든 행이 같은 비율로 줄어 눈금 비교가 유지된다(가로 스크롤 대신) */}
      <svg role="img" aria-label={name} viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} className={detail ? undefined : 'h-auto max-w-full'}>
        {unknown
          ? Array.from({ length: n }, (_, i) => (
              <rect
                key={i}
                aria-hidden="true"
                x={i * STEP}
                y={FLOOR - 2 * CELL}
                width={BAR_W}
                height={2 * CELL}
                fill="none"
                stroke="var(--border-strong)"
                strokeDasharray="2 2"
              />
            ))
          : (
            <>
              {/* 관측 눈금: 4칸·8칸 점선이 모든 행에서 같은 높이 */}
              {[4, 8].map((c) => (
                <line key={c} data-grid aria-hidden="true" x1={0} x2={width} y1={FLOOR - c * CELL} y2={FLOOR - c * CELL} stroke="var(--chart-grid)" strokeDasharray="2 2" />
              ))}
              <line data-floor x1={0} x2={width} y1={FLOOR} y2={FLOOR} stroke="var(--border-strong)" />
              {weekly.map((w, i) => {
                const h = barCells(w.commits) * CELL;
                if (h === 0) return null;
                const x = i * STEP;
                const now = i === cur;
                return (
                  <g key={w.weekStart}>
                    <rect
                      aria-hidden="true"
                      x={now ? x + INSET : x}
                      y={FLOOR - h}
                      width={now ? BAR_W - 2 * INSET : BAR_W}
                      height={h}
                      fill={now ? 'none' : 'var(--chart-bar)'}
                      stroke={now ? 'var(--chart-bar)' : undefined}
                      strokeWidth={now ? INSET * 2 : undefined}
                    />
                    {isClipped(w.commits) && (
                      <line data-clipped x1={x} x2={x + BAR_W} y1={TOP - 1} y2={TOP - 1} stroke="var(--chart-bar)" strokeWidth={1.5} />
                    )}
                  </g>
                );
              })}
            </>
          )}
      </svg>
      {detail && (
        <div style={{ width, whiteSpace: 'nowrap' }} className="text-xs tabular-nums">
          {/* 칸(16px)이 "11/17"보다 좁아 매주 쓰면 겹친다: 첫 주·4주마다(4칸 눈금과 같은 간격)·마지막 주만 보이고
              마지막 주와 4칸 안쪽으로 붙는 라벨은 건너뛴다. 나머지 날짜는 스크린리더에만 남긴다(10 §6.2) */}
          {weekly.map((w, i) => {
            const shown = i === n - 1 || (i % 4 === 0 && n - 1 - i >= 4);
            return (
              <span key={w.weekStart} data-week-label style={col(i)}>
                <span className={shown ? undefined : 'sr-only'}>{md(w.weekStart)}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
