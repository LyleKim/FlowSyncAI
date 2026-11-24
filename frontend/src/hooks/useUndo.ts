import { useMemo } from 'react';
import { useToastContext, type UndoAction } from './useToasts';

export { UNDO_WINDOW_MS } from './useToasts';
export type { UndoAction };

/** schedule: 즉시 hide() 후 창이 끝나면 commit(). isPending(key): 해당 key가 대기 중인지. */
export function useUndo() {
  const { schedule, pendingIds } = useToastContext();
  return useMemo(() => ({ schedule, isPending: (key?: string) => (key === undefined ? pendingIds.size > 0 : pendingIds.has(key)) }), [schedule, pendingIds]);
}

/** 대기 중(삭제 예정) key 집합. 어떤 목록이든 이 집합의 id를 걸러 숨길 수 있다. */
export function usePendingIds(): ReadonlySet<string> {
  return useToastContext().pendingIds;
}
