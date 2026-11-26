import type { RepoSyncState } from './repoSync';

export type QueueGroupKey = 'waiting' | 'awaiting_author' | 'closed';

export interface ReviewQueueItem {
  id: string;
  repoId: number;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  isDraft: boolean;
  prState: 'open' | 'merged' | 'closed';
  group: QueueGroupKey;
  requestKind: 'direct' | 'team';
  viaTeam: string | null;
  requestedAt: string;
  requestedAtSource: 'event' | 'pr_created';
  reRequested: boolean;
  myReview: { state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'; submittedAt: string } | null;
  size: { additions: number; deletions: number; changedFiles: number } | null;
  closedAt: string | null;
  mergedAt: string | null;
  closedReason: 'merged' | 'closed' | 'request_withdrawn' | null;
  mergedWithoutMyReview: boolean;
  updatedAt: string;
}

export interface ReviewQueueResponse {
  login: string;
  knownLogin: boolean;
  repos: RepoSyncState[];
  counts: { waiting: number; awaitingAuthor: number; closed: number };
  items: ReviewQueueItem[];
}
