import { vi } from 'vitest';

export interface RouteReq {
  url: string;
  method: string;
  body: unknown;
}
export type RouteHandler = (req: RouteReq) => { status?: number; json?: unknown };

/** 키 "GET /api/v1/…"(쿼리 제외 경로, 없으면 전체 URL로도 매칭). 일치 없으면 500. */
export function routeFetch(routes: Record<string, RouteHandler>): { calls: RouteReq[] } {
  const calls: RouteReq[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const raw = typeof init?.body === 'string' ? init.body : undefined;
      const req = { url, method, body: raw === undefined ? undefined : JSON.parse(raw) };
      calls.push(req);
      const handler = routes[`${method} ${url.split('?')[0]}`] ?? routes[`${method} ${url}`];
      if (!handler) return new Response(null, { status: 500 });
      const { status = 200, json } = handler(req);
      return new Response(json === undefined ? null : JSON.stringify(json), { status });
    }),
  );
  return { calls };
}
