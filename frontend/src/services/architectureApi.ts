import { ArchitectureResponse } from '../types';

export async function fetchArchitecture(
  url: string,
  days: number,
  refresh = false,
  signal?: AbortSignal,
): Promise<ArchitectureResponse> {
  const qs = new URLSearchParams({ url, days: String(days) });
  if (refresh) qs.set('refresh', '1');
  const res = await fetch(`/api/v1/integrations/architecture/?${qs.toString()}`, { signal });
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string' && body.error) message = body.error;
    } catch {
      /* 본문이 JSON이 아니면 기본 메시지 사용 */
    }
    throw new Error(message);
  }
  return res.json();
}
