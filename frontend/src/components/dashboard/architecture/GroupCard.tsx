import React, { useState } from 'react';
import { ChevronDown, FileText, GitCommit } from 'lucide-react';
import { ArchGroup } from '../../../types';
import { KIND_LABEL, formatDate, trendMeta } from './utils';

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 120, h = 28, max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  group: ArchGroup;
  color: string;
  selected: boolean;
  onSelect: () => void;
}

export default function GroupCard({ group: g, color, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const t = trendMeta(g.trend);
  return (
    <div
      className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-sm transition ${
        selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${g.name} 그룹 강조 ${selected ? '해제' : ''}`.trim()}
        className="w-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500 rounded"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} aria-hidden="true" />
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{g.name}</h4>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${t.cls}`}>
            <span aria-hidden="true">{t.symbol}</span>
            {t.label}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold">{KIND_LABEL[g.kind]}</span>
          <span>파일 {g.fileCount}개</span>
          <span>·</span>
          <span>커밋 {g.totalCommits}개</span>
        </div>
        <div className="mt-3"><Sparkline values={g.weekly.map((w) => w.commits)} color={color} /></div>
        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
          <div>최근 변경: {formatDate(g.lastChangeAt)}</div>
          <div className="truncate">작성자: {g.authors.length ? g.authors.join(', ') : '-'}</div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500 rounded"
      >
        <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
        최근 커밋 · 대표 파일
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-[11px]">
          <ul className="space-y-1">
            {g.recentCommits.length === 0 && <li className="text-slate-400">기간 내 커밋 없음</li>}
            {g.recentCommits.map((c) => (
              <li key={c.sha7} className="flex gap-1.5 text-slate-600 dark:text-slate-300">
                <GitCommit size={12} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0"><code className="font-mono text-slate-400">{c.sha7}</code> {c.message}
                  <span className="text-slate-400"> — {c.author}, {formatDate(c.date)}</span></span>
              </li>
            ))}
          </ul>
          <ul className="space-y-0.5">
            {g.samplePaths.map((p) => (
              <li key={p} className="flex gap-1.5 font-mono text-slate-500 dark:text-slate-400 break-all">
                <FileText size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
