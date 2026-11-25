import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { renderWithRouter } from '../test/render';
import { makeArea, makeAreasResponse } from '../test/fixtures/areas';
import type { WatchedRepo } from '../types';

vi.mock('../hooks/useAreaRepos', () => ({ useAreaRepos: vi.fn() }));
vi.mock('../hooks/useAreas', () => ({ useAreas: vi.fn() }));
vi.mock('../hooks/useNow', () => ({ useNow: () => new Date('2026-11-25T03:00:00Z') }));
import { useAreaRepos } from '../hooks/useAreaRepos';
import { useAreas } from '../hooks/useAreas';
import AreasScreen from './AreasScreen';

const repo = (id: number, name: string): WatchedRepo => ({
  id, url: `https://github.com/acme/${name}`, owner: 'acme', name, githubLogin: null, lastSyncedAt: null, createdAt: '2026-11-01T00:00:00Z',
});
const reposMock = vi.mocked(useAreaRepos);
const areasMock = vi.mocked(useAreas);
const retryRepos = vi.fn();
const refresh = vi.fn();

const recent = makeArea({ id: 'b', displayName: '나 영역', lastChangeAt: '2026-11-24T08:00:00Z' });
const older = makeArea({ id: 'a', displayName: '가 영역', trend: 'steady', lastChangeAt: '2026-11-20T08:00:00Z' });
const stuck = makeArea({
  id: 'c', displayName: '다 영역', trend: 'quiet', commits: [1, 0, 0, 0, 0], lastChangeAt: '2026-10-27T08:00:00Z',
  reviewWaiting: { prCount: 3, oldestRequestedAt: '2026-11-21T00:00:00Z' },
});
const RESP = makeAreasResponse({
  areas: [older, stuck, recent],
  couplings: [{ a: 'a', b: 'b', count: 5 }],
});

type AreasState = ReturnType<typeof useAreas>;
const setAreas = (over: Partial<AreasState> = {}) =>
  areasMock.mockReturnValue({
    status: 'ready', data: RESP, aliases: [], aliasesFailed: false, error: null, stale: false, refresh, canRefresh: true, pending: false, failSeq: 0, ...over,
  });

function Loc() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}
const show = (route = '/areas?repo=1') =>
  renderWithRouter(
    <Routes>
      <Route path="/areas" element={<><AreasScreen /><Loc /></>} />
      <Route path="*" element={<Loc />} />
    </Routes>,
    { route },
  );
const loc = () => screen.getByTestId('loc').textContent;
const areaLinks = () => screen.getAllByRole('link').filter((l) => /^\/areas\/[abc]\?/.test(l.getAttribute('href') ?? ''));

beforeEach(() => {
  vi.clearAllMocks();
  reposMock.mockReturnValue({ status: 'ready', repos: [repo(1, 'api'), repo(2, 'web')], retry: retryRepos });
  setAreas();
});
afterEach(() => vi.restoreAllMocks());

describe('AreasScreen', () => {
  it('(i) 정상: 제목·콜아웃·범례·요약', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('영역 흐름');
    expect(screen.getByText(/활동이에요\. 진행률이 아니에요\./)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/1칸 = 커밋 2개/);
    expect(document.body.textContent).toMatch(/속이 빈 막대/);
    expect(document.body.textContent).toMatch(/점선/);
    expect(screen.getByText(/^최근 30일, 분석한 커밋 41개\. 영역 3개/)).toBeInTheDocument();
    expect(screen.getByText(/5분 전 분석/)).toBeInTheDocument();
    expect(areasMock).toHaveBeenLastCalledWith(1, 30);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('?repo= 없으면 첫 레포로 이동', () => {
    show('/areas');
    expect(loc()).toBe('/areas?repo=1');
  });

  it('(j) 분석 중: 상태 문구', () => {
    setAreas({ status: 'loading', data: null, canRefresh: false });
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('영역 흐름');
    expect(screen.getByRole('status')).toHaveTextContent('최근 30일 커밋을 분석하는 중이에요(처음엔 조금 걸려요)');
    expect(screen.getByText(/진행률이 아니에요/)).toBeInTheDocument();
  });

  it('(k) 연결 해제된 레포 id', () => {
    show('/areas?repo=999');
    expect(screen.getByText(/이 레포는 더 이상 연결되어 있지 않아요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /acme\/api/ })).toHaveAttribute('href', '/areas?repo=1');
    expect(areasMock).toHaveBeenLastCalledWith(null, 30);
  });

  it('(l) 레포 0개 → 설정 링크', () => {
    reposMock.mockReturnValue({ status: 'ready', repos: [], retry: retryRepos });
    show('/areas');
    expect(screen.getByText(/연결된 레포가 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '설정에서 레포 연결하기' })).toHaveAttribute('href', '/settings');
  });

  it('레포 목록 실패 → 알림 1개와 다시 시도', async () => {
    reposMock.mockReturnValue({ status: 'error', repos: [], retry: retryRepos });
    const { user } = show();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retryRepos).toHaveBeenCalledTimes(1);
  });

  it('(m) 502 → 읽을 수 없음 오류형 빈 상태, alert 1개, 다시 시도', async () => {
    setAreas({ status: 'error', data: null, error: { status: 502, code: 'github_unavailable', message: 'x' } });
    const { user } = show();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('이 레포를 읽을 수 없어요');
    expect(alerts[0]).toHaveTextContent('내 리뷰 요청은 그대로예요');
    await user.click(within(alerts[0]).getByRole('button', { name: '다시 시도' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('(m2) 다시 시도 진행 중 → status 문구, alert 없음', () => {
    setAreas({ status: 'error', data: null, error: { status: 502, code: 'github_unavailable', message: 'x' }, pending: true, canRefresh: false, failSeq: 1 });
    show();
    expect(screen.getByRole('status')).toHaveTextContent('다시 시도하는 중이에요');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(m3) 다시 실패하면 새 alert 노드로 다시 알리고 alert는 1개', () => {
    const err = { status: 502, code: 'github_unavailable', message: 'x' };
    setAreas({ status: 'error', data: null, error: err, failSeq: 1 });
    const { rerender } = show();
    const before = screen.getByRole('alert');
    setAreas({ status: 'error', data: null, error: err, failSeq: 2 });
    rerender(
      <MemoryRouter initialEntries={['/areas?repo=1']}>
        <Routes>
          <Route path="/areas" element={<><AreasScreen /><Loc /></>} />
          <Route path="*" element={<Loc />} />
        </Routes>
      </MemoryRouter>,
    );
    const after = screen.getAllByRole('alert');
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before);
  });

  it('(m4) 오류 상태 다시 시도가 막혔으면 이유와 연결', () => {
    setAreas({ status: 'error', data: null, error: { status: 500, code: null, message: 'x' }, canRefresh: false, failSeq: 1 });
    show();
    const btn = within(screen.getByRole('alert')).getByRole('button', { name: '다시 시도' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAccessibleDescription(/잠시 뒤에 다시 할 수 있어요/);
  });

  it('별칭 조회 실패 → 한 줄 안내(status)', () => {
    setAreas({ aliasesFailed: true });
    show();
    expect(screen.getByRole('status')).toHaveTextContent(/연결 끊김.*빠졌을 수 있어요/);
  });

  it('표로 보기 스크롤 영역은 탭 순서에 강제로 넣지 않는다', () => {
    const { container } = show();
    expect(container.querySelector('details [tabindex="0"]')).toBeNull();
  });

  it('그 외 오류 → 일반 문구', () => {
    setAreas({ status: 'error', data: null, error: { status: 500, code: null, message: 'x' } });
    show();
    expect(screen.getByRole('alert')).toHaveTextContent('영역을 분석하지 못했어요');
    expect(screen.queryByText('이 레포를 읽을 수 없어요')).toBeNull();
  });

  it('(n) 영역 0개 → 찾지 못함, 오류 아님', () => {
    setAreas({ data: makeAreasResponse({ areas: [] }) });
    show();
    expect(screen.getByText(/이 레포에서 나눌 영역을 찾지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/이 레포를 읽을 수 없어요/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(o) 활동 0 → 콜아웃과 90일로 늘리기', async () => {
    setAreas({ data: makeAreasResponse({ analyzedCommits: 0, areas: [makeArea({ commits: [0, 0, 0, 0, 0], lastChangeAt: null })] }) });
    const { user } = show('/areas?repo=1&sort=name');
    expect(screen.getByText(/최근 30일 동안 이 레포에 커밋이 없어요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '기간을 90일로 늘리기' }));
    expect(loc()).toBe('/areas?repo=1&days=90&sort=name');
  });

  it('(o) 90일 이상이면 늘리기 버튼 없음', () => {
    setAreas({ data: makeAreasResponse({ days: 90, analyzedCommits: 0, areas: [makeArea({ commits: [0, 0, 0, 0, 0] })] }) });
    show('/areas?repo=1&days=90');
    expect(screen.getByText(/최근 90일 동안 이 레포에 커밋이 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /늘리기/ })).toBeNull();
  });

  it('(p) 잘림 → 분석 한도 콜아웃', () => {
    setAreas({ data: makeAreasResponse({ truncated: true, analyzedCommits: 60 }) });
    show();
    expect(screen.getByText(/최근 60개만 분석했어요/)).toBeInTheDocument();
  });

  it('(q) 직전 결과 → 배너(alert 1개)와 행 유지', () => {
    setAreas({ stale: true, error: { status: 502, code: 'github_unavailable', message: 'x' } });
    show();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/직전 결과/);
    expect(areaLinks().length).toBeGreaterThan(0);
  });

  it('(r) 정렬 변경 → URL·행 순서, 정체 행 자동 상단 이동 없음', async () => {
    const { user } = show();
    const names = () => [...new Set(areaLinks().map((l) => l.textContent))];
    expect(names()).toEqual(['나 영역', '가 영역', '다 영역']);
    await user.selectOptions(screen.getByLabelText('정렬'), 'name');
    expect(loc()).toBe('/areas?repo=1&sort=name');
    expect(names()).toEqual(['가 영역', '나 영역', '다 영역']);
  });

  it('레포·기간 선택이 URL을 바꾼다', async () => {
    const { user } = show();
    await user.selectOptions(screen.getByLabelText('기간'), '60');
    expect(loc()).toBe('/areas?repo=1&days=60');
    await user.selectOptions(screen.getByLabelText('레포'), '2');
    expect(loc()).toBe('/areas?repo=2&days=60');
  });

  it('(s) 표로 보기: 영역×주 숫자', async () => {
    const { user } = show();
    await user.click(screen.getByText('표로 보기'));
    const table = screen.getByRole('table', { name: /주간 커밋 수/ });
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['영역', '10/26', '11/2', '11/9', '11/16', '11/23']);
    expect(within(table).getAllByText('16').length).toBeGreaterThan(0);
  });

  it('(t) 다시 분석하기: canRefresh=false면 aria-disabled, 호출 없음', async () => {
    setAreas({ canRefresh: false });
    const { user } = show();
    const btn = screen.getByRole('button', { name: '다시 분석하기' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    await user.click(btn);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('(t) 다시 분석하기: 가능하면 refresh', async () => {
    const { user } = show();
    await user.click(screen.getByRole('button', { name: '다시 분석하기' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('함께 바뀐 영역: 순위 목록', () => {
    show();
    const list = screen.getByRole('list', { name: '함께 바뀐 영역' });
    expect(within(list).getByText('커밋 5개')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: '가 영역' })).toHaveAttribute('href', '/areas/a?repo=1');
  });

  it('(u) 키보드: 선택기 → 이름 링크 DOM 순서, outline-none 없음', async () => {
    const { user, container } = show();
    const seen: Element[] = [];
    for (let i = 0; i < 12; i++) {
      await user.tab();
      seen.push(document.activeElement!);
    }
    const idx = (el: Element) => seen.indexOf(el);
    const selects = ['레포', '기간', '정렬'].map((n) => screen.getByLabelText(n));
    const links = areaLinks().slice(0, 3);
    const order = [...selects, screen.getByRole('button', { name: '다시 분석하기' }), ...links].map(idx);
    expect(order.every((n) => n >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(container.querySelector('.outline-none')).toBeNull();
  });

  it('(v) localStorage를 쓰지 않는다', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    show();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});
