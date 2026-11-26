import { describe, expect, it } from 'vitest';
import { makeQueueItem as item, makeRepo as repo } from '../test/fixtures/reviewQueue';
import {
  aggregateSyncStatus, changeSizeSpoken, closedBadge, formatChangeSize, myReviewLabel,
  splitQueue, summarizeWaiting, waitBasisLabel, waitLabel,
} from './reviewQueue';

const now = new Date('2026-11-24T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const M = 60_000, H = 60 * M, D = 24 * H;

describe('waitLabel', () => {
  it('event boundaries', () => {
    expect(waitLabel(ago(-5 * M), 'event', now)).toBe('방금 요청됨');
    expect(waitLabel(ago(59_000), 'event', now)).toBe('방금 요청됨');
    expect(waitLabel(ago(59 * M), 'event', now)).toBe('요청 후 59분');
    expect(waitLabel(ago(60 * M), 'event', now)).toBe('요청 후 1시간');
    expect(waitLabel(ago(23 * H), 'event', now)).toBe('요청 후 23시간');
    expect(waitLabel(ago(24 * H), 'event', now)).toBe('요청 후 1일');
    expect(waitLabel(ago(4 * D), 'event', now)).toBe('요청 후 4일');
  });
  it('pr_created and invalid', () => {
    expect(waitLabel(ago(10_000), 'pr_created', now)).toBe('방금 올라옴');
    expect(waitLabel(ago(5 * M), 'pr_created', now)).toBe('올라온 지 5분');
    expect(waitLabel(ago(2 * H), 'pr_created', now)).toBe('올라온 지 2시간');
    expect(waitLabel('not-a-date', 'event', now)).toBe('대기 시간을 알 수 없어요');
  });
  it('basis', () => {
    expect(waitBasisLabel('event')).toBe('리뷰 요청 기준');
    expect(waitBasisLabel('pr_created')).toBe('PR 생성 기준');
  });
});

describe('size / myReview / closedBadge', () => {
  const size = { additions: 120, deletions: 14, changedFiles: 6 };
  it('size', () => {
    expect(formatChangeSize(size)).toBe('+120 −14 · 파일 6개');
    expect(formatChangeSize(null)).toBe('변경 규모 알 수 없음');
    expect(changeSizeSpoken(size)).toBe('추가 120줄, 삭제 14줄, 파일 6개');
  });
  it('myReviewLabel', () => {
    expect(myReviewLabel(null, now)).toBeNull();
    expect(myReviewLabel({ state: 'APPROVED', submittedAt: ago(30 * H) }, now)).toBe('내 최신 리뷰: 승인함 · 어제');
    expect(myReviewLabel({ state: 'CHANGES_REQUESTED', submittedAt: ago(5 * M) }, now)).toBe('내 최신 리뷰: 변경 요청함 · 5분 전');
    expect(myReviewLabel({ state: 'COMMENTED', submittedAt: ago(3 * H) }, now)).toBe('내 최신 리뷰: 코멘트 남김 · 3시간 전');
    expect(myReviewLabel({ state: 'DISMISSED', submittedAt: ago(3 * D) }, now)).toBe('내 최신 리뷰: 무효화됨 · 3일 전');
  });
  it('closedBadge', () => {
    expect(closedBadge({ closedReason: 'merged', mergedWithoutMyReview: false })).toBe('머지됨');
    expect(closedBadge({ closedReason: 'merged', mergedWithoutMyReview: true })).toBe('리뷰 없이 머지됨');
    expect(closedBadge({ closedReason: 'closed', mergedWithoutMyReview: false })).toBe('닫힘');
    expect(closedBadge({ closedReason: 'request_withdrawn', mergedWithoutMyReview: false })).toBe('리뷰 요청이 취소됨');
  });
});

describe('splitQueue / summarizeWaiting', () => {
  const items = [
    item({ id: 'w2', group: 'waiting', requestedAt: ago(1 * H) }),
    item({ id: 'w1', group: 'waiting', requestedAt: ago(5 * H) }),
    item({ id: 'wd', group: 'waiting', isDraft: true, requestedAt: ago(3 * H) }),
    item({ id: 'a1', group: 'awaiting_author' }),
    item({ id: 'ad', group: 'awaiting_author', isDraft: true }),
    item({ id: 'c1', group: 'closed', isDraft: true }),
  ];
  it('sorts waiting and keeps drafts', () => {
    const r = splitQueue(items, true);
    expect(r.waiting.map((i) => i.id)).toEqual(['w1', 'wd', 'w2']);
    expect(r.hiddenDrafts).toBe(0);
    expect(r.draftCount).toBe(3);
  });
  it('hides drafts only in waiting/awaiting', () => {
    const r = splitQueue(items, false);
    expect(r.waiting.map((i) => i.id)).toEqual(['w1', 'w2']);
    expect(r.awaitingAuthor.map((i) => i.id)).toEqual(['a1']);
    expect(r.closed.map((i) => i.id)).toEqual(['c1']);
    expect(r.hiddenDrafts).toBe(2);
    expect(r.draftCount).toBe(3);
  });
  it('empty', () => {
    expect(splitQueue([], false)).toEqual({ waiting: [], awaitingAuthor: [], closed: [], draftCount: 0, hiddenDrafts: 0 });
    expect(summarizeWaiting([], now)).toEqual({ count: 0, oldestLabel: null });
  });
  it('summarize', () => {
    const w = splitQueue(items, false).waiting;
    expect(summarizeWaiting(w, now)).toEqual({ count: 2, oldestLabel: '5시간' });
    expect(summarizeWaiting([item({ requestedAt: ago(2 * D) })], now).oldestLabel).toBe('2일');
    expect(summarizeWaiting([item({ requestedAt: ago(7 * M) })], now).oldestLabel).toBe('7분');
  });
});

describe('aggregateSyncStatus', () => {
  const err = (kind: any, resetAt?: string) => ({ kind, message: 'x', resetAt });
  it('all ok: oldest success', () => {
    const s = aggregateSyncStatus([repo({ repoId: 1, lastSuccessAt: ago(H) }), repo({ repoId: 2, lastSuccessAt: ago(2 * H), truncated: true })], true);
    expect(s).toEqual({ lastSuccessAt: ago(2 * H), syncing: true, error: null, truncated: true });
  });
  it('no repos', () => {
    expect(aggregateSyncStatus([], false)).toEqual({ lastSuccessAt: null, syncing: false, error: null, truncated: false });
  });
  it('partial failure -> no error; repo without success ignored', () => {
    const s = aggregateSyncStatus([repo({ repoId: 1, lastSuccessAt: null, lastError: err('auth') }), repo({ repoId: 2, lastSuccessAt: ago(H) })], false);
    expect(s.error).toBeNull();
    expect(s.lastSuccessAt).toBe(ago(H));
  });
  it('all failed: priority + latest resetAt', () => {
    const r1 = ago(-H), r2 = ago(-2 * H);
    const rl = aggregateSyncStatus([repo({ repoId: 1, lastError: err('rate_limit', r1) }), repo({ repoId: 2, lastError: err('rate_limit', r2) }), repo({ repoId: 3, lastError: err('unknown') })], false);
    expect(rl.error).toEqual({ kind: 'rate_limit', resetAt: r2 });
    const au = aggregateSyncStatus([repo({ repoId: 1, lastError: err('upstream') }), repo({ repoId: 2, lastError: err('auth') })], false);
    expect(au.error).toEqual({ kind: 'auth' });
  });
});
