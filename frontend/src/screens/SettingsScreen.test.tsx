import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { ToastProvider, UNDO_WINDOW_MS } from '../hooks/useToasts';
import { ToastHost } from '../components/common/ToastHost';
import { PrSyncProvider } from '../hooks/PrSyncContext';
import { renderWithRouter } from '../test/render';
import { routeFetch, type RouteHandler } from '../test/routeFetch';
import { STORAGE_KEYS, removeStorage } from '../lib/storage';
import SettingsScreen from './SettingsScreen';

const REPO = { id: 7, url: 'https://github.com/acme/api', owner: 'acme', name: 'api', githubLogin: null, lastSyncedAt: null, createdAt: '2026-11-01T00:00:00Z' };
const W = '/api/v1/integrations/watched-repos';
const ui = () => (
  <ToastProvider><PrSyncProvider onCreated={async () => {}}><SettingsScreen /></PrSyncProvider><ToastHost /></ToastProvider>
);
const setup = (routes: Record<string, RouteHandler> = {}, route = '/settings') => {
  const r = routeFetch({
    [`GET ${W}/`]: () => ({ json: [REPO] }),
    [`DELETE ${W}/7/`]: () => ({ status: 204 }),
    [`GET ${W}/7/area-aliases/`]: () => ({ json: [] }),
    [`GET ${W}/7/areas/`]: () => ({ json: { repoId: 7, areas: [] } }),
    'POST /api/v1/integrations/sync-prs/': () => ({ json: { created: 0, skipped: 0, errors: [] } }),
    ...routes,
  });
  return { ...r, ...renderWithRouter(ui(), { route }) };
};
const loginInput = () => screen.getByLabelText('내 GitHub 로그인');
const loginSave = () => screen.getByRole('button', { name: '로그인 저장' });

// matchMedia를 조종 가능한 가짜로 바꾼다(setup.ts의 기본 스텁은 change를 보내지 않음).
let osDark = false;
let mqListeners: Array<(e: { matches: boolean }) => void> = [];
const realMatchMedia = window.matchMedia;
const flipOs = (v: boolean) => act(() => { osDark = v; mqListeners.forEach((l) => l({ matches: v })); });
const html = () => document.documentElement.classList.contains('dark');

beforeEach(() => {
  localStorage.clear();
  removeStorage(STORAGE_KEYS.theme);
  removeStorage(STORAGE_KEYS.myLogin);
  document.documentElement.classList.remove('dark');
  osDark = false;
  mqListeners = [];
  window.matchMedia = ((q: string) => ({
    get matches() { return osDark; },
    media: q,
    addEventListener: (_: string, fn: never) => mqListeners.push(fn),
    removeEventListener: (_: string, fn: never) => { mqListeners = mqListeners.filter((l) => l !== fn); },
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SettingsScreen', () => {
  it('(a) h1 1개, 섹션 4개가 나 / 연결된 레포 / 영역 이름 / 화면 순서이고 각각 제목으로 이름 붙음', async () => {
    setup();
    await screen.findByText('acme/api');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['설정']);
    const h2 = screen.getAllByRole('heading', { level: 2 });
    expect(h2.map((h) => h.textContent)).toEqual(['나', '연결된 레포', '영역 이름', '화면']);
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))).toEqual(h2.map((h) => h.id));
    expect(screen.getByText('이 브라우저에만 저장돼요. 다른 기기에서는 다시 입력해야 해요.')).toBeInTheDocument();
  });

  it('(b) "@Octocat " 저장 → octocat 저장, "octocat의 큐", 상태 문구 1회, 가져오기 1회', async () => {
    const { user, calls } = setup();
    const syncs = () => calls.filter((c) => c.method === 'POST' && c.url.includes('sync-prs')).length;
    await screen.findByText('acme/api');
    await vi.waitFor(() => expect(syncs()).toBe(1)); // Provider의 마운트 가져오기
    await screen.findByRole('button', { name: '지금 가져오기' });
    expect(screen.getByText('로그인을 입력하면 내 리뷰 요청을 볼 수 있어요')).toBeInTheDocument();
    expect(screen.getByText('저장하면 바로 다시 가져와요.')).toBeInTheDocument();
    await user.type(loginInput(), '@Octocat ');
    await user.click(loginSave());
    expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBe('octocat');
    expect(screen.getByText('octocat의 큐')).toBeInTheDocument();
    expect(screen.getAllByRole('status').filter((s) => s.textContent === 'octocat의 큐로 바꿨어요')).toHaveLength(1);
    await vi.waitFor(() => expect(syncs()).toBe(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(syncs()).toBe(2);
    expect(screen.queryByText('로그인을 입력하면 내 리뷰 요청을 볼 수 있어요')).not.toBeInTheDocument();
  });

  it('(b2) 무효 입력은 저장 안 되고 aria-invalid + 오류 1회', async () => {
    const { user } = setup();
    const input = loginInput();
    await user.type(input, 'a b');
    await user.click(loginSave());
    expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBeNull();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/영문·숫자·하이픈만 쓸 수 있어요 \(최대 39자\)/);
    expect(screen.getAllByRole('alert').filter((a) => /영문·숫자/.test(a.textContent ?? ''))).toHaveLength(1);
  });

  it('(b3) 로그인·팀 저장 버튼은 서로 다른 이름', () => {
    setup();
    expect(loginSave()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '팀 저장' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
  });

  it('(c) 테마: 저장값 없으면 "시스템 설정 따르기", 어둡게·밝게·시스템 전환과 OS 변경 반응', async () => {
    const { user, unmount } = setup();
    const group = () => screen.getByRole('radiogroup', { name: '화면' });
    const radio = (n: string) => within(group()).getByRole('radio', { name: n });
    expect(within(group()).getAllByRole('radio')).toHaveLength(3);
    expect(radio('시스템 설정 따르기')).toBeChecked();
    expect(screen.getByText('지금은 밝게로 보이고 있어요')).toBeInTheDocument();

    await user.click(radio('어둡게'));
    expect(html()).toBe(true);
    expect(screen.getByText('지금은 어둡게로 보이고 있어요')).toBeInTheDocument();
    unmount();
    document.documentElement.classList.remove('dark');
    setup();
    expect(radio('어둡게')).toBeChecked();
    expect(html()).toBe(true);

    await user.click(radio('밝게'));
    expect(html()).toBe(false);

    flipOs(true); // 밝게 고정 중에는 OS 변경을 무시
    expect(html()).toBe(false);
    await user.click(radio('시스템 설정 따르기'));
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('system');
    expect(html()).toBe(true);
    flipOs(false);
    expect(html()).toBe(false);
    expect(screen.getByText('지금은 밝게로 보이고 있어요')).toBeInTheDocument();
  });

  it('(d) 저장소가 throw해도 로그인 저장이 세션 안에서 반영', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { user } = setup();
    await user.type(loginInput(), 'octocat');
    await user.click(loginSave());
    expect(screen.getByText('octocat의 큐')).toBeInTheDocument();
  });

  it('(e) SyncStatusLine 없음, "지금 가져오기" 버튼은 레포 섹션에 1개', async () => {
    setup();
    await screen.findByText('acme/api');
    for (const s of screen.queryAllByRole('status')) expect(s).not.toHaveTextContent(/가져옴$/);
    const btns = screen.getAllByRole('button', { name: '지금 가져오기' });
    expect(btns).toHaveLength(1);
    expect(screen.getByRole('region', { name: '연결된 레포' })).toContainElement(btns[0]);
  });

  it('(f) ?focus=repos → 레포 추가 입력에 포커스', async () => {
    setup({}, '/settings?focus=repos');
    await vi.waitFor(() => expect(screen.getByLabelText('레포 추가')).toHaveFocus());
  });

  it('(g) 영역 이름 조회가 실패해도 다른 섹션은 정상', async () => {
    setup({
      [`GET ${W}/7/area-aliases/`]: () => ({ status: 500 }),
      [`GET ${W}/7/areas/`]: () => ({ status: 502 }),
    });
    await screen.findByText('acme/api');
    expect(await screen.findByText('이미 붙인 이름을 읽지 못했어요. 잠시 후 다시 열어 주세요.')).toBeInTheDocument();
    expect(loginInput()).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: '화면' })).toBeInTheDocument();
  });

  it('(d2) 내 팀 입력이 마운트돼 있다', () => {
    setup();
    expect(screen.getByLabelText('내 팀 (선택)')).toBeInTheDocument();
  });

  it('(d3) 연결 해제 → 행 숨김 → 되돌리기 복귀, 10초 후 DELETE 1회', async () => {
    const { user, calls } = setup();
    await screen.findByText('acme/api');
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    expect(screen.queryByText('acme/api')).not.toBeInTheDocument();
    expect(screen.getByText('acme/api 연결을 해제했어요 · 팀 모두에게 적용돼요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(screen.getByText('acme/api')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS); });
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('(h) "감시"·"동기화" 텍스트 없음', async () => {
    setup();
    await screen.findByText('acme/api');
    expect(document.body.textContent).not.toMatch(/감시|동기화/);
  });
});
