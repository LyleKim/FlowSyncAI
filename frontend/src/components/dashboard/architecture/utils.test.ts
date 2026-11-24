import { describe, it, expect } from 'vitest';
import { ArchGroup } from '../../../types';
import { buildSeries, circularLayout, edgeWidth, trendMeta, formatDate, groupColors, couplingLabel } from './utils';

const g = (id: string, over: Partial<ArchGroup> = {}): ArchGroup => ({
  id, name: id, kind: 'backend', fileCount: 4, samplePaths: [], totalCommits: 3,
  lastChangeAt: null, authors: [], recentCommits: [], trend: 'steady',
  weekly: [
    { weekStart: '2026-10-26', commits: 2, filesChanged: 3 },
    { weekStart: '2026-11-02', commits: 0, filesChanged: 0 },
  ],
  ...over,
});

describe('buildSeries', () => {
  it('keeps zero weeks and one row per week', () => {
    const rows = buildSeries([g('a'), g('b')]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ weekStart: '2026-11-02', a: 0, b: 0 });
    expect(rows[0].a).toBe(2);
  });
  it('excludes hidden groups but keeps the weeks', () => {
    const rows = buildSeries([g('a'), g('b')], new Set(['b']));
    expect(rows).toHaveLength(2);
    expect('b' in rows[0]).toBe(false);
    expect('a' in rows[0]).toBe(true);
  });
  it('fills missing weeks with 0 and sorts them', () => {
    const rows = buildSeries([g('a'), g('b', { weekly: [{ weekStart: '2026-11-09', commits: 5, filesChanged: 1 }] })]);
    expect(rows.map((r) => r.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
    expect(rows[0].b).toBe(0);
    expect(rows[2].b).toBe(5);
    expect(rows[2].a).toBe(0);
  });
  it('handles empty input', () => expect(buildSeries([])).toEqual([]));
});

describe('circularLayout', () => {
  const groups = ['a', 'b', 'c', 'd', 'e'].map((id, i) => g(id, { totalCommits: i * 10 }));
  it('is deterministic', () => {
    expect(circularLayout(groups, 400)).toEqual(circularLayout(groups, 400));
  });
  it('keeps nodes inside the canvas', () => {
    for (const n of circularLayout(groups, 400)) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0);
      expect(n.x + n.r).toBeLessThanOrEqual(400);
      expect(n.y - n.r).toBeGreaterThanOrEqual(0);
      expect(n.y + n.r).toBeLessThanOrEqual(400);
    }
  });
  it('first node at 12 o\'clock; bigger activity -> bigger radius', () => {
    const l = circularLayout(groups, 400);
    expect(l[0].x).toBeCloseTo(200);
    expect(l[0].y).toBeLessThan(200);
    expect(l[4].r).toBeGreaterThan(l[0].r);
  });
  it('single node centered, empty -> []', () => {
    const [n] = circularLayout([g('a')], 300);
    expect([n.x, n.y]).toEqual([150, 150]);
    expect(circularLayout([], 300)).toEqual([]);
  });
});

describe('edgeWidth', () => {
  it('scales between min and max', () => {
    expect(edgeWidth(10, 10)).toBe(8);
    expect(edgeWidth(5, 10)).toBeCloseTo(4.75);
  });
  it('count 0 / max 0 / empty give min width, never NaN', () => {
    expect(edgeWidth(0, 10)).toBe(1.5);
    expect(edgeWidth(3, 0)).toBe(1.5);
    expect(edgeWidth(NaN, 5)).toBe(1.5);
  });
  it('clamps count above max', () => expect(edgeWidth(99, 10)).toBe(8));
});

describe('misc helpers', () => {
  it('trend mapping has text+symbol and falls back to quiet', () => {
    expect(trendMeta('rising')).toMatchObject({ label: '활발', symbol: '▲' });
    expect(trendMeta('weird').label).toBe('조용');
    const labels = new Set(['rising', 'steady', 'quiet'].map((t) => trendMeta(t).symbol));
    expect(labels.size).toBe(3);
  });
  it('formatDate handles null/invalid', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('nope')).toBe('-');
    expect(formatDate('2026-11-02T12:00:00')).toBe('2026.11.02');
  });
  it('groupColors gives distinct colors to same-kind groups', () => {
    const c = groupColors([g('a'), g('b'), g('c')]);
    expect(new Set(Object.values(c)).size).toBe(3);
  });
  it('couplingLabel', () => {
    expect(couplingLabel({ a: 'x', b: 'y', count: 4 }, (i) => i.toUpperCase())).toBe('X ↔ Y: 4개 커밋에서 함께 변경');
  });
});
