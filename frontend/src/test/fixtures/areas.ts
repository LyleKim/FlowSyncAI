import type { Area, AreaAlias, AreaDetail, AreasResponse, WaitingPr } from '../../types/areas';

// 마지막 주(11/23 시작)가 GENERATED_AT의 현재 주
export const AREAS_NOW = new Date('2026-11-25T03:00:00Z');
export const GENERATED_AT = '2026-11-25T02:55:00Z';
export const WEEK_STARTS = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'];

export function makeArea(over: Partial<Area> & { commits?: number[] } = {}): Area {
  const { commits = [4, 6, 10, 14, 16], ...rest } = over;
  return {
    id: 'backend-payments',
    name: 'backend/payments',
    displayName: '결제 흐름',
    alias: null,
    pathPrefix: 'backend/payments',
    kind: 'backend',
    fileCount: 22,
    samplePaths: ['backend/payments/views.py'],
    weekly: commits.map((c, i) => ({ weekStart: WEEK_STARTS[i], commits: c, filesChanged: c })),
    totalCommits: commits.reduce((s, c) => s + c, 0),
    lastChangeAt: '2026-11-24T08:00:00Z',
    authors: ['jun-ho', 'minji-park'],
    trend: 'rising',
    reviewWaiting: { prCount: 0, oldestRequestedAt: null },
    ...rest,
  };
}

export function makeAreasResponse(over: Partial<AreasResponse> = {}): AreasResponse {
  return {
    repoId: 1,
    generatedAt: GENERATED_AT,
    days: 30,
    truncated: false,
    analyzedCommits: 41,
    areas: [makeArea()],
    couplings: [],
    ...over,
  };
}

export function makeAlias(over: Partial<AreaAlias> = {}): AreaAlias {
  return {
    id: 9,
    repoId: 1,
    pathPrefix: 'backend/x',
    displayName: '옛 정산',
    status: 'disconnected',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...over,
  };
}

export function makeWaitingPr(over: Partial<WaitingPr> = {}): WaitingPr {
  return {
    repo: 'acme/api',
    number: 58,
    title: '결제 재시도 정리',
    url: 'https://github.com/acme/api/pull/58',
    author: 'jun-ho',
    isDraft: false,
    requestedReviewers: ['minji-park', 'sora'],
    oldestRequestedAt: '2026-11-22T03:00:00Z',
    size: { additions: 40, deletions: 10, changedFiles: 5 },
    primaryAreaId: 'backend-payments',
    isPrimary: true,
    touchedAreas: [
      { areaId: 'backend-payments', displayName: '결제 흐름', fileCount: 4 },
      { areaId: 'frontend-checkout', displayName: '결제 화면', fileCount: 1 },
    ],
    unmapped: 0,
    filesTruncated: false,
    ...over,
  };
}

export function makeAreaDetail(over: Partial<AreaDetail> & { commits?: number[] } = {}): AreaDetail {
  const { recentCommits, waitingPullRequests, coupledWith, ...rest } = over;
  return {
    ...makeArea(rest),
    recentCommits: recentCommits ?? [
      { sha7: 'a1b2c3d', message: '결제 재시도 횟수 조정\n\n본문', author: 'jun-ho', date: '2026-11-24T08:00:00Z' },
    ],
    waitingPullRequests: waitingPullRequests ?? [makeWaitingPr()],
    coupledWith: coupledWith ?? [
      { areaId: 'frontend-checkout', count: 2 },
      { areaId: 'backend-ledger', count: 7 },
    ],
  };
}
