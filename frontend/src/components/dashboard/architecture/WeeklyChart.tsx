import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ArchGroup } from '../../../types';
import { buildSeries } from './utils';

interface Props {
  groups: ArchGroup[];
  colors: Record<string, string>;
  hidden: Set<string>;
  onToggle: (id: string) => void;
  highlight: string | null;
  darkMode?: boolean;
}

export default function WeeklyChart({ groups, colors, hidden, onToggle, highlight, darkMode }: Props) {
  const data = useMemo(() => buildSeries(groups, hidden), [groups, hidden]);
  const visible = groups.filter((g) => !hidden.has(g.id));
  const axis = darkMode ? '#94a3b8' : '#64748b';
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm" aria-labelledby="arch-chart-title">
      <h3 id="arch-chart-title" className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">주간 커밋 추이 (그룹별)</h3>
      <p className="text-[11px] text-slate-400 mb-3">범례를 눌러 그룹을 켜고 끌 수 있습니다.</p>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="그룹 표시 전환">
        {groups.map((g) => {
          const off = hidden.has(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={!off}
              onClick={() => onToggle(g.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer transition focus-visible:outline-2 focus-visible:outline-blue-500 ${
                off ? 'border-slate-200 dark:border-slate-700 text-slate-400 line-through' : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: off ? 'transparent' : colors[g.id], border: `1.5px solid ${colors[g.id]}` }} />
              {g.name}
            </button>
          );
        })}
      </div>
      <div className="h-72" role="img" aria-label="그룹별 주간 커밋 수 누적 막대 차트">
        {visible.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">표시할 그룹이 없습니다.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e2e8f0'} vertical={false} />
              <XAxis dataKey="label" stroke={axis} fontSize={11} tickLine={false} />
              <YAxis stroke={axis} fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: darkMode ? '#0f172a' : '#fff', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, borderRadius: 8, fontSize: 12, color: darkMode ? '#e2e8f0' : '#1e293b' }}
                labelFormatter={(l) => `${l} 주 시작`}
              />
              {visible.map((g) => (
                <Bar
                  key={g.id}
                  dataKey={g.id}
                  name={g.name}
                  stackId="1"
                  stroke={colors[g.id]}
                  fill={colors[g.id]}
                  fillOpacity={highlight && highlight !== g.id ? 0.12 : 0.8}
                  strokeWidth={highlight === g.id ? 2 : 0}
                  maxBarSize={36}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
