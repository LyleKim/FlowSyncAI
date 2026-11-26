import type { DescribeResult, FolderDescription, RepoTree } from '../types/areas';
import { postJson } from './apiClient';
import { get } from './areasApi';
import { ApiError, errorFrom } from './connectedReposApi';

// 계약 §8. 트리 GET은 영역 GET과 같은 오류 모양(AreasApiError), 쓰기는 ApiError(본문 유지: retryAfterSeconds·failed)
const base = (repoId: number) => `/api/v1/integrations/watched-repos/${repoId}`;

export function fetchRepoTree(repoId: number, opts: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<RepoTree> {
  return get(`${base(repoId)}/tree/${opts.refresh ? '?refresh=1' : ''}`, opts.signal);
}

async function send(run: () => Promise<Response>): Promise<Response> {
  let res: Response;
  try {
    res = await run();
  } catch {
    throw new ApiError('네트워크 오류', 0, 'network');
  }
  if (!res.ok) throw await errorFrom(res);
  return res;
}

export async function describeFolders(repoId: number, force = false): Promise<DescribeResult> {
  const res = await send(() => postJson(`${base(repoId)}/describe/`, force ? { force: true } : {}));
  return res.json();
}

export async function updateFolderDescription(repoId: number, path: string, text: string): Promise<FolderDescription> {
  const res = await send(() =>
    fetch(`${base(repoId)}/tree/folders/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, text }),
    }),
  );
  return (await res.json()).description;
}

export async function deleteFolderDescription(repoId: number, path: string): Promise<void> {
  try {
    await send(() => fetch(`${base(repoId)}/tree/folders/?path=${encodeURIComponent(path)}`, { method: 'DELETE', keepalive: true }));
  } catch (e) {
    if (e instanceof ApiError && e.code === 'description_not_found') return; // 이미 지워짐
    throw e;
  }
}
