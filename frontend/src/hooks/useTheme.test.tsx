import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS, removeStorage } from '../lib/storage';
import { useTheme } from './useTheme';

let osDark = false;
let listeners: Array<(e: { matches: boolean }) => void> = [];

beforeEach(() => {
  osDark = false;
  listeners = [];
  localStorage.clear();
  removeStorage(STORAGE_KEYS.theme); // 메모리 폴백도 초기화
  document.documentElement.classList.remove('dark');
  window.matchMedia = ((q: string) => ({
    get matches() { return osDark; },
    media: q,
    addEventListener: (_: string, fn: never) => listeners.push(fn),
    removeEventListener: (_: string, fn: never) => { listeners = listeners.filter((l) => l !== fn); },
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => vi.restoreAllMocks());

const html = () => document.documentElement.classList.contains('dark');
const flipOs = (v: boolean) => act(() => { osDark = v; listeners.forEach((l) => l({ matches: v })); });

describe('useTheme', () => {
  it("legacy 'true' -> dark, setDark(false) removes class and saves", () => {
    localStorage.setItem('darkMode', 'true');
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ dark: true, mode: 'dark' });
    expect(html()).toBe(true);
    act(() => result.current.setDark(false));
    expect(html()).toBe(false);
    expect(localStorage.getItem('darkMode')).toBe('false');
  });

  it('does not throw when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    const { result } = renderHook(() => useTheme());
    expect(() => act(() => result.current.setMode('dark'))).not.toThrow();
    expect(result.current.dark).toBe(true);
  });

  it('no stored value + OS dark -> system, dark', () => {
    osDark = true;
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ mode: 'system', dark: true });
    expect(html()).toBe(true);
  });

  it('system mode follows OS change events', () => {
    const { result } = renderHook(() => useTheme());
    expect(html()).toBe(false);
    flipOs(true);
    expect(result.current.dark).toBe(true);
    expect(html()).toBe(true);
  });

  it('explicit light ignores OS changes', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setMode('light'));
    flipOs(true);
    expect(html()).toBe(false);
  });

  it("setMode('system') stores 'system'", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setMode('system'));
    expect(localStorage.getItem('darkMode')).toBe('system');
  });
});
