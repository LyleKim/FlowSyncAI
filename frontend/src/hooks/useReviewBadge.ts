import { useContext } from 'react';
import { splitQueue } from '../lib/reviewQueue';
import { ReviewQueueContext } from './ReviewQueueContext';

/** 숨긴 초안을 뺀 리뷰 대기 수. Provider·로그인·데이터가 없거나 0이면 undefined(R8, 결정 39). */
export function useReviewBadge(): number | undefined {
  const ctx = useContext(ReviewQueueContext);
  if (!ctx?.login || !ctx.data) return undefined;
  return splitQueue(ctx.data.items, false).waiting.length || undefined;
}
