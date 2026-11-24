import React, { useMemo, useState } from 'react';
import { ArchCoupling, ArchGroup } from '../../../types';
import { circularLayout, couplingLabel, edgeWidth, kindColor, maxCoupling } from './utils';

const SIZE = 440;
// 노드는 SIZE 안쪽에 배치되지만 라벨(최대 18자)은 노드보다 넓어서 좌우/하단 여백이 필요하다.
const LABEL_PAD_X = 72;
const LABEL_PAD_BOTTOM = 20;

interface Props {
  groups: ArchGroup[];
  couplings: ArchCoupling[];
  highlight: string | null;
  onSelect: (id: string) => void;
}

export default function CouplingGraph({ groups, couplings, highlight, onSelect }: Props) {
  const [active, setActive] = useState<ArchCoupling | null>(null);
  const nodes = useMemo(() => circularLayout(groups, SIZE), [groups]);
  const pos = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const nameOf = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
  const max = maxCoupling(couplings);
  const edges = couplings.filter((c) => pos[c.a] && pos[c.b]);
  const dim = (id: string) => highlight && highlight !== id && !edges.some((e) => (e.a === highlight && e.b === id) || (e.b === highlight && e.a === id));

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm" aria-labelledby="arch-graph-title">
      <h3 id="arch-graph-title" className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">관련도 그래프</h3>
      <p className="text-[11px] text-slate-400 mb-3">같은 커밋에서 함께 바뀐 그룹끼리 선으로 이어집니다. 선이 굵을수록 자주 함께 변경됩니다.</p>
      {edges.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">함께 변경된 그룹 쌍이 없습니다.</div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,460px)_1fr] gap-6 items-start">
          <svg viewBox={`${-LABEL_PAD_X} 0 ${SIZE + LABEL_PAD_X * 2} ${SIZE + LABEL_PAD_BOTTOM}`} className="w-full max-w-[560px] mx-auto" role="group" aria-label="그룹 관련도 그래프">
            {edges.map((e) => {
              const a = pos[e.a], b = pos[e.b];
              const on = active === e;
              return (
                <g key={`${e.a}-${e.b}`}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeLinecap="round"
                    className={on ? 'stroke-blue-500' : 'stroke-slate-300 dark:stroke-slate-600'}
                    strokeWidth={edgeWidth(e.count, max)}
                    opacity={highlight && e.a !== highlight && e.b !== highlight ? 0.2 : on ? 1 : 0.8} />
                  {/* 넓은 투명 hit 영역 */}
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} className="cursor-pointer"
                    tabIndex={0} role="button" aria-label={couplingLabel(e, nameOf)}
                    onMouseEnter={() => setActive(e)} onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(e)} onBlur={() => setActive(null)}
                    onClick={() => setActive(e)} />
                </g>
              );
            })}
            {groups.map((g) => {
              const n = pos[g.id];
              if (!n) return null;
              const sel = highlight === g.id;
              return (
                <g key={g.id} transform={`translate(${n.x} ${n.y})`} opacity={dim(g.id) ? 0.35 : 1}
                  tabIndex={0} role="button" aria-pressed={sel} aria-label={`${g.name}, 커밋 ${g.totalCommits}개, 파일 ${g.fileCount}개`}
                  className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-blue-500"
                  onClick={() => onSelect(g.id)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(g.id); } }}>
                  <circle r={n.r} fill={kindColor(g.kind)} className="stroke-white dark:stroke-slate-900" strokeWidth={sel ? 4 : 2} />
                  {sel && <circle r={n.r + 4} fill="none" className="stroke-blue-500" strokeWidth={2} />}
                  <text y={n.r + 13} textAnchor="middle" fontSize={10.5} fontWeight={600} className="fill-slate-600 dark:fill-slate-300 pointer-events-none select-none">
                    {g.name.length > 18 ? g.name.slice(0, 17) + '…' : g.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <div>
            <div className="min-h-10 text-xs font-semibold text-slate-700 dark:text-slate-200" aria-live="polite">
              {active ? couplingLabel(active, nameOf) : '선 위에 마우스를 올리거나 선택해 보세요.'}
            </div>
            <ol className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              {[...edges].sort((x, y) => y.count - x.count).map((e) => (
                <li key={`${e.a}-${e.b}`} className="flex justify-between gap-3 border-b border-slate-100 dark:border-slate-800 py-1">
                  <span className="truncate">{nameOf(e.a)} ↔ {nameOf(e.b)}</span><span className="font-mono shrink-0">{e.count}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
