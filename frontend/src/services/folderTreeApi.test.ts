import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteFolderDescription, describeFolders, fetchRepoTree, updateFolderDescription } from './folderTreeApi';
import { ApiError } from './connectedReposApi';
import { AreasApiError } from './areasApi';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const stub = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
};
afterEach(() => vi.unstubAllGlobals());
const BASE = '/api/v1/integrations/watched-repos/1';

describe('folderTreeApi', () => {
  it('fetchRepoTree: URL·refresh, 404/502 코드 유지', async () => {
    const f = stub(() => json({ root: { path: '' } }));
    await fetchRepoTree(1);
    await fetchRepoTree(1, { refresh: true });
    expect(f.mock.calls.map((c) => c[0])).toEqual([`${BASE}/tree/`, `${BASE}/tree/?refresh=1`]);
    stub(() => json({ error: 'x', code: 'github_unavailable' }, 502));
    const e = await fetchRepoTree(1).catch((x) => x);
    expect(e).toBeInstanceOf(AreasApiError);
    expect(e).toMatchObject({ status: 502, code: 'github_unavailable' });
  });

  it('describeFolders: Idempotency-Key 붙은 POST, force 본문', async () => {
    const f = stub(() => json({ generated: ['a'], failed: [] }));
    const r = await describeFolders(1);
    expect(r.generated).toEqual(['a']);
    await describeFolders(1, true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${BASE}/describe/`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual({});
    expect(JSON.parse(f.mock.calls[1][1]!.body as string)).toEqual({ force: true });
  });

  it('describeFolders: 429는 retryAfterSeconds, 502 ai_failed는 failed를 본문에 남긴다', async () => {
    stub(() => json({ error: 't', code: 'describe_throttled', retryAfterSeconds: 87 }, 429));
    const e = await describeFolders(1).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 429, code: 'describe_throttled', body: { retryAfterSeconds: 87 } });
    stub(() => json({ error: 'f', code: 'ai_failed', failed: ['x'] }, 502));
    expect(await describeFolders(1).catch((x) => x)).toMatchObject({ code: 'ai_failed', body: { failed: ['x'] } });
  });

  it('describeFolders: 네트워크 오류는 status 0 network', async () => {
    stub(() => Promise.reject(new TypeError('down')));
    expect(await describeFolders(1).catch((x) => x)).toMatchObject({ status: 0, code: 'network' });
  });

  it('updateFolderDescription: PATCH path·text, 400 invalid_text', async () => {
    const d = { text: '할 일 API', source: 'manual', generatedAt: '2026-11-26T00:00:00Z' };
    const f = stub(() => json({ path: 'backend/tasks', description: d }));
    expect(await updateFolderDescription(1, 'backend/tasks', '할 일 API')).toEqual(d);
    expect(f.mock.calls[0][0]).toBe(`${BASE}/tree/folders/`);
    expect(f.mock.calls[0][1]?.method).toBe('PATCH');
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual({ path: 'backend/tasks', text: '할 일 API' });
    stub(() => json({ error: 'x', code: 'invalid_text' }, 400));
    expect(await updateFolderDescription(1, 'a', '').catch((x) => x)).toMatchObject({ status: 400, code: 'invalid_text' });
  });

  it('deleteFolderDescription: path 인코딩, 404 description_not_found는 이미 지워짐', async () => {
    const f = stub(() => Promise.resolve(new Response(null, { status: 204 })));
    await deleteFolderDescription(1, '한글/폴더 a');
    expect(f.mock.calls[0][0]).toBe(`${BASE}/tree/folders/?path=${encodeURIComponent('한글/폴더 a')}`);
    expect(f.mock.calls[0][1]?.method).toBe('DELETE');
    stub(() => json({ code: 'description_not_found' }, 404));
    await expect(deleteFolderDescription(1, 'a')).resolves.toBeUndefined();
    stub(() => json({ code: 'folder_not_found' }, 404));
    await expect(deleteFolderDescription(1, 'a')).rejects.toMatchObject({ code: 'folder_not_found' });
  });
});
