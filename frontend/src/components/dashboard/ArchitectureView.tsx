import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Network, RefreshCw, Search } from 'lucide-react';
import { ArchitectureResponse } from '../../types';
import { fetchArchitecture } from '../../services/architectureApi';
import WeeklyChart from './architecture/WeeklyChart';
import GroupCard from './architecture/GroupCard';
import CouplingGraph from './architecture/CouplingGraph';
import { REPO_URL_KEY, formatDateTime, groupColors } from './architecture/utils';

const RANGES = [30, 60, 90, 180];

function loadUrl(): string {
  try { return localStorage.getItem(REPO_URL_KEY) ?? ''; } catch { return ''; }
}

export default function ArchitectureView({ darkMode }: { darkMode?: boolean }) {
  const [url, setUrl] = useState(loadUrl);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ArchitectureResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);

  const run = useCallback(async (refresh: boolean, d = days) => {
    const target = url.trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchArchitecture(target, d, refresh));
      setHidden(new Set());
      setHighlight(null);
      try { localStorage.setItem(REPO_URL_KEY, target); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [url, days]);

  const colors = useMemo(() => groupColors(data?.groups ?? []), [data]);
  const toggle = (id: string) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const select = (id: string) => setHighlight((h) => (h === id ? null : id));
  const empty = data && data.analyzedCommits === 0;

  const inputCls = 'px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500';

  return (
    <div className="space-y-6 pb-12" id="architecture-view">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(false); }}>
        <label className="flex-1 min-w-64 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          GitHub 저장소 URL
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo"
            className={`${inputCls} block w-full mt-1`} />
        </label>
        <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          분석 기간
          <select value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); if (data) run(false, d); }} className={`${inputCls} block mt-1`}>
            {RANGES.map((r) => <option key={r} value={r}>최근 {r}일</option>)}
          </select>
        </label>
        <button type="submit" disabled={loading || !url.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
          <Search size={14} /> 분석
        </button>
        <button type="button" disabled={loading || !url.trim()} onClick={() => run(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 새로고침
        </button>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="분석 중">
          <div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-72 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-xl bg-slate-200 dark:bg-slate-800" />)}
          </div>
        </div>
      )}

      {!loading && !data && !error && (
        <div className="py-16 text-center text-xs text-slate-400">
          <Network size={32} className="mx-auto mb-3 opacity-50" />
          저장소 URL을 입력하면 기능 그룹별 변경 흐름을 보여드립니다.
        </div>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400" role="status">
            <span className="font-bold text-slate-800 dark:text-slate-100">{data.repo.owner}/{data.repo.name}</span>
            <span>그룹 <b className="text-slate-800 dark:text-slate-100">{data.groups.length}</b>개</span>
            <span>분석 커밋 <b className="text-slate-800 dark:text-slate-100">{data.analyzedCommits}</b>개 (최근 {data.days}일)</span>
            <span>생성 {formatDateTime(data.generatedAt)}</span>
            {data.truncated && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                <AlertTriangle size={12} /> 최근 병합 제외 커밋 60개만 분석했습니다 (일부 누락 가능)
              </span>
            )}
          </div>

          {empty ? (
            <div className="py-14 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
              최근 {data.days}일 동안 커밋이 없습니다. 더 긴 기간(예: 90일, 180일)을 선택해 보세요.
            </div>
          ) : (
            <>
              <WeeklyChart groups={data.groups} colors={colors} hidden={hidden} onToggle={toggle} highlight={highlight} darkMode={darkMode} />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.groups.map((g) => (
                  <React.Fragment key={g.id}><GroupCard group={g} color={colors[g.id]} selected={highlight === g.id} onSelect={() => select(g.id)} /></React.Fragment>
                ))}
              </div>
              <CouplingGraph groups={data.groups} couplings={data.couplings} highlight={highlight} onSelect={select} />
            </>
          )}
        </>
      )}
    </div>
  );
}
