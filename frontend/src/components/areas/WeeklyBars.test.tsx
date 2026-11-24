import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WeeklyBars } from './WeeklyBars';
import type { AreaWeek } from '../../types/areas';

const weeks = (vals: number[], start = '2026-10-20'): AreaWeek[] =>
  vals.map((commits, i) => ({
    weekStart: new Date(Date.parse(start) + i * 7 * 86_400_000).toISOString(),
    commits,
    filesChanged: 1,
  }));
// 마지막 주(11/17 시작)가 현재 주
const NOW = '2026-11-20T03:00:00Z';
const LATE = '2026-12-11T03:00:00Z';
const setup = (vals: number[], extra: Record<string, unknown> = {}, gen = NOW) =>
  render(<WeeklyBars weekly={weeks(vals)} generatedAt={gen} days={30} {...extra} />);
const rects = (c: HTMLElement) => Array.from(c.querySelectorAll('rect'));
const label = (c: HTMLElement) => c.querySelector('svg')!.getAttribute('aria-label');

describe('WeeklyBars', () => {
  it('(a) 같은 칸 높이, 이번 주만 속 빈 막대', () => {
    const { container } = setup([4, 6, 10, 14, 16]);
    const r = rects(container);
    expect(r).toHaveLength(5);
    const h = r.map((x) => Number(x.getAttribute('height')));
    const cell = h[0] / 2;
    expect(h).toEqual([2, 3, 5, 7, 8].map((n) => n * cell));
    expect(r.map((x) => x.getAttribute('fill') === 'none')).toEqual([false, false, false, false, true]);
    expect(r.every((x) => x.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('(b) 전부 0이면 바닥선만', () => {
    const { container } = setup([0, 0, 0]);
    expect(rects(container)).toHaveLength(0);
    expect(container.querySelectorAll('line[data-floor]')).toHaveLength(1);
    expect(label(container)).toBe('최근 30일 활동 없음');
  });

  it('(c) 0인 주는 rect 없음, 2는 1칸', () => {
    const { container } = setup([0, 2, 0, 0, 0]);
    const r = rects(container);
    expect(r).toHaveLength(1);
    const one = Number(r[0].getAttribute('height'));
    const { container: c2 } = setup([4]);
    expect(Number(rects(c2)[0].getAttribute('height'))).toBe(one * 2);
  });

  it('(d) 현재 주가 아니면 속 빈 막대·진행 중 없음', () => {
    const { container } = setup([1, 2, 3], {}, LATE);
    expect(rects(container).some((x) => x.getAttribute('fill') === 'none')).toBe(false);
    expect(label(container)).not.toContain('진행 중');
  });

  it('(e) 40커밋은 8칸으로 잘리고 표식 1개', () => {
    const { container } = setup([40]);
    const r = rects(container);
    expect(Number(r[0].getAttribute('height'))).toBe(Number(rects(setup([16]).container)[0].getAttribute('height')));
    expect(container.querySelectorAll('line[data-clipped]')).toHaveLength(1);
    expect(label(container)).toContain('40');
  });

  it('(f) unknown은 점선 막대·바닥선 없음', () => {
    const { container } = setup([], { state: 'unknown', weekCount: 5 });
    const r = rects(container);
    expect(r).toHaveLength(5);
    expect(r.every((x) => x.getAttribute('stroke-dasharray'))).toBe(true);
    expect(label(container)).toBe('데이터 없음');
    expect(container.querySelectorAll('line[data-floor]')).toHaveLength(0);
  });

  it('(g) 빈 배열', () => {
    const { container } = setup([]);
    expect(label(container)).toBe('주간 데이터 없음');
  });

  it('(h) detail은 값과 M/D를 DOM 텍스트로', () => {
    const { getByText } = setup([4, 6, 10, 14, 16], { variant: 'detail' });
    expect(getByText('16')).toBeTruthy();
    expect(getByText('11/17')).toBeTruthy();
  });

  it('(i) 막대 수에 비례해 viewBox 폭이 늘어남', () => {
    const w = (n: number) => {
      const { container } = setup(Array(n).fill(2));
      expect(rects(container).length).toBe(n - 1 + 1);
      return Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]);
    };
    const [a, b, c] = [w(5), w(13), w(26)];
    expect(b / a).toBeCloseTo(13 / 5, 0);
    expect(c / b).toBeCloseTo(2, 0);
  });

  it('(j) 색 리터럴 없음', () => {
    const { container } = setup([4, 40, 0], { variant: 'detail' });
    expect(container.innerHTML).not.toMatch(/hsl\(|#|rgb\(/);
  });
});
