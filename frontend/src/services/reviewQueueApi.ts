import type { ReviewQueueResponse } from '../types/reviewQueue';

export class QueueFetchError extends Error {
  kind: 'login_required' | 'server' | 'network';
  status?: number;
  constructor(kind: QueueFetchError['kind'], message: string, status?: number) {
    super(message);
    this.name = 'QueueFetchError';
    this.kind = kind;
    this.status = status;
  }
}

export async function fetchReviewQueue(
  p: { login: string; teams?: string[]; closedWithinDays?: number },
  signal?: AbortSignal,
): Promise<ReviewQueueResponse> {
  let url = `/api/v1/integrations/review-queue/?login=${encodeURIComponent(p.login)}&closedWithinDays=${p.closedWithinDays ?? 7}`;
  if (p.teams?.length) {
    url += `&teams=${p.teams.map((t) => encodeURIComponent(t.toLowerCase())).join(',')}`;
  }
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new QueueFetchError('network', '서버에 연결하지 못했어요');
  }
  if (res.status === 400) throw new QueueFetchError('login_required', 'GitHub 로그인이 필요해요', 400);
  if (!res.ok) throw new QueueFetchError('server', '서버 오류', res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new QueueFetchError('server', '응답을 읽지 못했어요', res.status);
  }
  const b = body as { items?: unknown } | null;
  if (typeof b !== 'object' || b === null || !Array.isArray(b.items)) {
    throw new QueueFetchError('server', '응답 형식이 올바르지 않아요', res.status);
  }
  return body as ReviewQueueResponse;
}
