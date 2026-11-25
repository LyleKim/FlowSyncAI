import { useSyncExternalStore } from 'react';

// 표/카드처럼 두 레이아웃 중 하나만 렌더할 때 쓴다: CSS로 숨기면 jsdom에서 검증할 수 없고, 낭독 중복도 막는다
const WIDE = '(min-width: 768px)';
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
export const useWide = () => useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches);
