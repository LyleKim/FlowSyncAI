import { useEffect, useRef } from 'react';

/** 탭이 다시 보이거나 온라인으로 돌아오면 onReturn 호출. 직전 호출 후 minGapMs 안이면 생략. */
export function useTabReturn(onReturn: () => void, minGapMs = 30_000): void {
  const cb = useRef(onReturn);
  cb.current = onReturn;
  useEffect(() => {
    let last = -Infinity;
    const fire = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - last < minGapMs) return;
      last = now;
      cb.current();
    };
    document.addEventListener('visibilitychange', fire);
    window.addEventListener('online', fire);
    return () => {
      document.removeEventListener('visibilitychange', fire);
      window.removeEventListener('online', fire);
    };
  }, [minGapMs]);
}
