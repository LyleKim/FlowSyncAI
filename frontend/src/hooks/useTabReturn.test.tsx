import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTabReturn } from './useTabReturn';
import { useNow } from './useNow';

let hidden = false;
const setVisibility = (h: boolean) => {
  hidden = h;
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
});
afterEach(() => vi.useRealTimers());

describe('useTabReturn', () => {
  it('visible 전환 1회 호출, hidden 전환 0회, 29초 뒤 0회, 31초 뒤 1회', () => {
    const cb = vi.fn();
    renderHook(() => useTabReturn(cb));
    setVisibility(true);
    expect(cb).not.toHaveBeenCalled();
    setVisibility(false);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(29_000);
    setVisibility(true);
    setVisibility(false);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    setVisibility(true);
    setVisibility(false);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('online 이벤트도 같은 규칙', () => {
    const cb = vi.fn();
    renderHook(() => useTabReturn(cb));
    window.dispatchEvent(new Event('online'));
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(29_000);
    window.dispatchEvent(new Event('online'));
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    window.dispatchEvent(new Event('online'));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('언마운트 후 리스너 제거', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useTabReturn(cb));
    unmount();
    setVisibility(false);
    window.dispatchEvent(new Event('online'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('최신 콜백을 호출한다', () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = renderHook(({ cb }) => useTabReturn(cb), { initialProps: { cb: a } });
    rerender({ cb: b });
    window.dispatchEvent(new Event('online'));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('useNow', () => {
  it('간격마다 새 시각을 준다', () => {
    const { result } = renderHook(() => useNow(1000));
    const first = result.current.getTime();
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.getTime()).toBeGreaterThanOrEqual(first + 1000);
  });
});
