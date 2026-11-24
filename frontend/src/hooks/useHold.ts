import { useState, type FocusEvent, type PointerEvent } from 'react';

/** 컨테이너 안 포커스 또는 마우스 호버 중 true. 터치는 무시. */
export function useHold() {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return {
    held: focused || hovered,
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
