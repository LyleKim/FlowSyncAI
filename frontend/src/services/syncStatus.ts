import type { RepoErrorKind } from '../types/repoSync';

export interface SyncStatusInfo {
  lastSuccessAt: string | null;
  syncing: boolean;
  error: { kind: RepoErrorKind; resetAt?: string | null } | null;
  truncated: boolean;
}

// 서버 응답 필드 매핑은 이 함수 한 곳에만 둔다.
// raw: Error(요청 실패) | SyncResult(+선택적 repos[], api-contract §2)
export function toSyncStatus(raw: unknown, prev: SyncStatusInfo): SyncStatusInfo {
  if (raw instanceof Error) {
    return { ...prev, syncing: false, error: { kind: 'unknown' } };
  }
  const repos = (raw as { repos?: Array<Record<string, any>> } | null)?.repos;
  if (!Array.isArray(repos)) {
    return { ...prev, syncing: false, error: null, lastSuccessAt: new Date().toISOString() };
  }
  const successes = repos.map((r) => r.lastSuccessAt as string | null).filter(Boolean) as string[];
  const failed = repos.find((r) => r.lastError);
  return {
    syncing: false,
    lastSuccessAt: successes.sort().at(-1) ?? prev.lastSuccessAt,
    error: failed ? { kind: failed.lastError.kind, resetAt: failed.lastError.resetAt } : null,
    truncated: repos.some((r) => r.truncated),
  };
}

export const mockSyncStatus = (over: Partial<SyncStatusInfo> = {}): SyncStatusInfo => ({
  lastSuccessAt: null,
  syncing: false,
  error: null,
  truncated: false,
  ...over,
});
