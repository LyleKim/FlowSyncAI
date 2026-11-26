import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';

vi.mock('../services/reviewQueueApi', async () => {
  const actual = await vi.importActual<typeof import('../services/reviewQueueApi')>('../services/reviewQueueApi');
  return { ...actual, fetchReviewQueue: vi.fn() };
});
vi.mock('../services/areasApi', async () => {
  const actual = await vi.importActual<typeof import('../services/areasApi')>('../services/areasApi');
  return { ...actual, fetchAreas: vi.fn() };
});
const sync = vi.hoisted(() => ({
  syncNow: vi.fn(),
  status: { lastSuccessAt: null, syncing: false, error: null, truncated: false },
  lastResultText: '',
}));
vi.mock('../hooks/PrSyncContext', () => ({ usePrSyncContext: () => sync }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useToasts', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useToasts')>('../hooks/useToasts');
  return { ...actual, useToasts: () => ({ notify }) };
});

import { fetchReviewQueue, QueueFetchError } from '../services/reviewQueueApi';
import { fetchAreas } from '../services/areasApi';
import { TASKS_POLL_INTERVAL_MS } from '../services/taskSync';
import { ToastProvider } from '../hooks/useToasts';
import { ReviewQueueProvider } from '../hooks/ReviewQueueContext';
import AppShell from '../components/layout/AppShell';
import { renderWithRouter } from '../test/render';
import { makeQueue, makeQueueItem, makeRepo } from '../test/fixtures/reviewQueue';
import { makeArea, makeAreasResponse } from '../test/fixtures/areas';
import { setMyLogin } from '../lib/storage';
import type { ReviewQueueItem, ReviewQueueResponse } from '../types/reviewQueue';
import MyReviewsScreen from './MyReviewsScreen';

const fetchQ = vi.mocked(fetchReviewQueue);
const fetchA = vi.mocked(fetchAreas);
const NOW = new Date('2026-11-24T05:10:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const flush = () => act(async () => {});

const pr = (n: number, over: Partial<ReviewQueueItem> = {}) =>
  makeQueueItem({
    id: `acme/api#${n}:octocat`,
    number: n,
    title: `PR ${n}`,
    url: `https://github.com/acme/api/pull/${n}`,
    ...over,
  });
const reviewed = { state: 'COMMENTED' as const, submittedAt: ago(60) };
const normalItems = () => [
  pr(1, { requestedAt: '2026-11-22T00:00:00Z' }),
  pr(2, { requestedAt: '2026-11-20T00:00:00Z' }),
  pr(3, { group: 'awaiting_author', myReview: reviewed }),
  pr(4, { group: 'closed', prState: 'merged', closedReason: 'merged', mergedAt: ago(120) }),
];
const queue = (over: Partial<ReviewQueueResponse> = {}) =>
  makeQueue({ login: 'octocat', repos: [makeRepo({ lastSuccessAt: ago(2) })], items: normalItems(), ...over });

let current: ReviewQueueResponse;
const setLive = (q: ReviewQueueResponse) => {
  current = q;
};

const renderScreen = (shell = false) =>
  renderWithRouter(
    <ToastProvider>
      <ReviewQueueProvider>{shell ? <AppShell><MyReviewsScreen /></AppShell> : <MyReviewsScreen />}</ReviewQueueProvider>
    </ToastProvider>,
    { route: '/me' },
  );
const ready = async (shell = false) => {
  const r = renderScreen(shell);
  await flush();
  return r;
};
const section = (name: RegExp) => screen.getByRole('button', { name }).closest('section') as HTMLElement;
const waitingTitles = () =>
  within(section(/^리뷰 대기 \d+건/)).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
const reviewLink = (n: number) => screen.getByRole('link', { name: `acme/api #${n} GitHub에서 리뷰 (새 탭에서 열려요)` });
const poll = () => act(async () => { vi.advanceTimersByTime(TASKS_POLL_INTERVAL_MS); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  vi.clearAllMocks();
  localStorage.clear();
  setMyLogin('octocat');
  setLive(queue());
  fetchQ.mockImplementation(async () => current);
  fetchA.mockResolvedValue(
    makeAreasResponse({
      areas: [
        makeArea({ id: 'a1', displayName: '결제 흐름' }),
        makeArea({ id: 'a2', displayName: '로그인' }),
        makeArea({ id: 'a3', displayName: '알림' }),
      ],
    }),
  );
  sync.syncNow.mockResolvedValue(undefined);
  // 첫 실행 폼의 로그인 확인 요청은 실패시켜 바로 저장되게 한다
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MyReviewsScreen 큐', () => {
  it('(a) 로그인 없음 → 안내 폼만, 큐 요청 없음', async () => {
    localStorage.clear();
    await ready();
    expect(screen.getByLabelText('내 GitHub 로그인')).toBeInTheDocument();
    expect(screen.queryByText(/의 큐/)).not.toBeInTheDocument();
    expect(fetchQ).not.toHaveBeenCalled();
  });

  it('(b) 정상: h1 1개, 로그인의 큐, 요약, 그룹 3개(뒤 둘은 접힘)', async () => {
    await ready();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('octocat의 큐')).toBeInTheDocument();
    expect(screen.getByText(/^리뷰 대기 2건 · 가장 오래/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^리뷰 대기 2건/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^작성자 응답 대기 1건/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '정리됨 1건 · 7일 동안 보관' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });

  it('(c) 대기 행은 requestedAt 오름차순', async () => {
    await ready();
    expect(waitingTitles()).toEqual(['PR 2', 'PR 1']);
  });

  it('(d) 초안은 기본 숨김, 체크하면 행·요약 숫자 증가, 해제하면 복귀', async () => {
    setLive(queue({ items: [...normalItems(), pr(5, { isDraft: true, requestedAt: '2026-11-23T00:00:00Z' })] }));
    const { user } = await ready();
    expect(waitingTitles()).toEqual(['PR 2', 'PR 1']);
    await user.click(screen.getByRole('checkbox', { name: '초안 1건 보기' }));
    expect(waitingTitles()).toEqual(['PR 2', 'PR 1', 'PR 5']);
    expect(screen.getByText(/^리뷰 대기 3건 · /)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '초안 1건 보기' }));
    expect(waitingTitles()).toEqual(['PR 2', 'PR 1']);
    expect(screen.getByText(/^리뷰 대기 2건 · /)).toBeInTheDocument();
  });

  it('(e) 팀 요청 행', async () => {
    setLive(queue({ items: [pr(6, { requestKind: 'team', viaTeam: 'acme/web' })] }));
    await ready();
    expect(screen.getByText('팀 요청 · acme/web')).toBeInTheDocument();
  });

  it('(f) 신선도 표시는 하나뿐이고 성공 시각이 있는 레포 중 가장 오래된 시각 기준', async () => {
    setLive(
      queue({
        repos: [
          makeRepo({ repoId: 1, lastSuccessAt: ago(5) }),
          makeRepo({ repoId: 2, repo: 'acme/web', lastSuccessAt: ago(20) }),
          makeRepo({ repoId: 3, repo: 'acme/x', lastSuccessAt: null, lastError: { kind: 'upstream', message: '' } }),
        ],
      }),
    );
    await ready();
    expect(screen.getAllByText(/가져옴/)).toHaveLength(1);
    expect(screen.getByText(/가져옴/)).toHaveTextContent('20분 전 가져옴');
    expect(screen.getAllByRole('button', { name: '지금 가져오기' })).toHaveLength(1);
  });

  it('(g) 일부 실패 → alert 1개, 실패 레포 행만 "확인 안 됨"', async () => {
    setLive(
      queue({
        repos: [
          makeRepo({ repoId: 1, lastSuccessAt: ago(2) }),
          makeRepo({ repoId: 2, repo: 'acme/web', lastSuccessAt: ago(30), lastError: { kind: 'upstream', message: '' } }),
        ],
        items: [pr(1), pr(7, { id: 'acme/web#7:octocat', repoId: 2, repo: 'acme/web', title: 'PR 7' })],
      }),
    );
    await ready();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    const rows = within(section(/^리뷰 대기/)).getAllByRole('listitem').filter((li) => li.hasAttribute('data-row-id'));
    const web = rows.find((r) => r.dataset.rowId === 'acme/web#7:octocat')!;
    const api = rows.find((r) => r.dataset.rowId === 'acme/api#1:octocat')!;
    expect(within(web).getByText(/^확인 안 됨/)).toBeInTheDocument();
    expect(within(api).queryByText(/확인 안 됨/)).not.toBeInTheDocument();
  });

  it('(g2) 전체 실패(rate_limit) → alert 1개, 지금 가져오기 aria-disabled', async () => {
    const lim = { kind: 'rate_limit' as const, message: '', resetAt: new Date(NOW.getTime() + 20 * 60_000).toISOString() };
    setLive(
      queue({
        repos: [
          makeRepo({ repoId: 1, lastSuccessAt: ago(30), lastError: lim }),
          makeRepo({ repoId: 2, repo: 'acme/web', lastSuccessAt: ago(40), lastError: lim }),
        ],
      }),
    );
    await ready();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '지금 가져오기' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('(h) 대기 0 → 빈 안내 + 영역 요약, 작성자 응답 대기는 유지', async () => {
    setLive(queue({ items: [pr(3, { group: 'awaiting_author', myReview: reviewed })] }));
    await ready();
    await flush();
    expect(screen.getByText('지금 리뷰 대기 PR이 없어요')).toBeInTheDocument();
    expect(screen.getByText('acme/api 기준이에요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영역 흐름 보기' })).toHaveAttribute('href', '/areas');
    for (const n of ['결제 흐름', '로그인', '알림']) expect(screen.getByRole('link', { name: n })).toBeInTheDocument();
    expect(fetchA).toHaveBeenCalledWith(1, 30, expect.anything());
    expect(screen.getByRole('button', { name: /^작성자 응답 대기 1건/ })).toBeInTheDocument();
  });

  it('(h2) 전체 0 + knownLogin:false → 로그인 의심, 레포 0개 → 레포 연결', async () => {
    setLive(queue({ items: [], knownLogin: false }));
    const { unmount } = await ready();
    expect(screen.getByText(/로그인이 다른 이름일 수도/)).toBeInTheDocument();
    unmount();
    setLive(queue({ items: [], repos: [] }));
    await ready();
    expect(screen.getByRole('link', { name: '레포 연결' })).toHaveAttribute('href', '/settings');
  });

  it('(i) 첫 로드 실패 → 서버 연결 안내, 다시 시도는 reload', async () => {
    fetchQ.mockRejectedValueOnce(new QueueFetchError('server', 'x', 500));
    const { user } = await ready();
    expect(screen.getByText('서버에 연결할 수 없어요')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    await flush();
    expect(fetchQ).toHaveBeenCalledTimes(2);
    expect(sync.syncNow).not.toHaveBeenCalled();
    expect(waitingTitles()).toEqual(['PR 2', 'PR 1']);
  });

  it('(j) 갱신 실패 → 목록 유지, alert 1개, 지금 가져오기 다시 활성', async () => {
    const { user } = await ready();
    fetchQ.mockRejectedValueOnce(new QueueFetchError('network', 'x'));
    await user.click(screen.getByRole('button', { name: '지금 가져오기' }));
    await flush();
    expect(waitingTitles()).toEqual(['PR 2', 'PR 1']);
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(/^서버에 연결할 수 없어요 · 마지막으로 가져온 시각 \d\d:\d\d\. 아래는 그 시각 기준이에요\.$/);
    expect(screen.getByRole('button', { name: '지금 가져오기' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('(k) 포커스 중 행 이동은 보류, 반영하면 다음 행 링크로 포커스 + 안내 1회', async () => {
    const { user } = await ready();
    act(() => reviewLink(2).focus());
    setLive(queue({ items: [pr(1, { requestedAt: '2026-11-22T00:00:00Z' }), pr(2, { group: 'awaiting_author', myReview: reviewed }), pr(3, { group: 'awaiting_author', myReview: reviewed }), normalItems()[3]] }));
    await poll();
    expect(waitingTitles()).toEqual(['PR 2', 'PR 1']);
    const apply = screen.getByRole('button', { name: '업데이트 1건 · 반영하기' });
    act(() => apply.focus());
    await user.keyboard('{Enter}');
    expect(waitingTitles()).toEqual(['PR 1']);
    expect(document.activeElement).toBe(reviewLink(1));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('작성자 응답 대기로 1건 이동', 'info');
  });

  it('(k2) 포커스 행이 모두 사라지면 보류가 풀리고 이후 갱신은 바로 보임', async () => {
    setLive(queue({ items: [pr(1)] }));
    const { user } = await ready();
    act(() => reviewLink(1).focus());
    setLive(queue({ items: [] }));
    await poll();
    act(() => screen.getByRole('button', { name: '업데이트 1건 · 반영하기' }).focus());
    await user.keyboard('{Enter}');
    expect(document.activeElement).not.toBe(document.body);
    expect(notify).toHaveBeenCalledWith('목록에서 사라짐 1건', 'info');
    setLive(queue({ items: [pr(8, { title: 'PR 8' })] }));
    await poll();
    expect(screen.queryByRole('button', { name: /반영하기/ })).not.toBeInTheDocument();
    expect(waitingTitles()).toEqual(['PR 8']);
  });

  it('(k3) 변경 문구가 없으면 건수로 안내', async () => {
    const { user } = await ready();
    act(() => reviewLink(2).focus());
    setLive(queue({ items: [...normalItems(), pr(9, { group: 'awaiting_author', myReview: reviewed })] }));
    await poll();
    act(() => screen.getByRole('button', { name: '업데이트 1건 · 반영하기' }).focus());
    await user.keyboard('{Enter}');
    expect(notify).toHaveBeenCalledWith('업데이트 1건을 반영했어요', 'info');
  });

  it('(k4) 호버 중 반영으로 목록 컨테이너가 사라져도 보류가 풀린다', async () => {
    await ready();
    fireEvent.pointerEnter(section(/^리뷰 대기/).parentElement!, { pointerType: 'mouse' });
    setLive(queue({ items: [], knownLogin: false }));
    await poll();
    fireEvent.click(screen.getByRole('button', { name: /반영하기/ }));
    await flush();
    expect(screen.getByText(/로그인이 다른 이름일 수도/)).toBeInTheDocument();
    setLive(queue({ items: [pr(8, { title: 'PR 8' })] }));
    await poll();
    expect(screen.queryByRole('button', { name: /반영하기/ })).not.toBeInTheDocument();
    expect(waitingTitles()).toEqual(['PR 8']);
  });

  it('(b2) truncated 레포가 있으면 요약에 일부만 가져옴', async () => {
    setLive(queue({ repos: [makeRepo({ lastSuccessAt: ago(2), truncated: true })] }));
    await ready();
    expect(screen.getByText(/^리뷰 대기 2건 · .*\(일부만 가져옴\)$/)).toBeInTheDocument();
  });

  it('(d2) 대기가 숨긴 초안뿐이면 빈 안내 대신 요약과 초안 토글', async () => {
    setLive(queue({ items: [pr(5, { isDraft: true }), pr(3, { group: 'awaiting_author', myReview: reviewed })] }));
    const { user } = await ready();
    expect(screen.queryByText('지금 리뷰 대기 PR이 없어요')).not.toBeInTheDocument();
    expect(screen.getByText(/^리뷰 대기 0건/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '초안 1건 보기' }));
    expect(waitingTitles()).toEqual(['PR 5']);
  });

  it('(l) 지금 가져오기는 보류 없이 즉시 반영', async () => {
    await ready();
    fireEvent.pointerEnter(section(/^리뷰 대기/).parentElement!, { pointerType: 'mouse' });
    setLive(queue({ items: [pr(1, { requestedAt: '2026-11-22T00:00:00Z' })] }));
    fireEvent.click(screen.getByRole('button', { name: '지금 가져오기' }));
    await flush();
    await flush();
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /반영하기/ })).not.toBeInTheDocument();
    expect(waitingTitles()).toEqual(['PR 1']);
  });

  it('(m) 마운트에서는 서버 동기화를 다시 요청하지 않고, 탭 복귀는 refresh, 폴링은 reload', async () => {
    await ready();
    expect(fetchQ).toHaveBeenCalledTimes(1);
    expect(sync.syncNow).not.toHaveBeenCalled();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
    expect(fetchQ).toHaveBeenCalledTimes(2);
    await poll();
    expect(fetchQ).toHaveBeenCalledTimes(3);
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
  });

  it('(n) 키보드만으로 지금 가져오기 → 초안 체크박스 → 그룹 헤더 토글 → 행 링크', async () => {
    setLive(queue({ items: [...normalItems(), pr(5, { isDraft: true })] }));
    const { user } = await ready();
    await user.tab();
    expect(screen.getByRole('button', { name: '지금 가져오기' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: '초안 1건 보기' })).toHaveFocus();
    await user.tab();
    const head = screen.getByRole('button', { name: /^리뷰 대기 2건/ });
    expect(head).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(head).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(head).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    expect(reviewLink(2)).toHaveFocus();
  });

  it('(o) 로그인 a → b로 바꾸면 a의 큐가 보이지 않음', async () => {
    setMyLogin('a');
    fetchQ.mockImplementation(async (p) =>
      p.login === 'a' ? queue({ login: 'a', items: [pr(1, { title: 'a의 PR' })] }) : new Promise<ReviewQueueResponse>(() => {}),
    );
    await ready();
    expect(screen.getByText('a의 PR')).toBeInTheDocument();
    act(() => { setMyLogin('b'); });
    await flush();
    expect(screen.queryByText('a의 PR')).not.toBeInTheDocument();
    expect(screen.getByText('b의 큐')).toBeInTheDocument();
  });

  it('(p) 사이드바 배지 = 숨긴 초안 제외 대기 수, 초안 토글과 무관, 0이면 없음', async () => {
    setLive(queue({ items: [...normalItems(), pr(10, { title: 'PR 10' }), pr(5, { isDraft: true })] }));
    const { user, unmount } = await ready(true);
    const nav = () => within(screen.getByRole('navigation', { name: '주 메뉴' }));
    expect(nav().getByLabelText('리뷰 대기 3건')).toHaveTextContent('3');
    expect(screen.getByText(/^리뷰 대기 3건 · /)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '초안 1건 보기' }));
    expect(nav().getByLabelText('리뷰 대기 3건')).toHaveTextContent('3');
    expect(screen.getByText(/^리뷰 대기 4건 · /)).toBeInTheDocument();
    unmount();
    setLive(queue({ items: [pr(3, { group: 'awaiting_author', myReview: reviewed })] }));
    await ready(true);
    expect(nav().queryByLabelText(/^리뷰 대기 \d+건$/)).not.toBeInTheDocument();
  });

  it('(q) 금지 용어 없음, h1/main 중복 없음', async () => {
    await ready(true);
    const main = screen.getByRole('main');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(main.textContent).not.toMatch(/동기화|감시/);
  });
});
