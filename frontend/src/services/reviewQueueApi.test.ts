import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchReviewQueue, QueueFetchError } from './reviewQueueApi';
import { makeQueue } from '../test/fixtures/reviewQueue';

const stub = (impl: () => Promise<Response>) => {
  const f = vi.fn((..._a: unknown[]) => impl());
  vi.stubGlobal('fetch', f);
  return f;
};
const ok = (b: unknown) => () => Promise.resolve(new Response(JSON.stringify(b), { status: 200 }));
const kindOf = (p: Promise<unknown>) => p.catch((e) => e as QueueFetchError);

afterEach(() => vi.unstubAllGlobals());

describe('fetchReviewQueue', () => {
  it('URL을 정확히 만든다 (기본 7일, 팀은 소문자·순서 유지)', async () => {
    const f = stub(ok(makeQueue()));
    await fetchReviewQueue({ login: 'octocat' });
    expect(f.mock.calls[0][0]).toBe('/api/v1/integrations/review-queue/?login=octocat&closedWithinDays=7');
    await fetchReviewQueue({ login: 'octocat', teams: ['Acme/Web', 'acme/api'] });
    expect(f.mock.calls[1][0]).toBe(
      '/api/v1/integrations/review-queue/?login=octocat&closedWithinDays=7&teams=acme%2Fweb,acme%2Fapi',
    );
  });

  it('로그인을 인코딩한다', async () => {
    const f = stub(ok(makeQueue()));
    await fetchReviewQueue({ login: 'a b&c' });
    expect(String(f.mock.calls[0][0])).toContain('login=a%20b%26c&');
  });

  it('오류를 종류별로 분류한다', async () => {
    stub(() => Promise.resolve(new Response('{}', { status: 400 })));
    expect(await kindOf(fetchReviewQueue({ login: 'x' }))).toMatchObject({ kind: 'login_required' });
    stub(() => Promise.resolve(new Response('{}', { status: 502 })));
    expect(await kindOf(fetchReviewQueue({ login: 'x' }))).toMatchObject({ kind: 'server', status: 502 });
    stub(() => Promise.resolve(new Response('{}', { status: 500 })));
    expect(await kindOf(fetchReviewQueue({ login: 'x' }))).toMatchObject({ kind: 'server', status: 500 });
    stub(() => Promise.reject(new TypeError('fail')));
    expect(await kindOf(fetchReviewQueue({ login: 'x' }))).toMatchObject({ kind: 'network' });
    const abort = new DOMException('aborted', 'AbortError');
    stub(() => Promise.reject(abort));
    expect(await kindOf(fetchReviewQueue({ login: 'x' }))).toBe(abort);
  });

  it('본문을 읽는 중 취소되면 AbortError를 그대로 던진다', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    stub(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(abort) } as unknown as Response));
    expect(await kindOf(fetchReviewQueue({ login: 'x' }))).toBe(abort);
  });

  it('본문이 객체가 아니거나 items가 배열이 아니면 server 오류', async () => {
    for (const body of [[], 'str', null, { items: {} }, {}]) {
      stub(ok(body));
      const e = await kindOf(fetchReviewQueue({ login: 'x' }));
      expect(e).toBeInstanceOf(QueueFetchError);
      expect((e as QueueFetchError).kind).toBe('server');
    }
  });
});
