import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS, removeStorage, writeStorage } from '../lib/storage';
import { useMyLogin, useMyTeams } from './useMyLogin';

afterEach(() => {
  removeStorage(STORAGE_KEYS.myLogin);
  removeStorage(STORAGE_KEYS.myTeams);
});

describe('useMyLogin', () => {
  it('초기 null, save/clear, 외부 변경 구독', () => {
    const { result } = renderHook(() => useMyLogin());
    expect(result.current.login).toBeNull();
    let r: string | null = null;
    act(() => {
      r = result.current.save('@Octocat ');
    });
    expect(r).toBe('octocat');
    expect(result.current.login).toBe('octocat');
    act(() => {
      r = result.current.save('a b');
    });
    expect(r).toBeNull();
    expect(result.current.login).toBe('octocat');
    act(() => writeStorage(STORAGE_KEYS.myLogin, 'x'));
    expect(result.current.login).toBe('x');
    act(() => result.current.clear());
    expect(result.current.login).toBeNull();
  });
});

describe('useMyTeams', () => {
  it('무효 토큰이면 저장하지 않는다', () => {
    const { result } = renderHook(() => useMyTeams());
    let r: ReturnType<typeof result.current.save> | undefined;
    act(() => {
      r = result.current.save('acme/a, bad');
    });
    expect(r).toEqual({ ok: false, invalid: ['bad'], tooMany: false });
    expect(result.current.teams).toEqual([]);
  });
  it('11개면 tooMany', () => {
    const { result } = renderHook(() => useMyTeams());
    const raw = Array.from({ length: 11 }, (_, i) => `acme/t${i}`).join(',');
    let r: ReturnType<typeof result.current.save> | undefined;
    act(() => {
      r = result.current.save(raw);
    });
    expect(r).toMatchObject({ ok: false, tooMany: true });
  });
  it('성공 저장', () => {
    const { result } = renderHook(() => useMyTeams());
    act(() => {
      result.current.save('acme/a');
    });
    expect(result.current.teams).toEqual(['acme/a']);
  });
});
