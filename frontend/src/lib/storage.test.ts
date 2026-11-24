import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEYS,
  getMyLogin,
  normalizeLogin,
  purgeLegacyKeys,
  readStorage,
  setMyLogin,
  writeStorage,
} from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('storage wrapper', () => {
  it('접근이 throw해도 null/false로 동작하고 같은 세션에서는 폴백으로 읽는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('x', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('x', 'QuotaExceededError');
    });
    expect(readStorage(STORAGE_KEYS.theme)).toBeNull();
    expect(writeStorage(STORAGE_KEYS.theme, 'true')).toBe(false);
    expect(readStorage(STORAGE_KEYS.theme)).toBe('true');
  });

  it('깨진 값은 문자열 그대로 돌려준다', () => {
    localStorage.setItem(STORAGE_KEYS.theme, '{');
    expect(readStorage(STORAGE_KEYS.theme)).toBe('{');
  });
});

describe('normalizeLogin', () => {
  it('정규화한다', () => {
    expect(normalizeLogin('@Octocat ')).toBe('octocat');
    expect(normalizeLogin('github.com/OCTOCAT')).toBe('octocat');
    expect(normalizeLogin('https://github.com/OCTOCAT/')).toBe('octocat');
  });
  it('무효면 빈 문자열', () => {
    expect(normalizeLogin('a b')).toBe('');
    expect(normalizeLogin('-x')).toBe('');
    expect(normalizeLogin('')).toBe('');
  });
});

describe('my login', () => {
  it('무효 입력은 null이고 저장하지 않는다', () => {
    expect(setMyLogin('  ')).toBeNull();
    expect(getMyLogin()).toBeNull();
  });
  it('유효 입력은 정규화해 저장한다', () => {
    expect(setMyLogin('@Octocat')).toBe('octocat');
    expect(getMyLogin()).toBe('octocat');
  });
});

describe('purgeLegacyKeys', () => {
  it('tasks/activities만 지운다', () => {
    localStorage.setItem('tasks', '[]');
    localStorage.setItem('activities', '[]');
    localStorage.setItem(STORAGE_KEYS.theme, 'true');
    purgeLegacyKeys();
    expect(localStorage.getItem('tasks')).toBeNull();
    expect(localStorage.getItem('activities')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('true');
  });
});
