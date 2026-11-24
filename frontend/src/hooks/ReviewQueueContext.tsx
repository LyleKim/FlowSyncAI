import { createContext, useContext, type ReactNode } from 'react';
import { useMyLogin, useMyTeams } from './useMyLogin';
import { useReviewQueue, type ReviewQueueState } from './useReviewQueue';

export type ReviewQueueContextValue = ReviewQueueState & { login: string | null };

export const ReviewQueueContext = createContext<ReviewQueueContextValue | null>(null);

/** 앱 전체에서 리뷰 큐 상태 하나를 /me 화면과 사이드바 배지가 공유한다. */
export function ReviewQueueProvider({ children }: { children: ReactNode }) {
  const { login } = useMyLogin();
  const { teams } = useMyTeams();
  const queue = useReviewQueue(login, teams);
  return <ReviewQueueContext.Provider value={{ ...queue, login }}>{children}</ReviewQueueContext.Provider>;
}

export function useReviewQueueContext(): ReviewQueueContextValue {
  const ctx = useContext(ReviewQueueContext);
  if (!ctx) throw new Error('useReviewQueueContext는 ReviewQueueProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
