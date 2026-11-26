import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMyLogin, useMyTeams } from './useMyLogin';
import { useReviewQueue, type ReviewQueueState } from './useReviewQueue';

export type ReviewQueueContextValue = ReviewQueueState & { login: string | null };

export const ReviewQueueContext = createContext<ReviewQueueContextValue | null>(null);

/** 앱 전체에서 리뷰 큐 상태 하나를 /me 화면과 사이드바 배지가 공유한다. */
export function ReviewQueueProvider({ children }: { children: ReactNode }) {
  const { login } = useMyLogin();
  const { teams } = useMyTeams();
  const q = useReviewQueue(login, teams);
  // 필드 단위로 메모해 PrSync 상태 변화 등으로 Provider만 리렌더될 때 소비자가 다시 그려지지 않게 한다
  const value = useMemo(
    () => ({ ...q, login }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, q.loadState, q.loadError, q.refreshError, q.refreshing, q.retryingRepoId, q.refresh, q.reload, q.retryRepo, login],
  );
  return <ReviewQueueContext.Provider value={value}>{children}</ReviewQueueContext.Provider>;
}

export function useReviewQueueContext(): ReviewQueueContextValue {
  const ctx = useContext(ReviewQueueContext);
  if (!ctx) throw new Error('useReviewQueueContext는 ReviewQueueProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
