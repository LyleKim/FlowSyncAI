import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrQueueRow } from './PrQueueRow';
import { PrCompactRow } from './PrCompactRow';
import { makeQueueItem } from '../../test/fixtures/reviewQueue';
import { formatClock } from '../../lib/repoCopy';

const now = new Date('2026-11-24T05:10:00Z');
const row = (over = {}, extra: { unverifiedSince?: string | null } = {}) =>
  render(
    <ul>
      <PrQueueRow item={makeQueueItem(over)} now={now} {...extra} />
    </ul>,
  );

describe('PrQueueRow', () => {
  it('a: 기본 정보와 sr 문장', () => {
    const { container } = row();
    expect(screen.getByText('요청 후 4일')).toBeInTheDocument();
    expect(screen.getByText('리뷰 요청 기준')).toBeInTheDocument();
    expect(screen.getByText(/acme\/api #58/)).toBeInTheDocument();
    expect(screen.getByText('작성자 jun-ho')).toBeInTheDocument();
    expect(screen.getByText('+120 −14 · 파일 6개')).toBeInTheDocument();
    expect(screen.getByText('추가 120줄, 삭제 14줄, 파일 6개')).toHaveClass('sr-only');
    expect(container.querySelector('li')).toHaveAttribute('data-row-id', 'acme/api#58:minji-park');
  });

  it('a2: 대기 칸 막대 7칸, 채운 칸 = 글자와 같은 일수(1칸 = 1일, 7일 이상 7칸), 장식이라 aria-hidden', () => {
    const filled = (c: HTMLElement) => c.querySelectorAll('[data-wait-cells] [data-filled]').length;
    const { container, unmount } = row(); // 4일 4시간 → "요청 후 4일"과 같은 4칸
    const bar = container.querySelector('[data-wait-cells]')!;
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar.children).toHaveLength(7);
    expect(filled(container)).toBe(4);
    unmount();
    const { container: c2, unmount: u2 } = row({ requestedAt: '2026-11-01T00:00:00Z' });
    expect(filled(c2)).toBe(7);
    u2();
    const { container: c3 } = row({ requestedAt: 'bad' });
    expect(c3.querySelector('[data-wait-cells]')).toBeNull();
  });

  it('b: 다시 요청됨 + 내 리뷰', () => {
    row({ reRequested: true, myReview: { state: 'CHANGES_REQUESTED', submittedAt: '2026-11-24T02:00:00Z' } });
    expect(screen.getByText('다시 요청됨')).toBeInTheDocument();
    expect(screen.getByText(/내 최신 리뷰: 변경 요청함/)).toBeInTheDocument();
  });

  it('c: 팀 요청', () => {
    row({ requestKind: 'team', viaTeam: 'acme/web' });
    expect(screen.getByText('팀 요청 · acme/web')).toBeInTheDocument();
  });
  it('c: 직접 요청은 팀 문구 없음', () => {
    row();
    expect(screen.queryByText(/팀 요청/)).toBeNull();
  });

  it('d: PR 생성 기준', () => {
    row({ requestedAtSource: 'pr_created' });
    expect(screen.getByText('올라온 지 4일')).toBeInTheDocument();
    expect(screen.getByText('PR 생성 기준')).toBeInTheDocument();
  });

  it('e: size null', () => {
    row({ size: null });
    expect(screen.getByText('변경 규모 알 수 없음', { selector: ':not(.sr-only)' })).toBeInTheDocument();
  });

  it('f: 링크 속성과 위험 URL', () => {
    const { unmount } = row();
    const a = screen.getByRole('link', { name: /#58 GitHub에서 리뷰/ });
    expect(a).toHaveAttribute('href', 'https://github.com/acme/api/pull/58');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    unmount();
    row({ url: 'javascript:alert(1)' });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('링크를 열 수 없어요')).toBeInTheDocument();
  });

  it('g: 확인 안 됨', () => {
    const iso = '2026-11-24T05:02:10Z';
    const { unmount } = row({}, { unverifiedSince: iso });
    expect(screen.getByText(`확인 안 됨 · ${formatClock(iso)} 기준`)).toBeInTheDocument();
    unmount();
    row({}, { unverifiedSince: null });
    expect(screen.getByText('확인 안 됨')).toBeInTheDocument();
  });

  it('h: 긴 제목은 줄바꿈 가능', () => {
    row({ title: 'a'.repeat(80), repo: 'o'.repeat(80) + '/r' });
    const h = screen.getByRole('heading', { level: 3 });
    expect(h).toHaveClass('break-words', 'min-w-0');
  });

  it('초안 배지', () => {
    row({ isDraft: true });
    expect(screen.getByText('초안')).toBeInTheDocument();
  });

  it('j: 상호작용 요소는 링크 하나', () => {
    const { container } = row();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(container.querySelectorAll('button, [onclick], [tabindex]')).toHaveLength(0);
  });
});

describe('PrCompactRow', () => {
  const compact = (over = {}) =>
    render(
      <ul>
        <PrCompactRow item={makeQueueItem(over)} now={now} />
      </ul>,
    );

  it('i: 리뷰 없이 머지됨, 제목이 링크', () => {
    compact({ group: 'closed', closedReason: 'merged', mergedWithoutMyReview: true });
    expect(screen.getByText('리뷰 없이 머지됨')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /결제 웹훅 재시도/ })).toHaveAttribute('target', '_blank');
  });

  it('작성자 응답 대기는 내 리뷰 문구', () => {
    compact({ group: 'awaiting_author', myReview: { state: 'APPROVED', submittedAt: '2026-11-24T02:00:00Z' } });
    expect(screen.getByText(/내 최신 리뷰: 승인함/)).toBeInTheDocument();
  });

  it('위험 URL이면 링크 없이 안내', () => {
    compact({ url: 'javascript:alert(1)' });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('링크를 열 수 없어요')).toBeInTheDocument();
    expect(screen.getByText('결제 웹훅 재시도')).toBeInTheDocument();
  });
});
