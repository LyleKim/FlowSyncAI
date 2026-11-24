export type RepoErrorKind = 'auth' | 'rate_limit' | 'not_found' | 'upstream' | 'unknown';

export interface RepoError {
  kind: RepoErrorKind;
  message: string;
  resetAt?: string | null;
}

export interface RepoSyncState {
  repoId: number;
  repo: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: RepoError | null;
  truncated: boolean;
}
