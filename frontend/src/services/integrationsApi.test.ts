import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
    expect(fetchMock.mock.calls[0][1].body).toBe('{}');
  });

  it('sync with repoId sends it in body', async () => {
    fetchMock.mockResolvedValue(json({ created: 0, skipped: 0, errors: [] }));
    await syncPullRequests(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ repoId: 2 });
  });
});

describe('formatters', () => {
  it('formatSyncResult', () => {
    expect(formatSyncResult({ created: 3, skipped: 0, errors: [] })).toBe('3개 추가됨');
    expect(formatSyncResult({ created: 0, skipped: 2, errors: [] })).toBe('새로 추가된 PR 없음');
  });
});
