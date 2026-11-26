import { afterEach, describe, expect, it, vi } from 'vitest';
import { AreasApiError, fetchAreaAliases, fetchAreaDetail, fetchAreas } from './areasApi';
import type { AreaDetail } from '../types/areas';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const stub = (impl: (url: string) => Promise<Response>) => {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
};
afterEach(() => vi.unstubAllGlobals());

describe('areasApi', () => {
  it('(a) fetchAreas URL, refresh', async () => {
    const f = stub(() => json({ areas: [] }));
    await fetchAreas(1, 30);
    await fetchAreas(1, 30, { refresh: true });
    expect(f.mock.calls[0][0]).toBe('/api/v1/integrations/watched-repos/1/areas/?days=30');
    expect(f.mock.calls[1][0]).toBe('/api/v1/integrations/watched-repos/1/areas/?days=30&refresh=1');
  });

  it('(b,c) detail encodes id and passes PR fields', async () => {
    const detail = {
      waitingPullRequests: [{ isPrimary: false, touchedAreas: [{ areaId: 'a', displayName: 'A', fileCount: 2 }] }],
    } as unknown as AreaDetail;
    const f = stub(() => json(detail));
    const r = await fetchAreaDetail(1, '한글 영역/x', 30);
    const url = f.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent('한글 영역/x'));
    expect(url).toContain('%2F');
    expect(r.waitingPullRequests[0].isPrimary).toBe(false);
    expect(r.waitingPullRequests[0].touchedAreas[0].fileCount).toBe(2);
  });

  it('502 and 404 keep status/code/message', async () => {
    stub(() => json({ error: '사유', code: 'github_unavailable' }, 502));
    await expect(fetchAreas(1, 30)).rejects.toMatchObject({ status: 502, code: 'github_unavailable', message: '사유' });
    for (const code of ['area_not_found', 'repo_not_found']) {
      stub(() => json({ error: 'x', code }, 404));
      await expect(fetchAreaDetail(1, 'a', 30)).rejects.toMatchObject({ status: 404, code });
    }
  });

  it('(e) non-JSON 500', async () => {
    stub(() => Promise.resolve(new Response('<html>', { status: 500 })));
    await expect(fetchAreas(1, 30)).rejects.toMatchObject({ message: '요청 실패 (500)', code: null });
  });

  it('(f) network failure', async () => {
    stub(() => Promise.reject(new TypeError('fail')));
    const e = await fetchAreas(1, 30).catch((x) => x);
    expect(e).toBeInstanceOf(AreasApiError);
    expect(e).toMatchObject({ status: 0, code: 'network' });
  });

  it('(g) abort is not wrapped', async () => {
    const ac = new AbortController();
    stub(() => Promise.reject(new DOMException('aborted', 'AbortError')));
    ac.abort();
    const e = await fetchAreas(1, 30, { signal: ac.signal }).catch((x) => x);
    expect(e.name).toBe('AbortError');
    expect(e).not.toBeInstanceOf(AreasApiError);
  });

  it('(h) aliases', async () => {
    const f = stub(() => json([{ id: 1 }]));
    expect(await fetchAreaAliases(1)).toEqual([{ id: 1 }]);
    expect(f.mock.calls[0][0]).toBe('/api/v1/integrations/watched-repos/1/area-aliases/');
  });
});
