import type { AreaAlias, AreaDetail, AreasResponse } from '../types/areas';

export class AreasApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'AreasApiError';
    this.status = status;
    this.code = code;
  }
}

export async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AreasApiError('네트워크 오류', 0, 'network');
  }
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    let code: string | null = null;
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string' && body.error) message = body.error;
      if (body && typeof body.code === 'string') code = body.code;
    } catch {
      /* 본문이 JSON이 아니면 기본 메시지 사용 */
    }
    throw new AreasApiError(message, res.status, code);
  }
  return res.json();
}

const base = (repoId: number) => `/api/v1/integrations/watched-repos/${repoId}`;

export function fetchAreas(
  repoId: number,
  days: number,
  opts: { refresh?: boolean; signal?: AbortSignal } = {},
): Promise<AreasResponse> {
  return get(`${base(repoId)}/areas/?days=${days}${opts.refresh ? '&refresh=1' : ''}`, opts.signal);
}

export function fetchAreaDetail(
  repoId: number,
  areaId: string,
  days: number,
  signal?: AbortSignal,
): Promise<AreaDetail> {
  return get(`${base(repoId)}/areas/${encodeURIComponent(areaId)}/?days=${days}`, signal);
}

export function fetchAreaAliases(repoId: number, signal?: AbortSignal): Promise<AreaAlias[]> {
  return get(`${base(repoId)}/area-aliases/`, signal);
}

