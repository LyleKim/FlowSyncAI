import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithRouter } from '../../test/render';
import { AREAS_NOW, makeWaitingPr } from '../../test/fixtures/areas';
import { WaitingPrTable } from './WaitingPrTable';
import type { WaitingPr } from '../../types/areas';

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

const show = (prs: WaitingPr[], areaId = 'backend-payments') =>
  renderWithRouter(<WaitingPrTable repoId={1} areaId={areaId} prs={prs} now={AREAS_NOW} />);

describe.each([['표', true], ['카드', false]])('WaitingPrTable (%s)', (_, wide) => {
  it('(a) 걸친 PR: 주 영역 글자, 다른 영역은 걸쳐 있음 + 상세 링크', () => {
    setWide(wide);
    show([makeWaitingPr()]);
    expect(screen.getByText('주 영역')).toBeInTheDocument();
    expect(screen.getByText('걸쳐 있음')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /결제 화면/ });
    expect(link.getAttribute('href')).toBe('/areas/frontend-checkout?repo=1');
    // 현재 영역(주 영역)은 자기 자신으로 가는 링크가 아니다
    expect(screen.queryByRole('link', { name: /결제 흐름/ })).toBeNull();
    expect(screen.getByText('#58 결제 재시도 정리')).toBeInTheDocument();
    expect(screen.getByText('jun-ho')).toBeInTheDocument();
    expect(screen.getByText('3일')).toBeInTheDocument();
    expect(screen.getByText('minji-park, sora')).toBeInTheDocument();
  });

  it('(b) isPrimary:false 행에 주 영역 안내', () => {
    setWide(wide);
    show([makeWaitingPr({ isPrimary: false })], 'frontend-checkout');
    expect(screen.getByText('주 영역은 결제 흐름이에요(개수는 거기에만 세요)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /결제 흐름/ }).getAttribute('href')).toBe('/areas/backend-payments?repo=1');
  });

  it('(c) touchedAreas 빈 배열도 행 유지, (g) 리뷰어 0명', () => {
    setWide(wide);
    show([makeWaitingPr({ touchedAreas: [], requestedReviewers: [], isPrimary: false })]);
    expect(screen.getByText('#58 결제 재시도 정리')).toBeInTheDocument();
    expect(screen.getByText('없음')).toBeInTheDocument();
  });

  it('(d) filesTruncated·unmapped 문구, 1일 미만', () => {
    setWide(wide);
    show([makeWaitingPr({ filesTruncated: true, unmapped: 3, oldestRequestedAt: '2026-11-25T01:00:00Z' })]);
    expect(screen.getByText('파일이 많아 일부만 봤어요')).toBeInTheDocument();
    expect(screen.getByText('분류되지 않은 파일 3개')).toBeInTheDocument();
    expect(screen.getByText('1일 미만')).toBeInTheDocument();
  });

  it('(e) GitHub 링크 이름이 행마다 다르고 rel 포함, 안전하지 않은 주소는 링크 없음', () => {
    setWide(wide);
    show([makeWaitingPr(), makeWaitingPr({ number: 61, url: 'https://github.com/acme/api/pull/61' }), makeWaitingPr({ number: 70, url: 'javascript:alert(1)' })]);
    const a = screen.getByRole('link', { name: '#58 GitHub에서 열기' });
    const b = screen.getByRole('link', { name: '#61 GitHub에서 열기' });
    for (const l of [a, b]) {
      expect(l.getAttribute('rel')).toBe('noopener noreferrer');
      expect(l.getAttribute('target')).toBe('_blank');
    }
    expect(screen.queryByRole('link', { name: '#70 GitHub에서 열기' })).toBeNull();
    // 같은 영역 링크도 행마다 이름이 다르다
    const names = screen.getAllByRole('link', { name: /결제 화면/ }).map((l) => l.textContent);
    expect(new Set(names).size).toBe(names.length);
  });

  it('(f) 집계 안내 한 줄, (h) 초안', () => {
    setWide(wide);
    show([makeWaitingPr({ isDraft: true })]);
    expect(
      screen.getByText('여러 영역에 걸친 PR은 변경 파일이 가장 많은 영역 한 곳에만 개수에 들어가요. 여기서는 걸친 영역을 모두 보여요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('초안')).toBeInTheDocument();
  });
});

describe('WaitingPrTable 레이아웃', () => {
  it('넓은 폭은 표 하나, 좁은 폭은 목록 하나', () => {
    setWide(true);
    const { unmount } = show([makeWaitingPr()]);
    const table = screen.getByRole('table', { name: /리뷰 대기 PR/ });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'PR', '작성자', '올라온 지', '리뷰어', '걸친 영역', 'GitHub',
    ]);
    expect(screen.queryByRole('list', { name: /리뷰 대기 PR/ })).toBeNull();
    unmount();
    setWide(false);
    show([makeWaitingPr()]);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('list', { name: /리뷰 대기 PR/ })).toBeInTheDocument();
  });
});
