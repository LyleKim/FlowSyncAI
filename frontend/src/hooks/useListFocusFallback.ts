import { useEffect, useRef, type RefObject } from 'react';

// 포커스된 행이 목록에서 사라져 포커스가 body로 떨어지면 목록 제목으로 옮긴다.
// 다른 곳(검색 입력 등)에 포커스가 있으면 건드리지 않는다.
export function useListFocusFallback(headingRef: RefObject<HTMLElement | null>, visibleIds: string[]): void {
  const lastRowId = useRef<string | null>(null);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      lastRowId.current = (e.target as Element | null)?.closest?.('[data-row-id]')?.getAttribute('data-row-id') ?? null;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  useEffect(() => {
    const id = lastRowId.current;
    if (id === null || visibleIds.includes(id)) return;
    if (document.activeElement === document.body) headingRef.current?.focus();
    lastRowId.current = null;
  }, [visibleIds, headingRef]);
}
