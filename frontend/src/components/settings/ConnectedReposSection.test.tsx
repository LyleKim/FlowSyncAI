import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import { ToastProvider } from '../../hooks/useToasts';
import { ToastHost } from '../common/ToastHost';
import { routeFetch, type RouteHandler } from '../../test/routeFetch';
import ConnectedReposSection from './ConnectedReposSection';
import { liveRegions } from '../../test/live';

const sync = vi.hoisted(() => ({ syncing: false, syncNow: undefined as unknown as ReturnType<typeof vi.fn> }));
vi.mock('../../hooks/PrSyncContext', () => ({
  usePrSyncContext: () => ({
    status: { syncing: sync.syncing, lastSuccessAt: null, error: null, truncated: false },
    syncNow: sync.syncNow,
    lastResultText: '',
  }),
}));

const NOW = new Date();
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const repo = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id, url: `https://github.com/acme/${name}`, owner: 'acme', name, githubLogin: '', lastSyncedAt: ago(5),
  lastAttemptAt: ago(5), lastSuccessAt: ago(5), lastError: null, truncated: false,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: ago(5), ...over,
});
const API = repo(1, 'api');
const WEB = repo(2, 'web', { lastError: { kind: 'upstream', message: '' }, truncated: true });
const LIST = 'GET /api/v1/integrations/watched-repos/';
const POST = 'POST /api/v1/integrations/watched-repos/';

const setup = (routes: Record<string, RouteHandler>, route = '/settings') => {
  const r = routeFetch(routes);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider><ConnectedReposSection /><ToastHost /></ToastProvider>
    </MemoryRouter>,
  );
  return { ...r, user };
};
const count = (calls: { method: string; url: string }[], method: string) =>
  calls.filter((c) => c.method === method && c.url.includes('watched-repos')).length;
const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sync.syncing = false;
  sync.syncNow = vi.fn(async () => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ConnectedReposSection', () => {
  it('(a) 빈 목록 → 빈 상태, 지금 가져오기 없음, ?focus=repos면 추가 입력에 포커스', async () => {
    setup({ [LIST]: () => ({ json: [] }) }, '/settings?focus=repos');
    expect(await screen.findByText('아직 리뷰 요청을 가져올 레포가 없어요')).toBeInTheDocument();
    expect(screen.getByText('레포를 연결하면 내게 온 리뷰 요청이 여기에 모여요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '지금 가져오기' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('레포 추가'));
    expect(screen.getByLabelText('레포 추가')).toHaveAttribute('placeholder', 'github.com/owner/name');
  });

  it('(b) 정상·실패 행: 배지 텍스트, 사유 본문, 일부만 가져옴', async () => {
    setup({ [LIST]: () => ({ json: [API, WEB] }) });
    await screen.findByText('acme/api');
    expect(within(row('acme/api')).getByText('정상')).toBeInTheDocument();
    expect(within(row('acme/api')).getByText('5분 전 가져옴')).toBeInTheDocument();
    const web = row('acme/web');
    expect(within(web).getByText('실패')).toBeInTheDocument();
    expect(within(web).getByText('GitHub가 응답하지 않았어요')).toBeInTheDocument();
    expect(within(web).getByText(/잠시 뒤에 다시 시도해 주세요/)).toBeInTheDocument();
    expect(within(web).getByText('일부만 가져왔어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지금 가져오기' })).toBeInTheDocument();
  });

  it('(c) auth 실패: 다시 시도 없음, 복사 실패 시 읽기 전용 입력에 adminCopy', async () => {
    const AUTH = repo(3, 'core', { lastError: { kind: 'auth', message: 'Bad credentials' } });
    const { user } = setup({ [LIST]: () => ({ json: [AUTH] }) });
    // user-event가 setup에서 clipboard를 갈아끼우므로 그 뒤에 덮는다.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('x')) } });
    await screen.findByText('acme/core');
    const r = row('acme/core');
    expect(within(r).queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    await user.click(within(r).getByRole('button', { name: '관리자에게 보낼 내용 복사' }));
    const box = await within(r).findByRole('textbox');
    expect(box).toHaveAttribute('readonly');
    expect((box as HTMLInputElement).value).toMatch(/acme\/core 레포를 읽지 못했어요.*GITHUB_TOKEN/);
  });

  it('(c2) 복사 성공 → role=status 복사했어요', async () => {
    const AUTH = repo(3, 'core', { lastError: { kind: 'auth', message: '' } });
    const { user } = setup({ [LIST]: () => ({ json: [AUTH] }) });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await screen.findByText('acme/core');
    await user.click(screen.getByRole('button', { name: '관리자에게 보낼 내용 복사' }));
    expect((await screen.findByText('복사했어요')).closest('[role="status"]')).not.toBeNull();
  });

  it('(d) rate_limit + 미래 resetAt → 다시 시도 aria-disabled, 사유, 클릭 무시', async () => {
    const reset = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    const RL = repo(4, 'rl', { lastError: { kind: 'rate_limit', message: '', resetAt: reset } });
    const { user } = setup({ [LIST]: () => ({ json: [RL] }) });
    await screen.findByText('acme/rl');
    const btn = within(row('acme/rl')).getByRole('button', { name: '다시 시도' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAccessibleDescription(/부터 가능/);
    await user.click(btn);
    expect(sync.syncNow).not.toHaveBeenCalled();
  });

  it('(e) 추가 201 → 행 추가, 입력 비움, syncNow 1회', async () => {
    const NEW = repo(9, 'new', { lastSuccessAt: null, lastSyncedAt: null });
    const { user, calls } = setup({ [LIST]: () => ({ json: [] }), [POST]: () => ({ status: 201, json: NEW }) });
    await screen.findByText('아직 리뷰 요청을 가져올 레포가 없어요');
    const input = screen.getByLabelText('레포 추가');
    await user.type(input, 'github.com/acme/new');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText('acme/new')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ url: 'github.com/acme/new' });
  });

  it('(f) 409 + existing → 중복 행 없음, 이미 연결된 레포예요, 오류 없음', async () => {
    const { user } = setup({
      [LIST]: () => ({ json: [API] }),
      [POST]: () => ({ status: 409, json: { error: 'dup', code: 'already_connected', existing: API } }),
    });
    await screen.findByText('acme/api');
    await user.type(screen.getByLabelText('레포 추가'), 'https://github.com/acme/api');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect((await screen.findByText(/이미 연결된 레포예요/)).closest('[role="status"]')).not.toBeNull();
    expect(screen.getAllByText('acme/api')).toHaveLength(1);
    expect(liveRegions('alert')).toHaveLength(0);
  });

  it('(g) 400 invalid_url → 인라인 aria-invalid, 입력 유지', async () => {
    const { user } = setup({
      [LIST]: () => ({ json: [] }),
      [POST]: () => ({ status: 400, json: { error: 'GitHub 레포 URL이 아니에요', code: 'invalid_url' } }),
    });
    await screen.findByText('아직 리뷰 요청을 가져올 레포가 없어요');
    const input = screen.getByLabelText('레포 추가');
    await user.type(input, 'nope');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText('GitHub 레포 URL이 아니에요')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/GitHub 레포 URL이 아니에요/);
    expect(input).toHaveValue('nope');
  });

  it('(g2) 네트워크 실패 → 저장하지 못했어요, 입력 유지', async () => {
    const { user } = setup({ [LIST]: () => ({ json: [] }) });
    await screen.findByText('아직 리뷰 요청을 가져올 레포가 없어요');
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    const orig = f.getMockImplementation() as (i: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    f.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? Promise.reject(new TypeError('Failed to fetch')) : orig(input, init));
    const input = screen.getByLabelText('레포 추가');
    await user.type(input, 'github.com/acme/x');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect((await screen.findByText('저장하지 못했어요')).closest('p')).toHaveTextContent('저장하지 못했어요 입력한 내용은 그대로 두었어요. 잠시 후 다시 시도해 주세요.');
    expect(input).toHaveValue('github.com/acme/x');
  });

  it('(h) 연결 해제 → 즉시 숨김, 알림·되돌리기, 9.9초 DELETE 0회, 10초 1회', async () => {
    const { user, calls } = setup({ [LIST]: () => ({ json: [API] }), 'DELETE /api/v1/integrations/watched-repos/1/': () => ({ status: 204 }) });
    await screen.findByText('acme/api');
    const t0 = Date.now();
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    expect(screen.queryByText('acme/api')).not.toBeInTheDocument();
    expect(screen.getByText('acme/api 연결을 해제했어요 · 팀 모두에게 적용돼요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(t0 + 9_900 - Date.now()); });
    expect(count(calls, 'DELETE')).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(t0 + 10_050 - Date.now()); });
    expect(count(calls, 'DELETE')).toBe(1);
  });

  it('(i) 되돌리기 → 행 복귀, DELETE 0회', async () => {
    const { user, calls } = setup({ [LIST]: () => ({ json: [API] }) });
    await screen.findByText('acme/api');
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(screen.getByText('acme/api')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    expect(count(calls, 'DELETE')).toBe(0);
  });

  it('(i2) 해제 대기 중 같은 레포를 다시 추가(409) → 해제 취소, 행 복귀, DELETE 0회', async () => {
    const { user, calls } = setup({
      [LIST]: () => ({ json: [API] }),
      [POST]: () => ({ status: 409, json: { error: 'dup', code: 'already_connected', existing: API } }),
    });
    await screen.findByText('acme/api');
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    expect(screen.queryByText('acme/api')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('레포 추가'), 'https://github.com/acme/api');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText('acme/api')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    expect(count(calls, 'DELETE')).toBe(0);
    expect(screen.getByText('acme/api')).toBeInTheDocument();
  });

  it('(j) 대기 중 재조회가 같은 레포를 내려줘도 숨김 유지', async () => {
    const { user, calls } = setup({ [LIST]: () => ({ json: [API, WEB] }) });
    await screen.findByText('acme/api');
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    const gets = count(calls, 'GET');
    await user.click(screen.getByRole('button', { name: '지금 가져오기' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(count(calls, 'GET')).toBeGreaterThan(gets);
    expect(screen.getByText('acme/web')).toBeInTheDocument();
    expect(screen.queryByText('acme/api')).not.toBeInTheDocument();
  });

  it('(k) DELETE 실패 → 행 복귀 + role=alert 1개', async () => {
    const { user } = setup({ [LIST]: () => ({ json: [API] }), 'DELETE /api/v1/integrations/watched-repos/1/': () => ({ status: 500 }) });
    await screen.findByText('acme/api');
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_100); });
    expect(screen.getByText('acme/api')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('(l) 마지막 레포 해제 → 빈 상태', async () => {
    const { user } = setup({ [LIST]: () => ({ json: [API] }), 'DELETE /api/v1/integrations/watched-repos/1/': () => ({ status: 204 }) });
    await screen.findByText('acme/api');
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    expect(screen.getByText('아직 리뷰 요청을 가져올 레포가 없어요')).toBeInTheDocument();
  });

  it('(m) 행 다시 시도 → syncNow(id) 1회(연타 포함), 끝나면 재조회', async () => {
    let done!: () => void;
    sync.syncNow = vi.fn(() => new Promise<void>((r) => { done = r; }));
    const { user, calls } = setup({ [LIST]: () => ({ json: [API, WEB] }) });
    await screen.findByText('acme/web');
    const btn = within(row('acme/web')).getByRole('button', { name: '다시 시도' });
    await user.click(btn);
    await user.click(btn);
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
    expect(sync.syncNow).toHaveBeenCalledWith(2);
    const gets = count(calls, 'GET');
    await act(async () => { done(); await vi.advanceTimersByTimeAsync(0); });
    expect(count(calls, 'GET')).toBe(gets + 1);
  });

  it('지금 가져오기: 가져오는 중이면 syncNow를 부르지 않는다', async () => {
    sync.syncing = true;
    const { user } = setup({ [LIST]: () => ({ json: [API] }) });
    await screen.findByText('acme/api');
    const btn = screen.getByRole('button', { name: /가져오는 중|지금 가져오기/ });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    await user.click(btn);
    expect(sync.syncNow).not.toHaveBeenCalled();
  });

  it('로드 실패 → 서버 연결 문구 + 다시 시도, 빈 상태 문구는 함께 없음', async () => {
    let fail = true;
    const { user } = setup({ [LIST]: () => (fail ? { status: 500 } : { json: [API] }) });
    expect(await screen.findByText('서버에 연결할 수 없어요')).toBeInTheDocument();
    expect(screen.getByText('이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText('아직 리뷰 요청을 가져올 레포가 없어요')).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('acme/api')).toBeInTheDocument();
    expect(screen.queryByText('서버에 연결할 수 없어요')).not.toBeInTheDocument();
  });

  it('(n) "감시"·"동기화" 없음, WatchedReposPanel import 없음', async () => {
    setup({ [LIST]: () => ({ json: [API, WEB] }) });
    await screen.findByText('acme/api');
    expect(document.body.textContent).not.toMatch(/감시|동기화/);
    for (const f of ['ConnectedReposSection', 'ConnectRepoForm', 'ConnectedRepoRow']) {
      expect(readFileSync(`frontend/src/components/settings/${f}.tsx`, 'utf8')).not.toMatch(/WatchedReposPanel|dark:|slate-/);
    }
  });
});
