import { describe, it, expect } from 'vitest';
import {
  barCells, isClipped, currentWeekIndex, describeWeekly, trendLabel, TREND_GLYPH,
  isReviewWaitingNoActivity, sortAreas, relativeDay, waitingDays, waitLabel, waitBarCells,
  summarizeAreas, miscShare, disconnectedAliases, MISC_WARN_SHARE,
} from './areaChart';
import type { Area, AreaAlias, AreaWeek } from '../types/areas';

const NOW = new Date('2026-11-25T03:00:00Z');
const wk = (weekStart: string, commits = 1): AreaWeek => ({ weekStart, commits, filesChanged: 1 });
const area = (o: Partial<Area> = {}): Area => ({
  id: 'a', name: 'a', displayName: 'a', alias: null, pathPrefix: 'a/', kind: 'backend',
  fileCount: 10, samplePaths: [], weekly: [], totalCommits: 0, lastChangeAt: null, authors: [],
  trend: 'steady', reviewWaiting: { prCount: 0, oldestRequestedAt: null }, ...o,
} as Area);

describe('barCells / isClipped', () => {
  it.each([[0, 0], [1, 1], [2, 1], [3, 2], [16, 8], [17, 8], [40, 8], [-3, 0], [NaN, 0]])('barCells(%s)=%s', (n, e) => {
    expect(barCells(n)).toBe(e);
  });
  it('isClipped', () => {
    expect(isClipped(16)).toBe(false);
    expect(isClipped(17)).toBe(true);
  });
});

describe('currentWeekIndex', () => {
  const gen = '2026-11-24T10:00:00Z';
  it('마지막 주가 진행 중', () => expect(currentWeekIndex([wk('2026-11-16'), wk('2026-11-23')], gen)).toBe(1));
  it('오래된 마지막 주', () => expect(currentWeekIndex([wk('2026-11-02'), wk('2026-11-09')], gen)).toBe(-1));
  it('빈 배열', () => expect(currentWeekIndex([], gen)).toBe(-1));
});

describe('describeWeekly', () => {
  const w = [4, 6, 10, 14, 16].map((c, i) => wk(`2026-10-${String(26 - 7 * (4 - i) + 7).padStart(2, '0')}`, c));
  it('진행 중인 주', () => expect(describeWeekly(w, 4, 30)).toBe('5주 커밋: 4, 6, 10, 14, 16개(마지막은 진행 중인 주)'));
  it('진행 주 없음, 17+ 실제 값', () => expect(describeWeekly([wk('2026-11-02', 40)], -1, 30)).toBe('1주 커밋: 40개'));
  it('전부 0', () => expect(describeWeekly([wk('2026-11-02', 0)], 0, 30)).toBe('최근 30일 활동 없음'));
  it('빈 배열', () => expect(describeWeekly([], -1, 30)).toBe('주간 데이터 없음'));
});

describe('trend', () => {
  it('라벨·글리프', () => {
    expect(trendLabel('rising')).toBe('활발해짐');
    expect(trendLabel('steady')).toBe('꾸준함');
    expect(trendLabel('quiet')).toBe('활동 적음');
    expect(TREND_GLYPH).toEqual({ rising: '▲', steady: '■', quiet: '▼' });
  });
  it('isReviewWaitingNoActivity', () => {
    const rw = (n: number) => ({ prCount: n, oldestRequestedAt: null });
    expect(isReviewWaitingNoActivity({ trend: 'quiet', reviewWaiting: rw(1) })).toBe(true);
    expect(isReviewWaitingNoActivity({ trend: 'quiet', reviewWaiting: rw(0) })).toBe(false);
    expect(isReviewWaitingNoActivity({ trend: 'rising', reviewWaiting: rw(3) })).toBe(false);
  });
});

describe('sortAreas', () => {
  it('recent: null 마지막, 원본 불변', () => {
    const list = [area({ id: 'n', lastChangeAt: null }), area({ id: 'o', lastChangeAt: '2026-11-01T00:00:00Z' }), area({ id: 'x', lastChangeAt: '2026-11-20T00:00:00Z' })];
    expect(sortAreas(list, 'recent').map((a) => a.id)).toEqual(['x', 'o', 'n']);
    expect(list.map((a) => a.id)).toEqual(['n', 'o', 'x']);
  });
  it('waiting: prCount 내림차순, 동률은 오래된 요청 먼저', () => {
    const r = (n: number, d: string | null) => ({ reviewWaiting: { prCount: n, oldestRequestedAt: d } });
    const list = [area({ id: 'a', ...r(1, '2026-11-20T00:00:00Z') }), area({ id: 'b', ...r(2, '2026-11-22T00:00:00Z') }), area({ id: 'c', ...r(2, '2026-11-18T00:00:00Z') })];
    expect(sortAreas(list, 'waiting').map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });
  it('name: 한글 정렬', () => {
    const list = [area({ id: '1', displayName: '하' }), area({ id: '2', displayName: '가' })];
    expect(sortAreas(list, 'name').map((a) => a.id)).toEqual(['2', '1']);
  });
});

describe('relativeDay / wait', () => {
  it('오늘·어제·N일 전·미래', () => {
    expect(relativeDay('2026-11-25T00:00:00Z', NOW)).toBe('오늘');
    expect(relativeDay('2026-11-24T20:00:00Z', NOW)).toBe('어제');
    expect(relativeDay('2026-11-20T00:00:00Z', NOW)).toBe('5일 전');
    expect(relativeDay('2026-11-30T00:00:00Z', NOW)).toBe('오늘');
    expect(relativeDay(null, NOW)).toBe('변경 기록 없음');
  });
  it('days 초과', () => {
    expect(relativeDay('2026-10-15T00:00:00Z', NOW, 30)).toBe('41일 전 (30일 밖)');
  });
  it('waitingDays·라벨·칸', () => {
    expect(waitingDays('2026-11-20T03:00:00Z', NOW)).toBe(5);
    expect(waitingDays('2026-12-01T00:00:00Z', NOW)).toBe(0);
    expect(waitLabel(0)).toBe('최장 1일 미만');
    expect(waitLabel(4)).toBe('최장 4일');
    expect(waitLabel(9)).toBe('최장 7일+');
    expect([0, 3, 9].map(waitBarCells)).toEqual([1, 3, 7]);
  });
});

describe('summarizeAreas', () => {
  it('07 §2.4 문단', () => {
    const areas = [
      area({ displayName: '백엔드 API', trend: 'rising', reviewWaiting: { prCount: 1, oldestRequestedAt: '2026-11-20T03:00:00Z' } }),
      area({ trend: 'steady', reviewWaiting: { prCount: 1, oldestRequestedAt: '2026-11-23T03:00:00Z' } }),
      area({ trend: 'quiet' }),
    ];
    expect(summarizeAreas(areas, 30, 41, NOW)).toBe(
      '최근 30일, 분석한 커밋 41개. 영역 3개. 활발해짐 1, 꾸준함 1, 활동 적음 1. 리뷰 대기가 있는 영역 2개, 최장 5일(백엔드 API).',
    );
  });
  it('영역 0개, 금지어 없음', () => {
    const s = summarizeAreas([], 30, 0, NOW);
    expect(s).toBe('최근 30일, 분석한 커밋 0개. 영역 0개');
    expect(s).not.toMatch(/진행률|완료/);
  });
});

describe('miscShare / disconnectedAliases', () => {
  it('miscShare', () => {
    const a = area({ pathPrefix: 'a/', fileCount: 5 });
    const m = area({ pathPrefix: '@misc', fileCount: 4 });
    expect(miscShare([a, m], m)).toBeCloseTo(4 / 9);
    expect(miscShare([a, m], a)).toBeNull();
    expect(MISC_WARN_SHARE).toBe(0.3);
  });
  it('disconnectedAliases', () => {
    const al = (id: number, pathPrefix: string, status: AreaAlias['status']): AreaAlias => ({ id, repoId: 1, pathPrefix, displayName: 'x', status, createdAt: '', updatedAt: '' });
    const res = disconnectedAliases(
      [al(1, 'a/', 'disconnected'), al(2, 'gone/', 'disconnected'), al(3, 'gone2/', 'connected')],
      [area({ pathPrefix: 'a/' })],
    );
    expect(res.map((x) => x.id)).toEqual([2]);
  });
});
