import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithRouter } from '../../test/render';
import { AREAS_NOW, GENERATED_AT, makeAlias, makeArea } from '../../test/fixtures/areas';
import { AreaRows } from './AreaRows';
import type { Area, AreaAlias } from '../../types/areas';

const realMatchMedia = window.matchMedia;
const setWide = (wide: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: wide && q.includes('min-width'),
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const quietWaiting = makeArea({
  id: 'backend-legacy',
  displayName: '옛 결제',
  pathPrefix: 'backend/legacy',
  trend: 'quiet',
  commits: [0, 0, 0, 0, 0],
  lastChangeAt: null,
  reviewWaiting: { prCount: 2, oldestRequestedAt: '2026-11-19T01:00:00Z' },
});
const idle = makeArea({
  id: 'docs',
  displayName: 'docs',
  pathPrefix: '@docs',
  trend: 'steady',
  commits: [0, 0, 0, 0, 0],
});

const show = (areas: Area[], disconnected: AreaAlias[] = []) =>
  renderWithRouter(
    <AreaRows areas={areas} disconnected={disconnected} generatedAt={GENERATED_AT} days={30} repoId={1} now={AREAS_NOW} />,
  );

describe('AreaRows (데스크톱)', () => {
  beforeEach(() => setWide(true));

  it('(a) 표·열 머리글 5개·이름 링크', () => {
    show([makeArea()]);
    const table = screen.getByRole('table', { name: /영역별 최근/ });
    const cols = within(table).getAllByRole('columnheader');
    expect(cols.map((c) => c.textContent)).toEqual(['영역', '주간 활동', '추세', '마지막 변경', '리뷰 대기']);
    expect(within(table).getByRole('rowheader', { name: /결제 흐름/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '결제 흐름' })).toHaveAttribute('href', '/areas/backend-payments?repo=1');
  });

  it('(b) 행 막대의 이름이 주간 커밋 문자열', () => {
    show([makeArea()]);
    expect(screen.getByRole('img', { name: '5주 커밋: 4, 6, 10, 14, 16개(마지막은 진행 중인 주)' })).toBeInTheDocument();
  });

  it('(c) 활동 적음 + 대기 2건 → 결정 23 문구, 금지 문구 없음', () => {
    const { container } = show([quietWaiting]);
    expect(screen.getByText('리뷰 대기 중, 활동 없음')).toBeInTheDocument();
    expect(screen.getByText(/리뷰 대기 2건/)).toBeInTheDocument();
    expect(screen.getByText(/최장 6일/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/정체 후보|조용함/);
  });

  it('(d) 전부 0·대기 없음', () => {
    const { container } = show([idle]);
    expect(screen.getByText('대기 없음')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '최근 30일 활동 없음' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/완료|진행률/);
  });

  it('(e) 추세 글자', () => {
    show([makeArea(), idle, quietWaiting]);
    for (const t of ['활발해짐', '꾸준함', '활동 적음']) expect(screen.getByText(t)).toBeInTheDocument();
  });

  it('(f) 연결 끊김 행: 라벨·정리 링크(행마다 다른 이름)·데이터 없음 막대', () => {
    show([makeArea()], [makeAlias(), makeAlias({ id: 10, pathPrefix: 'frontend/y', displayName: '옛 화면' })]);
    expect(screen.getAllByText('연결 끊김')).toHaveLength(2);
    expect(screen.getByText(/경로\(backend\/x\)가 코드에서 보이지 않아요/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /영역 이름 정리/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/settings');
    expect(new Set(links.map((l) => l.textContent)).size).toBe(2);
    expect(screen.getAllByRole('img', { name: '데이터 없음' })).toHaveLength(2);
    // 연결 끊김 행은 맨 아래
    const rows = screen.getAllByRole('row');
    expect(rows[rows.length - 1].textContent).toContain('옛 화면');
  });

  it('(g) 80자 이름은 말줄임 없이 줄바꿈', () => {
    const long = '가'.repeat(80);
    const { container } = show([makeArea({ displayName: long })]);
    expect(screen.getByRole('link', { name: long })).toBeInTheDocument();
    expect(container.querySelector('.truncate')).toBeNull();
  });

  it('(h) 데스크톱에서는 카드 목록이 접근성 트리에 없다', () => {
    show([makeArea()]);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('잡동사니 영역 비중이 크면 경고', () => {
    show([makeArea({ fileCount: 10 }), makeArea({ id: 'misc', displayName: '기타', pathPrefix: '@misc', fileCount: 10 })]);
    expect(screen.getByText(/분류되지 않은 파일이 많아요\(약 50%\)/)).toBeInTheDocument();
  });
});

describe('AreaRows (좁은 화면)', () => {
  beforeEach(() => setWide(false));

  it('(h) 카드 목록만 나오고 표는 없다', () => {
    show([makeArea(), quietWaiting]);
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: /영역별 최근/ });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText('리뷰 대기 중, 활동 없음')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '결제 흐름' })).toHaveAttribute('href', '/areas/backend-payments?repo=1');
  });
});
