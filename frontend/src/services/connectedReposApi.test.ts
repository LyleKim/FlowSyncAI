import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeFetch } from '../test/routeFetch';
import { ApiError, connectRepo, listConnectedRepos, probeReviewQueue } from './connectedReposApi';

const repo = (id: number, extra = {}) => ({
  id, url: `https://github.com/acme/r${id}`, owner: 'acme', name: `r${id}`,
  githubLogin: '', lastSyncedAt: null, createdAt: '2026-11-01T00:00:00Z', ...extra,
});
const W = 'POST /api/v1/integrations/watched-repos/';

afterEach(() => vi.unstubAllGlobals());

describe('connectedReposApi', () => {
  it('201이면 alreadyConnected false, 본문에 githubLogin 없음', async () => {
    const { calls } = routeFetch({ [W]: () => ({ status: 201, json: repo(3) }) });
    const r = await connectRepo('acme/r3');
    expect(r.alreadyConnected).toBe(false);
    expect(calls[0].body).toEqual({ url: 'acme/r3' });
    expect(calls[0].body).not.toHaveProperty('githubLogin');
  });

  it('409 + existing이면 성공 취급', async () => {
    routeFetch({ [W]: () => ({ status: 409, json: { error: 'x', code: 'already_connected', existing: repo(1) } }) });
    const r = await connectRepo('acme/r1');
    expect(r.alreadyConnected).toBe(true);
    expect(r.repo.id).toBe(1);
  });

  it('400은 ApiError(status, code, message)', async () => {
    routeFetch({ [W]: () => ({ status: 400, json: { error: 'GitHub 레포 URL이 아니에요', code: 'invalid_url' } }) });
    const e = await connectRepo('zzz').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 400, code: 'invalid_url', message: 'GitHub 레포 URL이 아니에요' });
  });

  it('구형 객체도 lastError null, truncated false', async () => {
    routeFetch({ 'GET /api/v1/integrations/watched-repos/': () => ({ json: [repo(1)] }) });
    const [r] = await listConnectedRepos();
    expect(r.lastError).toBeNull();
    expect(r.truncated).toBe(false);
    expect(r.lastSuccessAt).toBeNull();
  });

  it('probeReviewQueue: URL, 실패는 null', async () => {
    const ok = { login: 'octocat', knownLogin: true, repos: [], counts: { waiting: 0, awaitingAuthor: 0, closed: 0 }, items: [] };
    const { calls } = routeFetch({ 'GET /api/v1/integrations/review-queue/': () => ({ json: ok }) });
    expect((await probeReviewQueue('octocat', ['acme/core']))?.knownLogin).toBe(true);
    expect(calls[0].url).toContain('login=octocat&teams=acme%2Fcore');

    routeFetch({ 'GET /api/v1/integrations/review-queue/': () => ({ status: 500 }) });
    expect(await probeReviewQueue('octocat')).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')));
    expect(await probeReviewQueue('octocat')).toBeNull();

    const ac = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')));
    })));
    const p = probeReviewQueue('octocat', [], ac.signal);
    ac.abort();
    expect(await p).toBeNull();
  });
});
