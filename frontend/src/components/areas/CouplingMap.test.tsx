import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithRouter } from '../../test/render';
import { makeArea } from '../../test/fixtures/areas';
import { CouplingMap, edgeWidth } from './CouplingMap';

const areas = [
  makeArea({ id: 'a', displayName: '가 영역' }),
  makeArea({ id: 'b', displayName: '나 영역' }),
  makeArea({ id: 'c', displayName: '다 영역' }),
  makeArea({ id: 'd', displayName: '라 영역' }),
];
const couplings = [
  { a: 'a', b: 'b', count: 5 },
  { a: 'b', b: 'c', count: 16 },
];
const show = (over: Partial<Parameters<typeof CouplingMap>[0]> = {}) =>
  renderWithRouter(<CouplingMap couplings={couplings} areas={areas} repoId={1} days={30} truncated={false} analyzedCommits={41} {...over} />);
const node = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const edge = (label: string) => screen.getByRole('img', { name: label });

describe('CouplingMap', () => {
  it('영역 노드·결합 선·범례를 그리고 그래프에 이름이 있다', () => {
    show();
    const graph = screen.getByRole('group', { name: /^함께 바뀐 영역 그래프: 영역 4개, 2쌍/ });
    expect(graph).toBeInTheDocument();
    expect(['가 영역', '나 영역', '다 영역', '라 영역'].map((n) => node(n))).toHaveLength(4);
    expect(edge('가 영역 ↔ 나 영역 · 커밋 5개')).toBeInTheDocument();
    expect(edge('나 영역 ↔ 다 영역 · 커밋 16개')).toBeInTheDocument();
    expect(screen.getByText(/커밋 2개 = 1px/)).toBeInTheDocument();
  });

  it('결합 없는 영역은 희미하게(속 빈 노드)', () => {
    show();
    expect(node('라 영역')).toHaveAttribute('data-uncoupled', 'true');
    expect(node('가 영역')).not.toHaveAttribute('data-uncoupled');
  });

  it('선 굵기는 고정 눈금: 커밋 2개 = 1px, 16개 이상 8px(최댓값에 맞춰 늘리지 않음)', () => {
    expect([1, 2, 3, 8, 16, 40].map(edgeWidth)).toEqual([1, 1, 2, 4, 8, 8]);
    show({ couplings: [{ a: 'a', b: 'b', count: 2 }] });
    expect(edge('가 영역 ↔ 나 영역 · 커밋 2개').getAttribute('data-width')).toBe('1');
  });

  it('노드를 누르면 연결된 선·영역만 강조하고 나머지는 흐리게, 상세 링크를 보여준다', async () => {
    const { user } = show();
    await user.click(node('가 영역'));
    expect(node('가 영역')).toHaveAttribute('aria-pressed', 'true');
    expect(edge('가 영역 ↔ 나 영역 · 커밋 5개')).not.toHaveAttribute('data-dim');
    expect(edge('나 영역 ↔ 다 영역 · 커밋 16개')).toHaveAttribute('data-dim', 'true');
    expect(node('나 영역')).not.toHaveAttribute('data-dim');
    expect(node('다 영역')).toHaveAttribute('data-dim', 'true');
    const panel = screen.getByTestId('coupling-detail');
    expect(within(panel).getByRole('link', { name: '가 영역' })).toHaveAttribute('href', '/areas/a?repo=1');
    expect(panel).toHaveTextContent(/나 영역.*커밋 5개/);
    // 다시 누르면 해제
    await user.click(node('가 영역'));
    expect(node('가 영역')).toHaveAttribute('aria-pressed', 'false');
    expect(edge('나 영역 ↔ 다 영역 · 커밋 16개')).not.toHaveAttribute('data-dim');
  });

  it('키보드: 노드는 Tab으로 포커스되고 포커스만으로 강조, Esc로 해제', async () => {
    const { user } = show();
    await user.tab();
    const first = document.activeElement!;
    expect(first.getAttribute('role')).toBe('button');
    expect(first).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(first).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-pressed', 'true');
  });

  it('선에 포커스·호버하면 툴팁 "A ↔ B · 커밋 N개"', () => {
    show();
    const e = edge('나 영역 ↔ 다 영역 · 커밋 16개');
    expect(e).toHaveAttribute('tabindex', '0');
    fireEvent.focus(e);
    expect(screen.getByTestId('coupling-tip')).toHaveTextContent('나 영역 ↔ 다 영역 · 커밋 16개');
    fireEvent.blur(e);
    expect(screen.queryByTestId('coupling-tip')).toBeNull();
    fireEvent.mouseEnter(e);
    expect(screen.getByTestId('coupling-tip')).toBeInTheDocument();
  });

  it('목록으로 보기: 순위 목록과 영역 상세 링크', () => {
    show();
    expect(screen.getByText('목록으로 보기').tagName).toBe('SUMMARY');
    const list = screen.getByRole('list', { name: '함께 바뀐 영역' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/나 영역.*다 영역.*커밋 16개/);
    expect(within(items[1]).getByRole('link', { name: '가 영역' })).toHaveAttribute('href', '/areas/a?repo=1');
  });

  it('빈 상태: 결합 0이면 그래프 없이 문구', () => {
    show({ couplings: [] });
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByText(/함께 바뀐 영역이 없어요/)).toBeInTheDocument();
  });

  it('빈 상태: 영역이 2개 미만이면 그래프 없이 문구', () => {
    show({ areas: [areas[0]], couplings: [] });
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByText(/영역이 2개 이상/)).toBeInTheDocument();
  });

  it('상위 10쌍·분석 한도 안내는 한 줄', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ a: 'a', b: `x${i}`, count: 12 - i }));
    show({ couplings: many, truncated: true, analyzedCommits: 60 });
    expect(screen.getByText('상위 10쌍만 그렸어요(전체 12쌍) · 최근 커밋 60개만 분석')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /↔/ })).toHaveLength(10);
  });
});
