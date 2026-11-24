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
    <div className={`inline-block text-(--text-muted) ${detail ? 'px-3' : ''}`}>
      {detail && (
        <div aria-hidden="true" style={{ width, whiteSpace: 'nowrap' }} className="text-xs tabular-nums">
          {weekly.map((w, i) => (
            <span key={w.weekStart} style={col(i)}>{w.commits}</span>
          ))}
        </div>
      )}
      <svg role="img" aria-label={name} viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT}>
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
                stroke="var(--text-muted)"
                strokeDasharray="2 2"
              />
            ))
          : (
            <>
              <line data-floor x1={0} x2={width} y1={FLOOR} y2={FLOOR} stroke="var(--text-muted)" />
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
                      fill={now ? 'none' : 'var(--text-muted)'}
                      stroke={now ? 'var(--accent)' : undefined}
                      strokeWidth={now ? INSET * 2 : undefined}
                    />
                    {isClipped(w.commits) && (
                      <line data-clipped x1={x} x2={x + BAR_W} y1={TOP - 1} y2={TOP - 1} stroke="var(--text-muted)" strokeWidth={1.5} />
                    )}
                  </g>
                );
              })}
            </>
          )}
      </svg>
      {detail && (
        <div style={{ width, whiteSpace: 'nowrap' }} className="text-xs tabular-nums">
          {weekly.map((w, i) => (
            <span key={w.weekStart} style={col(i)}>{md(w.weekStart)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
