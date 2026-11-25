import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeFetch } from '../test/routeFetch';
import { ApiError } from './connectedReposApi';
import { AliasConflictError, createAreaAlias, deleteAreaAlias, updateAreaAlias } from './areaAliasesApi';

const BASE = '/api/v1/integrations/watched-repos/1/area-aliases/';
const alias = (over = {}) => ({
  id: 7, repoId: 1, pathPrefix: 'backend/payments', displayName: '결제 흐름', status: 'connected',
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('areaAliasesApi', () => {
  it('createAreaAlias: POST 본문은 pathPrefix·displayName만, Idempotency-Key 포함', async () => {
    const { calls } = routeFetch({ [`POST ${BASE}`]: () => ({ status: 201, json: alias() }) });
    const r = await createAreaAlias(1, 'backend/payments', '결제 흐름');
    expect(r.id).toBe(7);
    expect(calls[0].body).toEqual({ pathPrefix: 'backend/payments', displayName: '결제 흐름' });
    expect(JSON.stringify(calls[0].body)).not.toMatch(/githubLogin/);
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
  });

  it('createAreaAlias 409 alias_exists → AliasConflictError.existing', async () => {
    routeFetch({ [`POST ${BASE}`]: () => ({ status: 409, json: { error: 'x', code: 'alias_exists', existing: alias({ displayName: '정산' }) } }) });
    const e = await createAreaAlias(1, 'backend/payments', '결제 흐름').catch((x) => x);
    expect(e).toBeInstanceOf(AliasConflictError);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.existing.displayName).toBe('정산');
  });

  it('createAreaAlias 400 invalid_name → ApiError(코드 유지)', async () => {
    routeFetch({ [`POST ${BASE}`]: () => ({ status: 400, json: { error: 'displayName must be 1-80 characters', code: 'invalid_name' } }) });
    const e = await createAreaAlias(1, 'a', '').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).not.toBeInstanceOf(AliasConflictError);
    expect(e).toMatchObject({ status: 400, code: 'invalid_name' });
  });

  it('updateAreaAlias: PATCH 본문에 expectedUpdatedAt', async () => {
    const { calls } = routeFetch({ [`PATCH ${BASE}7/`]: () => ({ json: alias({ displayName: '새 이름' }) }) });
    const r = await updateAreaAlias(1, 7, '새 이름', '2026-11-02T00:00:00Z');
    expect(r.displayName).toBe('새 이름');
    expect(calls[0].body).toEqual({ displayName: '새 이름', expectedUpdatedAt: '2026-11-02T00:00:00Z' });
  });

  it('updateAreaAlias 409 conflict → AliasConflictError.current', async () => {
    routeFetch({ [`PATCH ${BASE}7/`]: () => ({ status: 409, json: { error: 'x', code: 'conflict', current: alias({ displayName: '정산', updatedAt: '2026-11-03T00:00:00Z' }) } }) });
    const e = await updateAreaAlias(1, 7, '결제 흐름', '2026-11-02T00:00:00Z').catch((x) => x);
    expect(e).toBeInstanceOf(AliasConflictError);
    expect(e.code).toBe('conflict');
    expect(e.current.updatedAt).toBe('2026-11-03T00:00:00Z');
  });

  it('deleteAreaAlias: DELETE 204, 실패는 ApiError', async () => {
    const { calls } = routeFetch({ [`DELETE ${BASE}7/`]: () => ({ status: 204 }) });
    await expect(deleteAreaAlias(1, 7)).resolves.toBeUndefined();
    expect(calls[0].method).toBe('DELETE');
    expect(vi.mocked(fetch).mock.calls[0][1]?.keepalive).toBe(true);
    routeFetch({ [`DELETE ${BASE}7/`]: () => ({ status: 500, json: { error: 'x' } }) });
    await expect(deleteAreaAlias(1, 7)).rejects.toBeInstanceOf(ApiError);
  });
  it('deleteAreaAlias: 404는 이미 삭제됨 → 성공(HTML 본문이어도)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>404</html>', { status: 404 })));
    await expect(deleteAreaAlias(1, 7)).resolves.toBeUndefined();
  });
  it('updateAreaAlias 404 → 실제 클라이언트가 ApiError(status 404)를 던짐(충돌 아님)', async () => {
    routeFetch({ [`PATCH ${BASE}7/`]: () => ({ status: 404, json: { error: 'Not found' } }) });
    const e = await updateAreaAlias(1, 7, 'x', '2026-11-02T00:00:00Z').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).not.toBeInstanceOf(AliasConflictError);
    expect(e.status).toBe(404);
  });
});
