import type { AreaAlias } from '../types/areas';
import { postJson } from './apiClient';
import { ApiError, errorFrom } from './connectedReposApi';

// 읽기(GET)는 areasApi.fetchAreaAliases가 맡는다. 여기는 쓰기만.
export class AliasConflictError extends ApiError {
  current?: AreaAlias;
  existing?: AreaAlias;
}

const url = (repoId: number, id?: number) =>
  `/api/v1/integrations/watched-repos/${repoId}/area-aliases/${id === undefined ? '' : `${id}/`}`;

async function fail(res: Response): Promise<never> {
  const e = await errorFrom(res);
  if (res.status !== 409) throw e;
  const b = (e.body ?? {}) as { current?: AreaAlias; existing?: AreaAlias };
  const c = new AliasConflictError(e.message, e.status, e.code, e.body);
  c.current = b.current;
  c.existing = b.existing;
  throw c;
}

export async function createAreaAlias(repoId: number, pathPrefix: string, displayName: string): Promise<AreaAlias> {
  const res = await postJson(url(repoId), { pathPrefix, displayName });
  if (!res.ok) return fail(res);
  return res.json();
}

export async function updateAreaAlias(
  repoId: number,
  id: number,
  displayName: string,
  expectedUpdatedAt?: string,
): Promise<AreaAlias> {
  const res = await fetch(url(repoId, id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, expectedUpdatedAt }),
  });
  if (!res.ok) return fail(res);
  return res.json();
}

export async function deleteAreaAlias(repoId: number, id: number): Promise<void> {
  const res = await fetch(url(repoId, id), { method: 'DELETE', keepalive: true });
  if (!res.ok && res.status !== 404) await fail(res); // 404 = 이미 삭제됨
}
