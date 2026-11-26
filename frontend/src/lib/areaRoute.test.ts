import { describe, it, expect } from 'vitest';
import { parseAreaParams, areasHref, areaHref } from './areaRoute';

describe('parseAreaParams', () => {
  it('잘못된 값은 기본값', () => {
    expect(parseAreaParams(new URLSearchParams('?repo=abc&days=45&sort=x'))).toEqual({ repoId: null, days: 30, sort: 'recent' });
  });
  it('정상 값', () => {
    expect(parseAreaParams(new URLSearchParams('?repo=2&days=90&sort=waiting'))).toEqual({ repoId: 2, days: 90, sort: 'waiting' });
  });
});

describe('href', () => {
  it('areasHref 기본값 생략', () => {
    expect(areasHref({ repoId: 1 })).toBe('/areas?repo=1');
    expect(areasHref({ repoId: 1, days: 60, sort: 'name' })).toBe('/areas?repo=1&days=60&sort=name');
  });
  it('areaHref 한글 인코딩', () => {
    expect(areaHref('한글 영역', { repoId: 1 })).toBe(`/areas/${encodeURIComponent('한글 영역')}?repo=1`);
    expect(areaHref('x', { repoId: 1, days: 30 })).toBe('/areas/x?repo=1');
    expect(areaHref('x', { repoId: 1, days: 90 })).toBe('/areas/x?repo=1&days=90');
  });
});
