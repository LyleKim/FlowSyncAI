import { ArchCoupling, ArchGroup, ArchGroupKind, ArchTrend } from '../../../types';

// 그룹 색상: kind 기반 색조 + 같은 kind 내 구분을 위한 명도 변화
const KIND_HUES: Record<ArchGroupKind, number> = { backend: 215, frontend: 160, infra: 30, docs: 275, other: 220 };

export const KIND_LABEL: Record<ArchGroupKind, string> = {
  backend: '백엔드', frontend: '프론트엔드', infra: '인프라', docs: '문서', other: '기타',
};

export function kindColor(kind: ArchGroupKind): string {
  return `hsl(${KIND_HUES[kind]} ${kind === 'other' ? 10 : 70}% 52%)`;
}

/** 그룹별 고유 색 (같은 kind 안에서는 명도를 바꿔 구분) */
export function groupColors(groups: ArchGroup[]): Record<string, string> {
  const seen: Partial<Record<ArchGroupKind, number>> = {};
  const out: Record<string, string> = {};
  for (const g of groups) {
    const i = seen[g.kind] ?? 0;
    seen[g.kind] = i + 1;
    const light = Math.max(32, 52 + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 8);
    out[g.id] = `hsl(${KIND_HUES[g.kind] + Math.floor(i / 2) * 12} ${g.kind === 'other' ? 10 : 70}% ${light}%)`;
  }
  return out;
}

export const TREND_META: Record<ArchTrend, { label: string; symbol: string; cls: string }> = {
  rising: { label: '활발', symbol: '▲', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' },
  steady: { label: '꾸준', symbol: '■', cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900' },
  quiet: { label: '조용', symbol: '▼', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
};

export function trendMeta(trend: string) {
  return TREND_META[trend as ArchTrend] ?? TREND_META.quiet;
}

export type WeekRow = { weekStart: string; label: string; [groupId: string]: number | string };

/** recharts용 행 데이터. hidden 그룹은 제외. 그룹별 주차가 누락되면 0으로 채움. */
export function buildSeries(groups: ArchGroup[], hidden: ReadonlySet<string> = new Set()): WeekRow[] {
  const weeks = new Set<string>();
  for (const g of groups) for (const w of g.weekly) weeks.add(w.weekStart);
  return [...weeks].sort().map((weekStart) => {
    const row: WeekRow = { weekStart, label: weekStart.slice(5) };
    for (const g of groups) {
      if (hidden.has(g.id)) continue;
      row[g.id] = g.weekly.find((w) => w.weekStart === weekStart)?.commits ?? 0;
    }
    return row;
  });
}

export interface NodePos { id: string; x: number; y: number; r: number }

/** 원형 배치. 12시 방향에서 시계방향, 입력 순서 고정 -> 결정적. 반지름은 크기에 비례(최소 8, 최대 26). */
export function circularLayout(groups: ArchGroup[], size: number): NodePos[] {
  const n = groups.length;
  if (n === 0) return [];
  const c = size / 2;
  const rMax = 26;
  const ring = n === 1 ? 0 : c - rMax - 12;
  const scores = groups.map((g) => Math.sqrt(g.totalCommits + 1) * 2 + Math.sqrt(g.fileCount));
  const top = Math.max(...scores, 1);
  return groups.map((g, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return {
      id: g.id,
      x: round(c + ring * Math.cos(ang)),
      y: round(c + ring * Math.sin(ang)),
      r: round(8 + (scores[i] / top) * (rMax - 8)),
    };
  });
}

const round = (v: number) => Math.round(v * 100) / 100;

/** 선 굵기 1.5..8px. max<=0 이나 count<=0 이면 최소값. */
export function edgeWidth(count: number, max: number, min = 1.5, hi = 8): number {
  if (!(count > 0) || !(max > 0)) return min;
  return round(min + (Math.min(count, max) / max) * (hi - min));
}

export function maxCoupling(couplings: ArchCoupling[]): number {
  return couplings.reduce((m, c) => Math.max(m, c.count), 0);
}

export function couplingLabel(c: ArchCoupling, nameOf: (id: string) => string): string {
  return `${nameOf(c.a)} ↔ ${nameOf(c.b)}: ${c.count}개 커밋에서 함께 변경`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const REPO_URL_KEY = 'architecture:lastRepoUrl';
