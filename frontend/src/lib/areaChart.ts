import type { Area, AreaAlias, AreaTrend, AreaWeek } from '../types/areas';

export const BAR_STEP = 2;
export const BAR_MAX_CELLS = 8;
// 임시값: 06 예시 38%에서 역산한 추정
export const MISC_WARN_SHARE = 0.3;

const DAY_MS = 86_400_000;

// 올림: 1커밋도 0과 눈으로 구분되게
export function barCells(commits: number): number {
  if (!(commits > 0)) return 0;
  return Math.min(BAR_MAX_CELLS, Math.ceil(commits / BAR_STEP));
}

export const isClipped = (commits: number): boolean => commits > BAR_STEP * BAR_MAX_CELLS;

export function currentWeekIndex(weekly: AreaWeek[], generatedAt: string): number {
  if (weekly.length === 0) return -1;
  const start = Date.parse(weekly[weekly.length - 1].weekStart);
  const at = Date.parse(generatedAt);
  return start <= at && at < start + 7 * DAY_MS ? weekly.length - 1 : -1;
}

export function describeWeekly(weekly: AreaWeek[], currentIdx: number, days: number): string {
  if (weekly.length === 0) return '주간 데이터 없음';
  if (weekly.every((w) => w.commits === 0)) return `최근 ${days}일 활동 없음`;
  const tail = currentIdx === weekly.length - 1 ? '(마지막은 진행 중인 주)' : '';
  return `${weekly.length}주 커밋: ${weekly.map((w) => w.commits).join(', ')}개${tail}`;
}

const TREND_LABEL: Record<AreaTrend, string> = { rising: '활발해짐', steady: '꾸준함', quiet: '활동 적음' };
export const trendLabel = (t: AreaTrend): string => TREND_LABEL[t];
// 장식용. 글자가 1차 정보
export const TREND_GLYPH: Record<AreaTrend, string> = { rising: '▲', steady: '■', quiet: '▼' };

export const isReviewWaitingNoActivity = (a: Pick<Area, 'trend' | 'reviewWaiting'>): boolean =>
  a.trend === 'quiet' && a.reviewWaiting.prCount > 0;

// 정체 신호 행을 위로 올리는 정렬은 만들지 않는다(06 §4.3)
export function sortAreas(areas: Area[], key: 'recent' | 'waiting' | 'name'): Area[] {
  const t = (s: string | null) => (s ? Date.parse(s) : Infinity);
  const ts = (s: string | null) => (s ? Date.parse(s) : -1e18);
  const cmp: Record<typeof key, (a: Area, b: Area) => number> = {
    recent: (a, b) => ts(b.lastChangeAt) - ts(a.lastChangeAt) || 0,
    waiting: (a, b) => {
      const d = b.reviewWaiting.prCount - a.reviewWaiting.prCount;
      if (d) return d;
      const x = t(a.reviewWaiting.oldestRequestedAt);
      const y = t(b.reviewWaiting.oldestRequestedAt);
      return x < y ? -1 : x > y ? 1 : 0;
    },
    name: (a, b) => a.displayName.localeCompare(b.displayName, 'ko'),
  };
  return [...areas].sort(cmp[key]);
}

const utcDay = (ms: number) => Math.floor(ms / DAY_MS);

export function relativeDay(iso: string | null, now: Date, days = 30): string {
  if (!iso) return '변경 기록 없음';
  const diff = Math.max(0, utcDay(now.getTime()) - utcDay(Date.parse(iso)));
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return diff > days ? `${diff}일 전 (${days}일 밖)` : `${diff}일 전`;
}

export const waitingDays = (iso: string, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));

export const waitLabel = (days: number): string =>
  days < 1 ? '최장 1일 미만' : days >= 7 ? '최장 7일+' : `최장 ${days}일`;

export const waitBarCells = (days: number): number => Math.min(7, Math.max(1, days));

export function summarizeAreas(areas: Area[], days: number, analyzedCommits: number, now: Date): string {
  const head = `최근 ${days}일, 분석한 커밋 ${analyzedCommits}개. 영역 ${areas.length}개`;
  if (areas.length === 0) return head;
  const n = (t: AreaTrend) => areas.filter((a) => a.trend === t).length;
  const trends = `${trendLabel('rising')} ${n('rising')}, ${trendLabel('steady')} ${n('steady')}, ${trendLabel('quiet')} ${n('quiet')}`;
  const waiting = areas.filter((a) => a.reviewWaiting.prCount > 0);
  let tail = '리뷰 대기가 있는 영역 없음.';
  if (waiting.length > 0) {
    const dated = waiting.filter((a) => a.reviewWaiting.oldestRequestedAt);
    const oldest = dated.sort((a, b) => Date.parse(a.reviewWaiting.oldestRequestedAt!) - Date.parse(b.reviewWaiting.oldestRequestedAt!))[0];
    const longest = oldest ? `, ${waitLabel(waitingDays(oldest.reviewWaiting.oldestRequestedAt!, now))}(${oldest.displayName})` : '';
    tail = `리뷰 대기가 있는 영역 ${waiting.length}개${longest}.`;
  }
  return `${head}. ${trends}. ${tail}`;
}

export function miscShare(areas: Area[], a: Area): number | null {
  if (a.pathPrefix !== '@misc') return null;
  const total = areas.reduce((s, x) => s + x.fileCount, 0);
  return total > 0 ? a.fileCount / total : 0;
}

export const disconnectedAliases = (aliases: AreaAlias[], areas: Area[]): AreaAlias[] =>
  aliases.filter((al) => al.status === 'disconnected' && !areas.some((a) => a.pathPrefix === al.pathPrefix));
