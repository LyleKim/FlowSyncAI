import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchArchitecture } from './architectureApi';

const mockFetch = (res: Partial<Response>) => {
  const f = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', f);
  return f;
};
afterEach(() => vi.unstubAllGlobals());

describe('fetchArchitecture', () => {
  it('encodes url/days and omits refresh by default', async () => {
    const f = mockFetch({ ok: true, json: async () => ({ groups: [] }) });
    await fetchArchitecture('https://github.com/o/r?x=1&y=2', 30);
    const u = f.mock.calls[0][0] as string;
    expect(u).toContain('/api/v1/integrations/architecture/?');
    expect(u).toContain('url=https%3A%2F%2Fgithub.com%2Fo%2Fr%3Fx%3D1%26y%3D2');
    expect(u).toContain('days=30');
    expect(u).not.toContain('refresh');
  });
  it('adds refresh=1', async () => {
    const f = mockFetch({ ok: true, json: async () => ({}) });
    await fetchArchitecture('https://github.com/o/r', 90, true);
    expect(f.mock.calls[0][0]).toContain('refresh=1');
  });
  it('throws backend error message', async () => {
    mockFetch({ ok: false, status: 404, json: async () => ({ error: '저장소를 찾을 수 없습니다' }) });
    await expect(fetchArchitecture('x', 30)).rejects.toThrow('저장소를 찾을 수 없습니다');
  });
  it('falls back to status message when body is not JSON', async () => {
    mockFetch({ ok: false, status: 502, json: async () => { throw new Error('bad'); } });
    await expect(fetchArchitecture('x', 30)).rejects.toThrow('502');
  });
});
