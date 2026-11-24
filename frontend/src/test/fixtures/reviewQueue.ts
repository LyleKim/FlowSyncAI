import type { RepoSyncState } from '../../types/repoSync';
import type { ReviewQueueItem, ReviewQueueResponse } from '../../types/reviewQueue';

export function makeQueueItem(over: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: 'acme/api#58:minji-park',
    repoId: 1,
    repo: 'acme/api',
    number: 58,
    title: '결제 웹훅 재시도',
    url: 'https://github.com/acme/api/pull/58',
    author: 'jun-ho',
    isDraft: false,
    prState: 'open',
    group: 'waiting',
    requestKind: 'direct',
    viaTeam: null,
    requestedAt: '2026-11-20T01:10:00Z',
    requestedAtSource: 'event',
    reRequested: false,
    myReview: null,
    size: { additions: 120, deletions: 14, changedFiles: 6 },
    closedAt: null,
    mergedAt: null,
    closedReason: null,
    mergedWithoutMyReview: false,
    updatedAt: '2026-11-24T04:55:00Z',
    ...over,
  };
}

export function makeRepo(over: Partial<RepoSyncState> = {}): RepoSyncState {
  return {
    repoId: 1,
    repo: 'acme/api',
    lastAttemptAt: '2026-11-24T05:02:10Z',
    lastSuccessAt: '2026-11-24T05:02:10Z',
    lastError: null,
    truncated: false,
    ...over,
  };
}

/** counts는 items에서 계산해 항상 일치(over.counts를 주면 그대로 덮어씀). */
export function makeQueue(over: Partial<ReviewQueueResponse> = {}): ReviewQueueResponse {
  const items = over.items ?? [makeQueueItem()];
  const n = (g: string) => items.filter((i) => i.group === g).length;
  return {
    login: 'minji-park',
    knownLogin: true,
    repos: [makeRepo()],
    counts: { waiting: n('waiting'), awaitingAuthor: n('awaiting_author'), closed: n('closed') },
    ...over,
    items,
  };
}
