import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addWatchedRepo,
  formatLastSynced,
  formatSyncResult,
  listWatchedRepos,
  removeWatchedRepo,
  syncPullRequests,
} from './integrationsApi';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
});
afterEach(() => vi.unstubAllGlobals());

describe('integrationsApi', () => {
  it('lists repos', async () => {
    fetchMock.mockResolvedValue(json([{ id: 1, owner: 'a', name: 'b' }]));
    expect(await listWatchedRepos()).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/integrations/watched-repos/');
  });

  it('add POSTs with Idempotency-Key and omits empty login', async () => {
    fetchMock.mockResolvedValue(json({ id: 2 }, 201));
    await addWatchedRepo('https://github.com/a/b');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/integrations/watched-repos/');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('uuid-1');
    expect(JSON.parse(init.body)).toEqual({ url: 'https://github.com/a/b' });
  });

  it('add sends githubLogin when given', async () => {
    fetchMock.mockResolvedValue(json({ id: 2 }, 201));
    await addWatchedRepo('u', 'me');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ url: 'u', githubLogin: 'me' });
  });

  it('extracts backend error message on 400/409', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Repository already watched' }, 409));
    await expect(addWatchedRepo('u')).rejects.toThrow('Repository already watched');
  });

  it('falls back to status message for non-JSON errors', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(listWatchedRepos()).rejects.toThrow('500');
  });

  it('remove handles 204 and 404', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(removeWatchedRepo(3)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/integrations/watched-repos/3/');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    fetchMock.mockResolvedValueOnce(json({ error: 'Not found' }, 404));
    await expect(removeWatchedRepo(9)).rejects.toThrow('Not found');
  });

  it('sync POSTs with Idempotency-Key and returns result', async () => {
    fetchMock.mockResolvedValue(json({ created: 2, skipped: 1, errors: ['x'] }));
    const r = await syncPullRequests();
    expect(r.created).toBe(2);
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('uuid-1');
  });
});

describe('formatters', () => {
  it('formatSyncResult', () => {
    expect(formatSyncResult({ created: 3, skipped: 0, errors: [] })).toBe('3개 추가됨');
    expect(formatSyncResult({ created: 0, skipped: 2, errors: [] })).toBe('새로 추가된 PR 없음');
  });

  it('formatLastSynced', () => {
    const now = Date.parse('2026-01-02T12:00:00Z');
    expect(formatLastSynced(null)).toBe('동기화 이력 없음');
    expect(formatLastSynced('garbage')).toBe('동기화 이력 없음');
    expect(formatLastSynced('2026-01-02T11:59:30Z', now)).toBe('방금 전');
    expect(formatLastSynced('2026-01-02T11:15:00Z', now)).toBe('45분 전');
    expect(formatLastSynced('2026-01-02T09:00:00Z', now)).toBe('3시간 전');
    expect(formatLastSynced('2025-12-30T12:00:00Z', now)).toBe('3일 전');
  });
});
