import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEYS,
  getMyLogin,
  getMyTeams,
  normalizeTeam,
  onStorageChange,
  parseTeams,
  setMyTeams,
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
  it('앞뒤 하이픈은 무효, 길이는 39자까지', () => {
    expect(normalizeLogin('octocat-')).toBe('');
    expect(normalizeLogin('-a')).toBe('');
    expect(normalizeLogin('a')).toBe('a');
    expect(normalizeLogin('a'.repeat(39))).toBe('a'.repeat(39));
    expect(normalizeLogin('a'.repeat(40))).toBe('');
  });
});

describe('my teams', () => {
  it('normalizeTeam', () => {
    expect(normalizeTeam('@Acme/Core-Team')).toBe('acme/core-team');
    expect(normalizeTeam('acme')).toBe('');
    expect(normalizeTeam('a b/c')).toBe('');
  });
  it('parseTeams', () => {
    expect(parseTeams('acme/a, acme/a\nacme/b zzz')).toEqual({
      teams: ['acme/a', 'acme/b'],
      invalid: ['zzz'],
    });
  });
  it('빈 배열이면 지운다', () => {
    setMyTeams(['acme/a']);
    setMyTeams([]);
    expect(getMyTeams()).toEqual([]);
  });
  it('저장소가 throw해도 세션 폴백으로 읽는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('x', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('x', 'QuotaExceededError');
    });
    setMyTeams(['acme/a']);
    expect(getMyTeams()).toEqual(['acme/a']);
    setMyTeams([]);
  });
});

describe('onStorageChange', () => {
  it('write 후 1회 호출되고 해제된다', () => {
    const l = vi.fn();
    const off = onStorageChange(l);
    writeStorage(STORAGE_KEYS.myLogin, 'x');
    expect(l).toHaveBeenCalledTimes(1);
    off();
    writeStorage(STORAGE_KEYS.myLogin, 'y');
    expect(l).toHaveBeenCalledTimes(1);
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
