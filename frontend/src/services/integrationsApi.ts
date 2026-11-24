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

export async function addWatchedRepo(url: string, githubLogin?: string): Promise<WatchedRepo> {
  const body: { url: string; githubLogin?: string } = { url };
  if (githubLogin) body.githubLogin = githubLogin;
  return parse<WatchedRepo>(await postJson(`${BASE}/watched-repos/`, body));
}

export async function removeWatchedRepo(id: number): Promise<void> {
  await parse<void>(await fetch(`${BASE}/watched-repos/${id}/`, { method: 'DELETE' }));
}

export async function syncPullRequests(repoId?: number): Promise<SyncResult> {
  return parse<SyncResult>(await postJson(`${BASE}/sync-prs/`, repoId === undefined ? {} : { repoId }));
}

export function formatSyncResult(r: SyncResult): string {
  return r.created > 0 ? `${r.created}개 추가됨` : '새로 추가된 PR 없음';
}

export function formatLastSynced(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '가져온 기록 없음';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '가져온 기록 없음';
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  if (min < 1440) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 1440)}일 전`;
}
