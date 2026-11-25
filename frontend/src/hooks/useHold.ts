import { useState, type FocusEvent, type PointerEvent } from 'react';

/** 컨테이너 안 포커스 또는 마우스 호버 중 true. 터치는 무시. release: 컨테이너·포커스 요소가 사라져 blur/pointerleave 없이 빠졌을 때 보류 해제. */
export function useHold() {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return {
    held: focused || hovered,
    release: () => {
      setFocused(false);
      setHovered(false);
    },
    holdProps: {
      onFocusCapture: () => setFocused(true),
      onBlurCapture: (e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      },
      onPointerEnter: (e: PointerEvent) => { if (e.pointerType === 'mouse') setHovered(true); },
      onPointerLeave: (e: PointerEvent) => { if (e.pointerType === 'mouse') setHovered(false); },
    },
  };
}
