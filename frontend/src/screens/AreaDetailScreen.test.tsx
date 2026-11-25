import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { renderWithRouter } from '../test/render';
import { makeArea, makeAreaDetail, makeAreasResponse, makeWaitingPr } from '../test/fixtures/areas';
import type { AreaDetail } from '../types/areas';

vi.mock('../hooks/useAreaDetail', () => ({ useAreaDetail: vi.fn() }));
vi.mock('../hooks/useAreas', () => ({ useAreas: vi.fn() }));
vi.mock('../hooks/useNow', () => ({ useNow: () => new Date('2026-11-25T03:00:00Z') }));
import { useAreaDetail } from '../hooks/useAreaDetail';
import { useAreas } from '../hooks/useAreas';
import AreaDetailScreen from './AreaDetailScreen';

const detailMock = vi.mocked(useAreaDetail);
const areasMock = vi.mocked(useAreas);
const retry = vi.fn();

type DetailState = ReturnType<typeof useAreaDetail>;
const setDetail = (over: Partial<DetailState> = {}) =>
  detailMock.mockReturnValue({ status: 'ready', data: DETAIL, error: null, retry, ...over });
const ready = (data: AreaDetail) => setDetail({ data });

const DETAIL = makeAreaDetail({ displayName: '결제 흐름', alias: { id: 1, displayName: '결제 흐름', updatedAt: '2026-11-01T00:00:00Z' } });
const LIST = makeAreasResponse({
  areas: [makeArea(), makeArea({ id: 'frontend-checkout', displayName: '결제 화면', pathPrefix: 'frontend/checkout' })],
});

const show = (route = '/areas/backend-payments?repo=1') =>
  renderWithRouter(
    <Routes>
      <Route path="/areas/:areaId" element={<AreaDetailScreen />} />
    </Routes>,
    { route },
  );
const tree = (route = '/areas/backend-payments?repo=1') => (
  <MemoryRouter initialEntries={[route]}>
    <Routes>
      <Route path="/areas/:areaId" element={<AreaDetailScreen />} />
    </Routes>
  </MemoryRouter>
);
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  setDetail();
  areasMock.mockReturnValue({
    status: 'ready', data: LIST, aliases: [], aliasesFailed: false, error: null, stale: false,
    refresh: vi.fn(), canRefresh: true, pending: false, failSeq: 0,
  });
});

describe('AreaDetailScreen', () => {
  it('(i)(r) h1=별칭 이름 1개, 원래 경로, 주간 막대 값 텍스트', () => {
    show();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('결제 흐름');
    expect(screen.getByText(/원래 경로 backend\/payments · 파일 22개 · 활발해짐 · 마지막 변경 어제/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '주간 활동(커밋)' })).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '이름 바꾸기' }).getAttribute('href')).toBe('/settings');
    expect(detailMock).toHaveBeenLastCalledWith(1, 'backend-payments', 30);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('최근 커밋은 첫 줄·작성자·sha7, 함께 바뀐 영역은 커밋 수 순·이름 조회', () => {
    show();
    const commits = screen.getByRole('region', { name: '최근 커밋' });
    expect(within(commits).getByText('결제 재시도 횟수 조정')).toBeInTheDocument();
    expect(within(commits).queryByText(/본문/)).toBeNull();
    expect(within(commits).getByText('a1b2c3d')).toBeInTheDocument();
    const coupled = screen.getByRole('region', { name: '함께 바뀐 영역' });
    const items = within(coupled).getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toMatch(/backend-ledger.*커밋 7개/); // 목록에 없으면 id
    expect(items[1]).toMatch(/결제 화면.*커밋 2개/);
    expect(within(coupled).getByRole('link', { name: /결제 화면/ }).getAttribute('href')).toBe('/areas/frontend-checkout?repo=1');
    const paths = screen.getByRole('region', { name: '포함된 경로(일부)' });
    expect(within(paths).getByText('backend/payments/views.py')).toBeInTheDocument();
  });

  it('(j) 활동 0 → 문구 + 바닥선만, 완료 없음', () => {
    ready(makeAreaDetail({ commits: [0, 0, 0, 0, 0], trend: 'quiet' }));
    const { container } = show();
    expect(screen.getByText('최근 30일 동안 이 영역에 커밋이 없어요')).toBeInTheDocument();
    expect(container.querySelectorAll('svg rect')).toHaveLength(0);
    expect(container.querySelectorAll('svg line[data-floor]')).toHaveLength(1);
    expect(text()).not.toMatch(/완료/);
  });

  it('(k) 대기 PR 0건 문구', () => {
    ready(makeAreaDetail({ waitingPullRequests: [] }));
    show();
    expect(screen.getByRole('heading', { level: 2, name: '리뷰 대기 PR 0건' })).toBeInTheDocument();
    expect(screen.getByText('지금 리뷰 대기 PR이 없어요. 영역이 사라진 게 아니에요.')).toBeInTheDocument();
  });

  it('(l) 주 영역이 아닌 영역에도 걸친 PR과 안내, 한글 id 디코딩', () => {
    ready(makeAreaDetail({ id: '한글 이름', waitingPullRequests: [makeWaitingPr({ isPrimary: false })] }));
    show('/areas/%ED%95%9C%EA%B8%80%20%EC%9D%B4%EB%A6%84?repo=1');
    expect(detailMock).toHaveBeenLastCalledWith(1, '한글 이름', 30);
    expect(screen.getByRole('heading', { level: 2, name: '리뷰 대기 PR 1건' })).toBeInTheDocument();
    expect(screen.getByText('#58 결제 재시도 정리')).toBeInTheDocument();
    expect(screen.getByText('주 영역은 결제 흐름이에요(개수는 거기에만 세요)')).toBeInTheDocument();
  });

  it('(m) gone → 안내 h1 + 돌아가기 링크(레포·기간 유지), h1로 포커스', () => {
    setDetail({ status: 'gone', data: null, error: { status: 404, code: 'area_not_found', message: 'Area not found' } });
    show('/areas/%ED%95%9C%EA%B8%80%20%EC%9D%B4%EB%A6%84?repo=1&days=90');
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('이 영역은 더 이상 코드에서 보이지 않아요');
    expect(document.activeElement).toBe(h1);
    expect(screen.getByRole('link', { name: '영역 흐름으로 돌아가기' }).getAttribute('href')).toBe('/areas?repo=1&days=90');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(n) repo 쿼리 없음 → 안내 + 개요 링크, 요청 없음', () => {
    show('/areas/backend-payments');
    expect(text()).toMatch(/어느 레포의 영역인지 알 수 없어요/);
    expect(screen.getByRole('link', { name: '영역 흐름 개요로 가기' }).getAttribute('href')).toBe('/areas');
    expect(detailMock).toHaveBeenLastCalledWith(null, 'backend-payments', 30);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('repo_not_found → 연결 해제 안내', () => {
    setDetail({ status: 'error', data: null, error: { status: 404, code: 'repo_not_found', message: 'x' } });
    show('/areas/backend-payments?repo=9');
    expect(text()).toMatch(/이 레포는 더 이상 연결되어 있지 않아요/);
    expect(screen.getByRole('link', { name: '영역 흐름 개요로 가기' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(o) 뒤로 링크가 days=90 보존', () => {
    show('/areas/backend-payments?repo=1&days=90');
    expect(screen.getByRole('link', { name: /영역 흐름$/ }).getAttribute('href')).toBe('/areas?repo=1&days=90');
    expect(detailMock).toHaveBeenLastCalledWith(1, 'backend-payments', 90);
  });

  it('(p) 최근 변경한 사람: 이름만, 숫자·순위 없음', () => {
    show();
    const people = screen.getByRole('region', { name: '최근 변경한 사람' });
    expect(within(people).getByText('jun-ho')).toBeInTheDocument();
    expect(within(people).getByText('물어볼 사람을 찾는 용도예요. 순위나 평가가 아니에요.')).toBeInTheDocument();
    const names = within(people).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(names).toEqual(['jun-ho', 'minji-park']);
    expect(names.join('')).not.toMatch(/\d|순위/);
    expect(within(people).queryByRole('list')?.tagName).toBe('UL');
  });

  it('(q) quiet + 대기 → 리뷰 대기 중, 활동 없음', () => {
    ready(makeAreaDetail({ trend: 'quiet', commits: [1, 0, 0, 0, 0], reviewWaiting: { prCount: 1, oldestRequestedAt: '2026-11-22T03:00:00Z' } }));
    show();
    expect(screen.getByText('리뷰 대기 중, 활동 없음')).toBeInTheDocument();
    expect(text()).not.toMatch(/정체 후보|조용함|진행률/);
  });

  it('로딩: 틀 유지 + role=status, 목록 이름으로 h1', () => {
    setDetail({ status: 'loading', data: null });
    show('/areas/frontend-checkout?repo=1');
    expect(screen.getByRole('status')).toHaveTextContent('영역을 불러오는 중이에요');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('결제 화면');
    expect(screen.getByRole('link', { name: /영역 흐름$/ })).toBeInTheDocument();
  });

  it('일반 오류: role=alert 1개, 다시 시도 → retry, 진행 중엔 status만, 재실패 다시 알림', async () => {
    setDetail({ status: 'error', data: null, error: { status: 500, code: null, message: 'x' } });
    const { user, rerender } = show();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);
    setDetail({ status: 'loading', data: null });
    rerender(tree());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('다시 시도하는 중이에요');
    setDetail({ status: 'error', data: null, error: { status: 500, code: null, message: 'x' } });
    rerender(tree());
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('이름 조회 목록 실패는 상세 표시를 막지 않음', () => {
    areasMock.mockReturnValue({
      status: 'error', data: null, aliases: [], aliasesFailed: false, error: { status: 502, code: 'github_unavailable', message: 'x' },
      stale: false, refresh: vi.fn(), canRefresh: true, pending: false, failSeq: 1,
    });
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('결제 흐름');
    expect(screen.queryByRole('alert')).toBeNull();
    const coupled = screen.getByRole('region', { name: '함께 바뀐 영역' });
    expect(within(coupled).getByRole('link', { name: /frontend-checkout/ })).toBeInTheDocument();
  });
});
