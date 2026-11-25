import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '../../hooks/useToasts';
import { routeFetch, type RouteHandler } from '../../test/routeFetch';
import { removeStorage, STORAGE_KEYS } from '../../lib/storage';
import FirstRunGate from './FirstRunGate';

// status.syncing을 테스트 중에 바꿀 수 있는 모의 PrSyncContext
const sync = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    syncing: false,
    syncNow: undefined as unknown as ReturnType<typeof vi.fn>,
    listeners,
    set(v: boolean) { this.syncing = v; listeners.forEach((l) => l()); },
  };
});
vi.mock('../../hooks/PrSyncContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePrSyncContext: () => {
      const syncing = useSyncExternalStore(
        (cb) => { sync.listeners.add(cb); return () => { sync.listeners.delete(cb); }; },
        () => sync.syncing,
      );
      return { status: { syncing, lastSuccessAt: null, error: null, truncated: false }, syncNow: sync.syncNow, lastResultText: '' };
    },
  };
});

const repo = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id, url: `https://github.com/acme/${name}`, owner: 'acme', name, githubLogin: '', lastSyncedAt: '2026-11-25T00:00:00Z',
  lastAttemptAt: '2026-11-25T00:00:00Z', lastSuccessAt: '2026-11-25T00:00:00Z', lastError: null, truncated: false,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-25T00:00:00Z', ...over,
});
const API = repo(1, 'api');
const WEB = repo(2, 'web', { githubLogin: 'Minji' });
const LIST = 'GET /api/v1/integrations/watched-repos/';
const POST = 'POST /api/v1/integrations/watched-repos/';
const RQ = 'GET /api/v1/integrations/review-queue/';
const probe = (waiting: number, knownLogin = true) => ({
  json: { login: 'minji', knownLogin, repos: [], counts: { waiting, awaitingAuthor: 0, closed: 0 }, items: [] },
});

const setup = (routes: Record<string, RouteHandler>) => {
  const r = routeFetch(routes);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <MemoryRouter initialEntries={['/me']}>
      <ToastProvider>
        <FirstRunGate><h1>내 리뷰 요청 화면</h1></FirstRunGate>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...r, user };
};
const h1 = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });
const noBannedWords = () => expect(document.body.textContent).not.toMatch(/감시|동기화/);
const saveLogin = async (user: ReturnType<typeof userEvent.setup>, login = 'minji') => {
  await user.type(screen.getByLabelText('내 GitHub 로그인'), login);
  await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sync.syncing = false;
  sync.syncNow = vi.fn(async () => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  removeStorage(STORAGE_KEYS.myLogin); // 저장소 폴백까지 비운다
});

async function runFirstPerson() {
  let repos: unknown[] = [];
  const { user, calls } = setup({
    [LIST]: () => ({ json: repos }),
    [POST]: () => { repos = [API]; return { status: 201, json: API }; },
    [RQ]: () => probe(3),
  });
  await h1('누구의 리뷰 요청을 보여드릴까요?');
  await waitFor(() => expect(calls.some((c) => c.url.includes('watched-repos'))).toBe(true));
  expect(screen.queryByText(/팀이 이미 레포/)).not.toBeInTheDocument();
  expect(screen.getByText('나중에 설정에서 바꿀 수 있어요.')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: '팀에서 찾은 로그인' })).not.toBeInTheDocument();
  noBannedWords();
  await saveLogin(user);

  const repoH1 = await h1('리뷰 요청을 가져올 레포를 연결해 주세요');
  expect(document.activeElement).toBe(repoH1);
  noBannedWords();
  await user.type(screen.getByLabelText('레포 추가'), 'github.com/acme/api');
  await user.click(screen.getByRole('button', { name: '추가' }));

  expect(await screen.findByText('레포 1개에서 리뷰 대기 3건을 찾았어요')).toBeInTheDocument();
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  expect(screen.getByText('확인했어요')).toBeInTheDocument();
  noBannedWords();
  await user.click(screen.getByRole('button', { name: '내 리뷰 요청 보기' }));
  expect(await h1('내 리뷰 요청 화면')).toBeInTheDocument();
  expect(sync.syncNow).toHaveBeenCalled();
}

describe('FirstRunFlow', () => {
  it('(a)(k)(n) 첫 사람: 로그인 → 레포 추가 → 가져오기 → 결과 → children', runFirstPerson);

  it('(l) 저장소가 throw해도 (a)가 끝까지 진행', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    await runFirstPerson();
  });

  it('(b) 합류자: 콜아웃, 후보 칩, 레포 단계 없이 바로 결과', async () => {
    const { user, calls } = setup({ [LIST]: () => ({ json: [API, WEB] }), [RQ]: () => probe(2) });
    expect(await screen.findByText('팀이 이미 레포 2개를 연결해 두었어요')).toBeInTheDocument();
    expect(screen.getByText('로그인만 입력하면 바로 시작할 수 있어요. 레포를 따로 추가하지 않아도 돼요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minji' })).toBeInTheDocument();
    await saveLogin(user);
    expect(await screen.findByText('레포 2개에서 리뷰 대기 2건을 찾았어요')).toBeInTheDocument();
    expect(screen.queryByText('리뷰 요청을 가져올 레포를 연결해 주세요')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('(c) 레포 단계 409 → 성공으로 넘어감, 오류 없음', async () => {
    let repos: unknown[] = [];
    const { user } = setup({
      [LIST]: () => ({ json: repos }),
      [POST]: () => { repos = [API]; return { status: 409, json: { error: 'dup', code: 'already_connected', existing: API } }; },
      [RQ]: () => probe(1),
    });
    await h1('누구의 리뷰 요청을 보여드릴까요?');
    await saveLogin(user);
    await h1('리뷰 요청을 가져올 레포를 연결해 주세요');
    await user.type(screen.getByLabelText('레포 추가'), 'github.com/acme/api');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText('레포 1개에서 리뷰 대기 1건을 찾았어요')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('dup')).not.toBeInTheDocument();
  });

  it('(d) 레포 목록 500 → 콜아웃 없음, 저장 가능, 가져오기 단계에 E1 + 다시 시도', async () => {
    let fail = true;
    const { user } = setup({ [LIST]: () => (fail ? { status: 500 } : { json: [API] }), [RQ]: () => probe(1) });
    await h1('누구의 리뷰 요청을 보여드릴까요?');
    await saveLogin(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('서버에 연결할 수 없어요');
    expect(alert).toHaveTextContent('이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요. 지금은 리뷰 요청을 보여드릴 수 없어요.');
    expect(screen.queryByText(/팀이 이미 레포/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    fail = false;
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('레포 1개에서 리뷰 대기 1건을 찾았어요')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('(f) syncing 동안 결과로 넘어가지 않고, 10초 뒤 안내, 끝나면 결과', async () => {
    sync.syncing = true;
    const { user } = setup({ [LIST]: () => ({ json: [API] }), [RQ]: () => probe(1) });
    await screen.findByText('팀이 이미 레포 1개를 연결해 두었어요');
    await saveLogin(user);
    const sh1 = await h1('리뷰 요청을 가져오고 있어요');
    expect(document.activeElement).toBe(sh1);
    expect(screen.getByRole('status')).toHaveTextContent('레포 1개에서 리뷰 요청을 확인하는 중이에요');
    expect(screen.getByText('확인하는 중…')).toBeInTheDocument();
    expect(screen.queryByText(/계속 확인 중이에요/)).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
    expect(screen.getByRole('status')).toHaveTextContent('계속 확인 중이에요. 다른 화면으로 가도 돼요.');
    expect(screen.queryByText(/리뷰 대기 1건/)).not.toBeInTheDocument();
    act(() => sync.set(false));
    expect(await screen.findByText('레포 1개에서 리뷰 대기 1건을 찾았어요')).toBeInTheDocument();
  });

  it('(f2) 오래 걸리면 기다리지 않고 children으로 갈 수 있다', async () => {
    sync.syncing = true;
    const { user } = setup({ [LIST]: () => ({ json: [API] }), [RQ]: () => probe(1) });
    await screen.findByText('팀이 이미 레포 1개를 연결해 두었어요');
    await saveLogin(user);
    await h1('리뷰 요청을 가져오고 있어요');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
    await user.click(screen.getByRole('button', { name: '기다리지 않고 내 리뷰 요청 보기' }));
    expect(await h1('내 리뷰 요청 화면')).toBeInTheDocument();
  });

  it('(h)(k) 0건+knownLogin:false → E5, 로그인 확인 → 로그인 단계(입력 유지, 포커스)', async () => {
    const { user } = setup({ [LIST]: () => ({ json: [API] }), [RQ]: () => probe(0, false) });
    await screen.findByText('팀이 이미 레포 1개를 연결해 두었어요');
    await saveLogin(user);
    expect(await screen.findByText(/레포 1개에서 “minji”에게 온 리뷰 요청을 찾지 못했어요\. 정말 없는 걸 수도 있고, 로그인이 다른 이름일 수도 있어요\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '로그인 확인' }));
    const loginH1 = await h1('누구의 리뷰 요청을 보여드릴까요?');
    expect(document.activeElement).toBe(loginH1);
    expect(screen.getByLabelText('내 GitHub 로그인')).toHaveValue('minji');
  });

  it('(i) 프로브 실패 → 건수 줄 없음, 레포별 결과만', async () => {
    const { user } = setup({ [LIST]: () => ({ json: [API] }), [RQ]: () => ({ status: 500 }) });
    await screen.findByText('팀이 이미 레포 1개를 연결해 두었어요');
    await saveLogin(user);
    expect(await screen.findByText('확인했어요')).toBeInTheDocument();
    expect(screen.queryByText(/리뷰 대기|찾지 못했어요|리뷰 대기 PR이 없어요/)).not.toBeInTheDocument();
    expect(screen.getByText(/minji의 큐예요/)).toBeInTheDocument();
  });
});
