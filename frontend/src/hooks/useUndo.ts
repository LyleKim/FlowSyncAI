import { useMemo } from 'react';
import { useToastContext, type UndoAction } from './useToasts';

export { UNDO_WINDOW_MS } from './useToasts';
export type { UndoAction };

/** schedule: 즉시 hide() 후 창이 끝나면 commit(). cancel(key): 그 대기를 commit 없이 되돌림. isPending(key): 해당 key가 대기 중인지. */
export function useUndo() {
  const { schedule, cancel, pendingIds } = useToastContext();
  return useMemo(() => ({ schedule, cancel, isPending: (key?: string) => (key === undefined ? pendingIds.size > 0 : pendingIds.has(key)) }), [schedule, cancel, pendingIds]);
}

/** 대기 중(삭제 예정) key 집합. 어떤 목록이든 이 집합의 id를 걸러 숨길 수 있다. */
export function usePendingIds(): ReadonlySet<string> {
  return useToastContext().pendingIds;
}
