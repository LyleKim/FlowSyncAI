import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { areaHref } from '../../lib/areaRoute';
import type { Area, AreasResponse } from '../../types/areas';

const TOP = 10;
const NARROW = 480;
const MAX_W = 640;
const LABEL_GAP = 10;
const V_PAD = 30; // 위·아래 라벨 한 줄 + 여백

// 툴팁(최대 256px) 반폭: 그래프 밖으로 나가지 않게 가운데 좌표를 이만큼 안쪽으로 묶는다
const TIP_HALF = (w: number) => Math.min(128, w / 2 - 4);

type Coupling = AreasResponse['couplings'][number];

interface Props {
  couplings: Coupling[];
  areas: Area[];
  repoId: number;
  days?: number;
  truncated: boolean;
  analyzedCommits: number;
}

// 고정 눈금(영역 막대와 같은 문법): 커밋 2개 = 1px, 16개 이상은 8px에서 멈춘다. 최댓값으로 정규화하지 않는다.
export const edgeWidth = (count: number) => Math.min(8, Math.max(1, Math.ceil(count / 2)));

const short = (s: string, max: number) => ([...s].length > max ? `${[...s].slice(0, max).join('')}…` : s);
const textW = (s: string) => [...s].reduce((w, ch) => w + (/[ᄀ-퟿]/.test(ch) ? 13 : 7.5), 0);
const pairKey = (c: Coupling) => `${c.a}|${c.b}`;

function useWidth(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(MAX_W);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.min(MAX_W, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  return [ref, w] as const;
}

export function CouplingMap({ couplings, areas, repoId, days, truncated, analyzedCommits }: Props) {
  const [ref, width] = useWidth(areas.length >= 2 && couplings.length > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const wasSelected = useRef(false);

  if (areas.length < 2) {
    return <p className="text-body-sm text-muted">영역이 2개 이상이어야 함께 바뀐 영역을 볼 수 있어요.</p>;
  }
  if (couplings.length === 0) {
    return <p className="text-body-sm text-muted">같은 커밋에서 함께 바뀐 영역이 없어요(영역 {areas.length}개).</p>;
  }

  const top = [...couplings].sort((x, y) => y.count - x.count).slice(0, TOP);
  const names = new Map(areas.map((a) => [a.id, a.displayName]));
  const nameOf = (id: string) => names.get(id) ?? id;
  // 강한 쌍부터 원 둘레에 이웃하게 놓고, 결합 없는 영역은 뒤에 이어 붙인다
  const order: string[] = [];
  for (const c of top) for (const id of [c.a, c.b]) if (!order.includes(id)) order.push(id);
  const coupled = new Set(order);
  for (const a of areas) if (!coupled.has(a.id)) order.push(a.id);

  // 좁은 폭: 라벨 약식(선택하면 아래에 전체 이름)
  const narrow = width < NARROW;
  // 'Frontend / Components'처럼 경로형 이름은 좁은 폭에서 구분되는 마지막 마디만 남긴다
  const label = (id: string) => (narrow ? short(nameOf(id).split(' / ').pop()!, 6) : short(nameOf(id), 24));
  const labelW = Math.max(...order.map((id) => textW(label(id))));
  const R = Math.max(48, Math.min(170, width / 2 - labelW - LABEL_GAP - 4));
  const cx = width / 2;
  const cy = R + V_PAD;
  const height = 2 * (R + V_PAD);
  const pos = new Map(
    order.map((id, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / order.length;
      return [id, { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t), cos: Math.cos(t), sin: Math.sin(t) }];
    }),
  );

  const neighbors = (id: string) => top.filter((c) => c.a === id || c.b === id);
  const linked = selected ? new Set(neighbors(selected).flatMap((c) => [c.a, c.b]).concat(selected)) : null;
  const edgeText = (c: Coupling) => `${nameOf(c.a)} ↔ ${nameOf(c.b)} · 커밋 ${c.count}개`;

  const geom = (c: Coupling) => {
    const p = pos.get(c.a)!;
    const q = pos.get(c.b)!;
    // 중심 쪽으로 휜 곡선: 이웃한 영역끼리의 선이 라벨을 덮지 않게
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const k = { x: mx + (cx - mx) * 0.5, y: my + (cy - my) * 0.5 };
    return { d: `M${p.x} ${p.y} Q${k.x} ${k.y} ${q.x} ${q.y}`, mid: { x: 0.25 * p.x + 0.5 * k.x + 0.25 * q.x, y: 0.25 * p.y + 0.5 * k.y + 0.25 * q.y } };
  };

  const nodeKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Escape') setSelected(null);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected((s) => (s === id ? null : id));
    }
  };

  const areaLink = (id: string, cls = '') =>
    names.has(id) ? (
      <Link
        to={areaHref(id, { repoId, days })}
        className={`inline-block min-h-6 font-semibold underline underline-offset-3 wrap-anywhere focus-visible:outline-2 focus-visible:outline-focus-ring ${cls}`}
      >
        {nameOf(id)}
      </Link>
    ) : (
      <span className="wrap-anywhere">{id}</span>
    );

  const tipCoupling = top.find((c) => pairKey(c) === tip);
  const tipPos = tipCoupling && geom(tipCoupling).mid;
  const notes = [
    couplings.length > TOP && `상위 ${TOP}쌍만 그렸어요(전체 ${couplings.length}쌍)`,
    truncated && `최근 커밋 ${analyzedCommits}개만 분석`,
  ].filter(Boolean);

  let panel: ReactNode = '영역을 누르면 함께 바뀐 영역만 강조해요. 선에 올리거나 누르면 커밋 수가 보여요.';
  if (selected) {
    const ns = neighbors(selected).map((c) => ({ id: c.a === selected ? c.b : c.a, count: c.count }));
    panel = (
      <>
        {areaLink(selected)}
        {ns.length === 0 ? (
          <span>: 상위 {TOP}쌍 안에서 함께 바뀐 영역이 없어요.</span>
        ) : (
          <>
            <span> · 함께 바뀐 영역 {ns.length}개: </span>
            {ns.map((n, i) => (
              <span key={n.id}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                {areaLink(n.id, 'font-normal')} <span className="tabular-nums">커밋 {n.count}개</span>
              </span>
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      {/* 범례: 굵기 눈금은 고정, 노드는 결합 여부 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted">
        <span className="flex items-center gap-2">
          <svg aria-hidden="true" width="84" height="12" viewBox="0 0 84 12">
            {[2, 8, 16].map((n, i) => (
              <line key={n} x1={i * 30} x2={i * 30 + 22} y1={6} y2={6} stroke="var(--chart-bar)" strokeWidth={edgeWidth(n)} strokeLinecap="round" />
            ))}
          </svg>
          <span>선 굵기: 커밋 2개 = 1px, 16개 이상은 8px(같은 눈금)</span>
        </span>
        <span className="flex items-center gap-2">
          <svg aria-hidden="true" width="36" height="12" viewBox="0 0 36 12">
            <circle cx={6} cy={6} r={5} fill="var(--chart-bar)" />
            <circle cx={26} cy={6} r={4.25} fill="var(--surface-raised)" stroke="var(--border-strong)" strokeWidth={1.5} />
          </svg>
          <span>함께 바뀐 영역 있음 · 없음</span>
        </span>
      </div>

      <div ref={ref} className="max-w-160 rounded border border-border bg-surface-raised py-2">
        <div
          role="group"
          aria-label={`함께 바뀐 영역 그래프: 영역 ${order.length}개, ${top.length}쌍. 영역을 고르면 연결된 영역을 강조해요.`}
          className="relative mx-auto"
          style={{ width, height }}
        >
          {/* 노드 층이 DOM에서 먼저: Tab이 영역 → 선 순서로 간다. 그리기는 z-index로 선 위에 */}
          <svg width={width} height={height} className="pointer-events-none absolute inset-0 z-10 overflow-visible">
            {order.map((id) => {
              const p = pos.get(id)!;
              const on = selected === id;
              const dim = linked && !linked.has(id);
              const lone = !coupled.has(id);
              const anchor = p.cos > 0.3 ? 'start' : p.cos < -0.3 ? 'end' : 'middle';
              const base = p.sin > 0.3 ? 'hanging' : p.sin < -0.3 ? 'auto' : 'middle';
              const count = neighbors(id).length;
              return (
                <g
                  key={id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  aria-label={`${nameOf(id)}, 함께 바뀐 영역 ${count}개`}
                  data-uncoupled={lone || undefined}
                  data-dim={dim || undefined}
                  onPointerDown={() => (wasSelected.current = on)}
                  onFocus={() => setSelected(id)}
                  onClick={() => setSelected(wasSelected.current ? null : id)}
                  onKeyDown={nodeKey(id)}
                  className="group pointer-events-auto cursor-pointer focus:outline-0"
                  style={{ opacity: dim ? 0.3 : 1, transition: 'opacity 150ms var(--ease-out)' }}
                >
                  <title>{nameOf(id)}</title>
                  <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
                  <circle cx={p.x} cy={p.y} r={11} fill="none" strokeWidth={2} className="stroke-transparent group-focus-visible:stroke-focus-ring" />
                  {lone ? (
                    <circle cx={p.x} cy={p.y} r={4.25} fill="var(--surface-raised)" stroke="var(--border-strong)" strokeWidth={1.5} />
                  ) : (
                    <circle cx={p.x} cy={p.y} r={on ? 7 : 5.5} fill="var(--chart-bar)" stroke="var(--surface-raised)" strokeWidth={2} />
                  )}
                  <text
                    x={p.x + p.cos * (LABEL_GAP + 4)}
                    y={p.y + p.sin * (LABEL_GAP + 4)}
                    textAnchor={anchor}
                    dominantBaseline={base}
                    fontSize={13}
                    fontWeight={on ? 700 : coupled.has(id) ? 600 : 400}
                    fill={lone ? 'var(--text-muted)' : 'var(--text)'}
                  >
                    {label(id)}
                  </text>
                </g>
              );
            })}
          </svg>
          <svg width={width} height={height} className="absolute inset-0 overflow-visible">
            {top.map((c) => {
              const { d } = geom(c);
              const k = pairKey(c);
              const w = edgeWidth(c.count);
              const dim = linked && !(c.a === selected || c.b === selected);
              const hot = tip === k || (linked && !dim);
              return (
                <g key={k}>
                  <path
                    aria-hidden="true"
                    d={d}
                    fill="none"
                    stroke="var(--chart-bar)"
                    strokeWidth={w}
                    strokeLinecap="round"
                    style={{ opacity: dim ? 0.1 : hot ? 1 : 0.65, transition: 'opacity 150ms var(--ease-out)' }}
                  />
                  <path
                    role="img"
                    tabIndex={0}
                    aria-label={edgeText(c)}
                    data-width={w}
                    data-dim={dim || undefined}
                    d={d}
                    fill="none"
                    strokeWidth={Math.max(16, w + 10)}
                    className="cursor-pointer stroke-transparent focus:outline-0 focus-visible:stroke-focus-ring/30"
                    onMouseEnter={() => setTip(k)}
                    onMouseLeave={() => setTip((t) => (t === k ? null : t))}
                    onFocus={() => setTip(k)}
                    onBlur={() => setTip((t) => (t === k ? null : t))}
                    onClick={() => setTip(k)}
                  />
                </g>
              );
            })}
          </svg>
          {tipCoupling && tipPos && (
            <div
              data-testid="coupling-tip"
              aria-hidden="true"
              className="pointer-events-none absolute z-20 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded border border-border-strong bg-surface-raised px-2 py-1 text-caption shadow-overlay"
              style={{ left: Math.min(width - TIP_HALF(width), Math.max(TIP_HALF(width), tipPos.x)), top: tipPos.y - 8 }}
            >
              {nameOf(tipCoupling.a)} ↔ {nameOf(tipCoupling.b)} · <span className="font-semibold tabular-nums">커밋 {tipCoupling.count}개</span>
            </div>
          )}
        </div>
      </div>

      <p aria-live="polite" data-testid="coupling-detail" className="min-h-6 text-body-sm wrap-anywhere">{panel}</p>
      {notes.length > 0 && <p className="text-caption text-muted">{notes.join(' · ')}</p>}

      <details>
        <summary className="inline-block min-h-6 cursor-pointer text-body-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring">
          목록으로 보기
        </summary>
        <ol aria-label="함께 바뀐 영역" className="mt-2 space-y-2 text-body-sm">
          {top.map((c) => (
            <li key={pairKey(c)} className="wrap-anywhere">
              {areaLink(c.a)} <span aria-hidden="true">↔</span>
              <span className="sr-only">그리고</span> {areaLink(c.b)}{' '}
              <span className="text-muted tabular-nums">커밋 {c.count}개</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
