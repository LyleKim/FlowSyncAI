import { WatchedRepo, SyncResult } from '../types';
import { postJson } from './apiClient';

const BASE = '/api/v1/integrations';

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string') msg = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function listWatchedRepos(): Promise<WatchedRepo[]> {
  return parse<WatchedRepo[]>(await fetch(`${BASE}/watched-repos/`));
}

export async function removeWatchedRepo(id: number): Promise<void> {
  await parse<void>(await fetch(`${BASE}/watched-repos/${id}/`, { method: 'DELETE', keepalive: true }));
}

export async function syncPullRequests(repoId?: number): Promise<SyncResult> {
  return parse<SyncResult>(await postJson(`${BASE}/sync-prs/`, repoId === undefined ? {} : { repoId }));
}

export function formatSyncResult(r: SyncResult): string {
  return r.created > 0 ? `${r.created}개 추가됨` : '새로 추가된 PR 없음';
}
