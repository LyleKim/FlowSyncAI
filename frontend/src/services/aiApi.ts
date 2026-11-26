import type { RoleReview, SubTask } from '../types';
import { postJson } from './apiClient';

export class AiChecklistError extends Error {
  kind: 'upstream' | 'server' | 'network';
  constructor(kind: AiChecklistError['kind'], message: string) {
    super(message);
    this.kind = kind;
    this.name = 'AiChecklistError';
  }
}

/** 저장하지 않고 제안만 받는다. 호출부가 replaceSubtasks(PUT)로 반영한다. */
export async function generateChecklist(input: { title: string; description: string; roleReviews: RoleReview[] }): Promise<SubTask[]> {
  let res: Response;
  try {
    res = await postJson('/api/v1/generate-checklist/', input);
  } catch {
    throw new AiChecklistError('network', '네트워크 오류');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new AiChecklistError(res.status === 502 ? 'upstream' : 'server', data?.error ?? `HTTP ${res.status}`);
  if (!Array.isArray(data?.checklist)) throw new AiChecklistError('server', '응답 형식이 올바르지 않아요');
  return data.checklist.map((item: { title: string; completed?: boolean }) => ({
    id: `sub-ai-${crypto.randomUUID()}`,
    title: item.title,
    completed: item.completed ?? false,
  }));
}
