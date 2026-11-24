import { useMemo, useState } from 'react';
import { diffQueue } from '../lib/queueDiff';
import type { ReviewQueueItem, ReviewQueueResponse } from '../types/reviewQueue';

/** held 동안 items만 직전 스냅샷에 고정(repos 등은 live). 렌더 중 자기 state 조정 패턴이라 StrictMode에서도 멱등. */
export function useFrozenQueue(live: ReviewQueueResponse | null, held: boolean) {
  const [frozen, setFrozen] = useState<ReviewQueueItem[] | null>(null);
  const [last, setLast] = useState<ReviewQueueItem[] | null>(null);

  let items: ReviewQueueItem[] | null = live?.items ?? null;
  if (live) {
    if (!held) {
      if (frozen) setFrozen(null);
      if (last !== live.items) setLast(live.items);
    } else if (frozen) items = frozen;
    else {
      items = last ?? live.items;
      setFrozen(items);
      if (last !== items) setLast(items);
    }
  }

  const shown = useMemo(() => (live && items ? { ...live, items } : null), [live, items]);
  const pendingCount = live && items ? diffQueue(items, live.items).changedIds.length : 0;
  const applyNow = () => {
    if (!live) return;
    setLast(live.items);
    setFrozen(held ? live.items : null);
  };
  return { shown, pendingCount, applyNow };
}
