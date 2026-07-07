/**
 * 리소스를 생성하는 POST 요청 전용 래퍼.
 * 매 호출마다 Idempotency-Key를 붙여, 백엔드의 IdempotencyRecord 재생 로직이
 * 실제로 동작하도록 한다 (같은 요청이 두 번 도달해도 리소스가 중복 생성되지 않음).
 */
export function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}
