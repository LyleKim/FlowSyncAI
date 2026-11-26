import { useCallback, useRef } from 'react';

const pick = (el: Element | null, selector: string) =>
  (el?.matches(selector) ? el : el?.querySelector(selector) ?? null) as HTMLElement | null;

/**
 * 항목(행·토스트·버튼)에 붙이는 ref 콜백. 그 요소가 DOM에서 빠질 때 안에 포커스가 있었다면
 * 다음 형제 → 이전 형제의 `selector` 컨트롤 → fallback 순으로 포커스를 옮긴다(body로 떨어지지 않게).
 * React 19 ref cleanup은 노드를 떼기 전에 불리므로 포커스가 아직 항목 안에 있다.
 * 콜백 정체성은 고정이라 리렌더마다 떼였다 붙지 않는다.
 */
export function useFocusRescue(selector: string, fallback: (el: HTMLElement) => HTMLElement | null | undefined) {
  const fb = useRef(fallback);
  fb.current = fallback;
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      return () => {
        if (!el.contains(document.activeElement)) return;
        (pick(el.nextElementSibling, selector) ?? pick(el.previousElementSibling, selector) ?? fb.current(el))?.focus();
      };
    },
    [selector],
  );
}
