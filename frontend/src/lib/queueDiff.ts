import type { ReviewQueueItem } from '../types/reviewQueue';

export function diffQueue(before: ReviewQueueItem[], after: ReviewQueueItem[]) {
  const b = new Map(before.map((i) => [i.id, i]));
  const a = new Map(after.map((i) => [i.id, i]));
  const d = { addedWaiting: 0, movedToAwaiting: 0, movedToClosed: 0, removed: 0, changedIds: [] as string[] };
  for (const [id, item] of a) {
    const prev = b.get(id);
    if (!prev) {
      d.changedIds.push(id);
      if (item.group === 'waiting') d.addedWaiting++;
    } else if (prev.group !== item.group) {
      d.changedIds.push(id);
      if (item.group === 'awaiting_author') d.movedToAwaiting++;
      else if (item.group === 'closed') d.movedToClosed++;
      else d.addedWaiting++; // 다시 대기로 돌아온 행
    }
  }
  for (const id of b.keys()) if (!a.has(id)) { d.removed++; d.changedIds.push(id); }
  return d;
}

export function describeQueueDiff(d: ReturnType<typeof diffQueue>): string | null {
  const parts = [
    d.addedWaiting && `새 리뷰 요청 ${d.addedWaiting}건`,
    d.movedToAwaiting && `작성자 응답 대기로 ${d.movedToAwaiting}건 이동`,
    d.movedToClosed && `정리됨 ${d.movedToClosed}건`,
    d.removed && `목록에서 사라짐 ${d.removed}건`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function nextFocusId(orderedIdsBefore: string[], removedId: string, idsAfter: string[]): string | null {
  const alive = new Set(idsAfter);
  const i = orderedIdsBefore.indexOf(removedId);
  const after = orderedIdsBefore.slice(i + 1).find((id) => alive.has(id));
  if (after) return after;
  return orderedIdsBefore.slice(0, Math.max(i, 0)).reverse().find((id) => alive.has(id)) ?? null;
}
