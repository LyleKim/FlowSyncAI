import { describe, expect, it } from 'vitest';
import { describeRepoError, formatClock, formatFetched } from './repoCopy';

const now = new Date('2026-11-24T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('formatFetched', () => {
  it('cases', () => {
    expect(formatFetched(null, now)).toBe('아직 가져온 적 없어요');
    expect(formatFetched(ago(30_000), now)).toBe('방금 가져옴');
    expect(formatFetched(ago(-60_000), now)).toBe('방금 가져옴');
    expect(formatFetched(ago(3 * 60_000), now)).toBe('3분 전 가져옴');
    expect(formatFetched(ago(90 * 60_000), now)).toBe('1시간 전 가져옴');
    expect(formatFetched(ago(3 * 86_400_000), now)).toBe('3일 전 가져옴');
  });
  it('formatClock invalid', () => expect(formatClock('x')).toBe(''));
});

describe('describeRepoError', () => {
  const kinds = ['auth', 'rate_limit', 'not_found', 'upstream', 'unknown'] as const;
  it('auth', () => {
    const v = describeRepoError('acme/api', { kind: 'auth', message: 'bad' }, null, now);
    expect(v.canRetry).toBe(false);
    expect(v.adminCopy).toContain('acme/api');
    expect(v.adminCopy).toContain('GITHUB_TOKEN');
  });
  it('rate_limit reset', () => {
    const fut = describeRepoError('a/b', { kind: 'rate_limit', message: '', resetAt: ago(-600_000) }, ago(60_000), now);
    expect(fut.retryDisabledReason).toMatch(/^\d{2}:\d{2}부터 가능$/);
    const past = describeRepoError('a/b', { kind: 'rate_limit', message: '', resetAt: ago(600_000) }, null, now);
    expect(past.retryDisabledReason).toBeUndefined();
  });
  it('not_found title', () => {
    expect(describeRepoError('a/b', { kind: 'not_found', message: '' }, null, now).title).toBe('a/b 레포를 읽을 수 없어요');
  });
  it.each(kinds)('%s copy is clean', (kind) => {
    const v = describeRepoError('a/b', { kind, message: 'm' }, null, now);
    expect(v.title && v.body).toBeTruthy();
    for (const w of ['동기화', '감시', '문제가 발생']) expect(v.title + v.body).not.toContain(w);
  });
});
