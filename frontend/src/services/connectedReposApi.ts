import type { WatchedRepo } from '../types';
import type { RepoError, RepoSyncState } from '../types/repoSync';
import { postJson } from './apiClient';

const BASE = '/api/v1/integrations';

export interface ConnectedRepo extends WatchedRepo {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: RepoError | null;
  truncated: boolean;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: unknown;
  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export interface QueueProbe {
  login: string;
  knownLogin: boolean;
  repos: RepoSyncState[];
  counts: { waiting: number; awaitingAuthor: number; closed: number };
}

// 구버전 응답(신규 필드 없음)을 null/false로 채운다.
function normalize(r: Partial<ConnectedRepo> & WatchedRepo): ConnectedRepo {
  return {
    ...r,
    lastAttemptAt: r.lastAttemptAt ?? null,
    lastSuccessAt: r.lastSuccessAt ?? r.lastSyncedAt ?? null,
    lastError: r.lastError ?? null,
    truncated: r.truncated ?? false,
  };
}

export async function errorFrom(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const b = (body ?? {}) as { error?: unknown; code?: unknown };
  const message = typeof b.error === 'string' ? b.error : `요청 실패 (${res.status})`;
  return new ApiError(message, res.status, typeof b.code === 'string' ? b.code : undefined, body);
}

export async function listConnectedRepos(): Promise<ConnectedRepo[]> {
  const res = await fetch(`${BASE}/watched-repos/`);
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as ConnectedRepo[]).map(normalize);
}

export async function connectRepo(url: string): Promise<{ repo: ConnectedRepo; alreadyConnected: boolean }> {
  const res = await postJson(`${BASE}/watched-repos/`, { url });
  if (res.status === 409) {
    const err = await errorFrom(res);
    const existing = (err.body as { existing?: ConnectedRepo } | undefined)?.existing;
    if (existing) return { repo: normalize(existing), alreadyConnected: true };
    throw err;
  }
  if (!res.ok) throw await errorFrom(res);
  return { repo: normalize((await res.json()) as ConnectedRepo), alreadyConnected: false };
}

export async function probeReviewQueue(
  login: string,
  teams: string[] = [],
  signal?: AbortSignal,
): Promise<QueueProbe | null> {
  const q = new URLSearchParams({ login });
  if (teams.length) q.set('teams', teams.join(','));
  try {
    const res = await fetch(`${BASE}/review-queue/?${q}`, { signal });
    if (res.status !== 200) return null;
    const { login: l, knownLogin, repos, counts } = (await res.json()) as QueueProbe;
    return { login: l, knownLogin, repos, counts };
  } catch {
    return null;
  }
}
