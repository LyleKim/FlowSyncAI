import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeFetch } from '../test/routeFetch';
import { AiChecklistError, generateChecklist } from './aiApi';

const URL = 'POST /api/v1/generate-checklist/';
const input = { title: '로그인', description: '설명', roleReviews: [] };

afterEach(() => vi.unstubAllGlobals());

describe('generateChecklist', () => {
  it('성공 시 sub-ai- 접두 고유 id와 completed 기본값', async () => {
    const { calls } = routeFetch({ [URL]: () => ({ json: { checklist: [{ title: 'a' }, { title: 'b', completed: true }] } }) });
    const items = await generateChecklist(input);
    expect(items.map((i) => [i.title, i.completed])).toEqual([['a', false], ['b', true]]);
    expect(items[0].id).toMatch(/^sub-ai-/);
    expect(items[0].id).not.toBe(items[1].id);
    expect(calls[0].body).toEqual(input);
  });

  it('Idempotency-Key 헤더를 보낸다', async () => {
    routeFetch({ [URL]: () => ({ json: { checklist: [] } }) });
    await generateChecklist(input);
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
  });

  it.each([[502, 'upstream'], [500, 'server']])('%i -> kind %s', async (status, kind) => {
    routeFetch({ [URL]: () => ({ status, json: { error: 'x' } }) });
    const e = await generateChecklist(input).catch((x) => x);
    expect(e).toBeInstanceOf(AiChecklistError);
    expect(e.kind).toBe(kind);
  });

  it('fetch reject -> kind network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const e = await generateChecklist(input).catch((x) => x);
    expect(e).toBeInstanceOf(AiChecklistError);
    expect(e.kind).toBe('network');
  });
});
