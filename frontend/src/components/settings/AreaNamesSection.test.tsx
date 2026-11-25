import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../hooks/useToasts';
import { ToastHost } from '../common/ToastHost';
import { routeFetch, type RouteHandler } from '../../test/routeFetch';
import { AreasApiError, fetchAreaAliases, fetchAreas } from '../../services/areasApi';
import type { AreaAlias, AreasResponse } from '../../types/areas';
import AreaNamesSection from './AreaNamesSection';

vi.mock('../../services/areasApi', async (orig) => ({
  ...(await orig<typeof import('../../services/areasApi')>()),
  fetchAreas: vi.fn(),
  fetchAreaAliases: vi.fn(),
}));

const REPOS = 'GET /api/v1/integrations/watched-repos/';
const A = '/api/v1/integrations/watched-repos/1/area-aliases/';
const repo = (id: number, name: string) => ({
  id, url: `https://github.com/acme/${name}`, owner: 'acme', name, githubLogin: '', lastSyncedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
});
const alias = (over: Partial<AreaAlias> = {}): AreaAlias => ({
  id: 7, repoId: 1, pathPrefix: 'backend/payments', displayName: '결제', status: 'connected',
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', ...over,
});
const areasOf = (...paths: string[]) =>
  ({ repoId: 1, areas: paths.map((p) => ({ id: p, name: p, pathPrefix: p })) }) as unknown as AreasResponse;

const setup = (routes: Record<string, RouteHandler> = {}, repos = [repo(1, 'api')]) => {
  const r = routeFetch({ [REPOS]: () => ({ json: repos }), ...routes });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ToastProvider><AreaNamesSection /><ToastHost /></ToastProvider>);
  return { ...r, user };
};
const writes = (calls: { method: string; url: string }[], method: string) =>
  calls.filter((c) => c.method === method && c.url.includes('area-aliases')).length;
const input = (path: string) => screen.findByRole('textbox', { name: `${path} 표시 이름` });
const rowOf = (el: HTMLElement) => el.closest('tr') as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(fetchAreas).mockResolvedValue(areasOf('backend/payments', 'frontend'));
  vi.mocked(fetchAreaAliases).mockResolvedValue([alias()]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('AreaNamesSection', () => {
  it('(a) 영역 2개 + 별칭 1개 → 행 2개, 별칭 행에 표시 이름과 "연결됨"', async () => {
    setup();
    expect(screen.getByRole('heading', { name: '영역 이름' })).toBeInTheDocument();
    expect(screen.getByText('폴더 이름 대신 팀이 부르는 이름을 붙여요. 팀 전체에 공유돼요.')).toBeInTheDocument();
    const pay = await input('backend/payments');
    await screen.findByRole('textbox', { name: 'frontend 표시 이름' });
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(pay).toHaveValue('결제');
    expect(within(rowOf(pay)).getByText('연결됨')).toBeInTheDocument();
    expect(fetchAreas).toHaveBeenCalledWith(1, 30, expect.anything());
    expect(screen.getByText('이름을 비우면 원래 경로 이름으로 돌아가요. 합치기는 아직 지원하지 않아요.')).toBeInTheDocument();
  });

  it('(b) 별칭 경로가 영역에 없음 → "연결 끊김" 텍스트와 안내 문구', async () => {
    vi.mocked(fetchAreaAliases).mockResolvedValue([alias({ pathPrefix: 'old/billing', status: 'disconnected' })]);
    setup();
    const old = await input('old/billing');
    await waitFor(() => expect(within(rowOf(old)).getByText('연결 끊김')).toBeInTheDocument());
    expect(within(rowOf(old)).getByText('팀이 붙인 이름 · 가리키던 경로 old/billing가 코드에서 보이지 않아요')).toBeInTheDocument();
  });

  it('(c) 새 이름 입력 → POST(pathPrefix, displayName), "저장했어요"', async () => {
    const { calls, user } = setup({ [`POST ${A}`]: (req) => ({ status: 201, json: alias({ id: 8, pathPrefix: 'frontend', displayName: (req.body as { displayName: string }).displayName }) }) });
    const fe = await input('frontend');
    await user.type(fe, '화면');
    await user.click(within(rowOf(fe)).getByRole('button', { name: /이름 저장$/ }));
    expect(await within(rowOf(fe)).findByRole('status')).toHaveTextContent('저장했어요');
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ pathPrefix: 'frontend', displayName: '화면' });
  });

  it('(d) 빈 문자열·81자 → 저장 aria-disabled, 요청 0회', async () => {
    const { calls, user } = setup();
    const pay = await input('backend/payments');
    const save = within(rowOf(pay)).getByRole('button', { name: /이름 저장$/ });
    expect(save).toHaveAttribute('aria-disabled', 'true'); // 바뀌지 않음
    await user.clear(pay);
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(within(rowOf(pay)).getByText('이름은 1~80자로 써 주세요')).toBeInTheDocument();
    expect(save).toHaveAccessibleDescription('이름은 1~80자로 써 주세요');
    await user.click(save);
    await user.type(pay, 'x'.repeat(81));
    expect(save).toHaveAttribute('aria-disabled', 'true');
    await user.click(save);
    expect(writes(calls, 'POST') + writes(calls, 'PATCH')).toBe(0);
  });

  it('(e) PATCH 409 → 입력 유지·충돌 문구, 내 이름으로 저장 → 최신 updatedAt으로 PATCH 1회, 그대로 두기 → 서버 값', async () => {
    const current = alias({ displayName: '정산', updatedAt: '2026-11-03T00:00:00Z' });
    let n = 0;
    const { calls, user } = setup({
      [`PATCH ${A}7/`]: (req) => (n++ === 0
        ? { status: 409, json: { error: 'x', code: 'conflict', current } }
        : { json: alias({ displayName: (req.body as { displayName: string }).displayName, updatedAt: '2026-11-04T00:00:00Z' }) }),
    });
    const pay = await input('backend/payments');
    await user.clear(pay);
    await user.type(pay, '결제 흐름');
    await user.click(within(rowOf(pay)).getByRole('button', { name: /이름 저장$/ }));
    expect(await screen.findByText('다른 사람이 방금 이름을 바꿨어요')).toBeInTheDocument();
    expect(within(rowOf(pay)).getByRole('alert')).toHaveTextContent('다른 사람이 방금 이름을 바꿨어요');
    expect(screen.getByText('지금 이름은 “정산”예요. 내가 쓴 “결제 흐름”은 그대로 남겨 두었어요.')).toBeInTheDocument();
    expect(pay).toHaveValue('결제 흐름');
    expect(calls.filter((c) => c.method === 'PATCH')[0].body).toEqual({ displayName: '결제 흐름', expectedUpdatedAt: '2026-11-02T00:00:00Z' });

    await user.click(screen.getByRole('button', { name: '내 이름으로 저장' }));
    expect(await within(rowOf(pay)).findByRole('status')).toHaveTextContent('저장했어요');
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(2);
    expect(patches[1].body).toEqual({ displayName: '결제 흐름', expectedUpdatedAt: '2026-11-03T00:00:00Z' });
    expect(screen.queryByText('다른 사람이 방금 이름을 바꿨어요')).not.toBeInTheDocument();
  });

  it('(e2) 충돌 후 그대로 두기 → 입력이 서버 값, 요청 추가 없음', async () => {
    const current = alias({ displayName: '정산', updatedAt: '2026-11-03T00:00:00Z' });
    const { calls, user } = setup({ [`PATCH ${A}7/`]: () => ({ status: 409, json: { error: 'x', code: 'conflict', current } }) });
    const pay = await input('backend/payments');
    await user.clear(pay);
    await user.type(pay, '결제 흐름');
    await user.click(within(rowOf(pay)).getByRole('button', { name: /이름 저장$/ }));
    await user.click(await screen.findByRole('button', { name: '그대로 두기' }));
    expect(pay).toHaveValue('정산');
    expect(screen.queryByText('다른 사람이 방금 이름을 바꿨어요')).not.toBeInTheDocument();
    expect(writes(calls, 'PATCH')).toBe(1);
  });

  it('(f) POST 409 alias_exists도 같은 충돌 UI, 내 이름으로 저장은 existing에 PATCH', async () => {
    const existing = alias({ id: 9, pathPrefix: 'frontend', displayName: '화면단', updatedAt: '2026-11-05T00:00:00Z' });
    const { calls, user } = setup({
      [`POST ${A}`]: () => ({ status: 409, json: { error: 'x', code: 'alias_exists', existing } }),
      [`PATCH ${A}9/`]: () => ({ json: { ...existing, displayName: '화면' } }),
    });
    const fe = await input('frontend');
    await user.type(fe, '화면');
    await user.click(within(rowOf(fe)).getByRole('button', { name: /이름 저장$/ }));
    expect(await screen.findByText('지금 이름은 “화면단”예요. 내가 쓴 “화면”은 그대로 남겨 두었어요.')).toBeInTheDocument();
    expect(fe).toHaveValue('화면');
    await user.click(screen.getByRole('button', { name: '내 이름으로 저장' }));
    await within(rowOf(fe)).findByRole('status');
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ displayName: '화면', expectedUpdatedAt: '2026-11-05T00:00:00Z' });
  });

  it('(g) 이름 지우기 → 10초 뒤 DELETE 1회 / 되돌리기 → 0회, 끊긴 행은 창 동안 숨김', async () => {
    vi.mocked(fetchAreaAliases).mockResolvedValue([alias(), alias({ id: 8, pathPrefix: 'old/billing', displayName: '청구', status: 'disconnected' })]);
    const { calls, user } = setup({ [`DELETE ${A}7/`]: () => ({ status: 204 }), [`DELETE ${A}8/`]: () => ({ status: 204 }) });
    const old = await input('old/billing');
    await user.click(within(rowOf(old)).getByRole('button', { name: /이름 지우기$/ }));
    expect(screen.getByText('‘청구’ 이름을 지웠어요 · 팀 모두에게 적용돼요')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'old/billing 표시 이름' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(await input('old/billing')).toHaveValue('청구');

    const pay = await input('backend/payments');
    await user.click(within(rowOf(pay)).getByRole('button', { name: /이름 지우기$/ }));
    expect(pay).toHaveValue('');
    await act(async () => { vi.advanceTimersByTime(10_000); });
    await waitFor(() => expect(writes(calls, 'DELETE')).toBe(1));
    expect(calls.find((c) => c.method === 'DELETE')!.url).toContain('/area-aliases/7/');
    expect(await input('backend/payments')).toHaveValue('');
    expect(within(rowOf(pay)).queryByRole('button', { name: /이름 지우기$/ })).not.toBeInTheDocument();
  });

  it('(g2) DELETE 실패 → 알림 1번, 이름 복귀', async () => {
    const { user } = setup({ [`DELETE ${A}7/`]: () => ({ status: 500 }) });
    const pay = await input('backend/payments');
    await user.click(within(rowOf(pay)).getByRole('button', { name: /이름 지우기$/ }));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(await screen.findAllByText(/‘결제’ 이름을 지우지 못해/)).toHaveLength(1);
    expect(await input('backend/payments')).toHaveValue('결제');
  });

  it('(h) fetchAreas 502 → 저하 안내, 별칭 행은 편집·삭제 가능', async () => {
    vi.mocked(fetchAreas).mockRejectedValue(new AreasApiError('bad gateway', 502, 'upstream'));
    const { calls, user } = setup({ [`PATCH ${A}7/`]: () => ({ json: alias({ displayName: '결제 흐름' }) }) });
    expect(await screen.findByText('영역 목록을 읽지 못했어요. 이미 붙인 이름만 보여드려요.')).toBeInTheDocument();
    const pay = await input('backend/payments');
    expect(within(rowOf(pay)).getByText('확인하지 못함')).toBeInTheDocument();
    expect(screen.queryByText('영역을 불러오는 중…')).not.toBeInTheDocument();
    await user.type(pay, ' 흐름');
    await user.click(within(rowOf(pay)).getByRole('button', { name: /이름 저장$/ }));
    await within(rowOf(pay)).findByRole('status');
    expect(writes(calls, 'PATCH')).toBe(1);
    expect(within(rowOf(pay)).getByRole('button', { name: /이름 지우기$/ })).toBeInTheDocument();
  });

  it('(i) 레포 2개 → <select> 변경이 해당 레포 별칭을 다시 조회하고 행이 바뀜', async () => {
    vi.mocked(fetchAreaAliases).mockImplementation(async (rid) => (rid === 2 ? [alias({ id: 20, repoId: 2, pathPrefix: 'web/ui', displayName: '웹' })] : [alias()]));
    vi.mocked(fetchAreas).mockImplementation(async (rid) => (rid === 2 ? areasOf('web/ui') : areasOf('backend/payments', 'frontend')));
    const { user } = setup({}, [repo(1, 'api'), repo(2, 'web')]);
    const sel = await screen.findByRole('combobox', { name: '레포' });
    await input('backend/payments');
    await user.selectOptions(sel, '2');
    expect(await input('web/ui')).toHaveValue('웹');
    expect(fetchAreaAliases).toHaveBeenCalledWith(2, expect.anything());
    expect(fetchAreas).toHaveBeenCalledWith(2, 30, expect.anything());
    expect(screen.queryByRole('textbox', { name: 'backend/payments 표시 이름' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('(i3) 저장 중에 레포를 바꾸면 응답이 새 레포 목록에 섞이지 않음', async () => {
    vi.mocked(fetchAreaAliases).mockImplementation(async (rid) => (rid === 2 ? [] : [alias()]));
    vi.mocked(fetchAreas).mockImplementation(async (rid) => (rid === 2 ? areasOf('web/ui') : areasOf('backend/payments', 'frontend')));
    const { user } = setup({ [`POST ${A}`]: () => ({ status: 201, json: alias({ id: 8, pathPrefix: 'frontend', displayName: '화면' }) }) }, [repo(1, 'api'), repo(2, 'web')]);
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    const orig = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (i, init) => { if (init?.method === 'POST') await gate; return orig(i, init); });
    const fe = await input('frontend');
    await user.type(fe, '화면');
    await user.click(within(rowOf(fe)).getByRole('button', { name: /이름 저장$/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: '레포' }), '2');
    await input('web/ui');
    await act(async () => { open(); await gate; });
    await act(async () => {});
    expect(screen.queryByRole('textbox', { name: 'frontend 표시 이름' })).not.toBeInTheDocument();
    expect(screen.queryByText('저장했어요')).not.toBeInTheDocument();
  });

  it('(i2) 레포 0개 → 안내 문구, 영역 조회 없음', async () => {
    setup({}, []);
    expect(await screen.findByText('연결된 레포가 있으면 영역 이름을 붙일 수 있어요')).toBeInTheDocument();
    expect(fetchAreas).not.toHaveBeenCalled();
  });

  it('(j) 네트워크 실패 → 행 인라인 오류, 입력 유지', async () => {
    const { user } = setup();
    vi.mocked(fetch).mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    const fe = await input('frontend');
    await user.type(fe, '화면');
    await user.click(within(rowOf(fe)).getByRole('button', { name: /이름 저장$/ }));
    const alert = await within(rowOf(fe)).findByRole('alert');
    expect(alert).toHaveTextContent('저장하지 못했어요');
    expect(alert).toHaveTextContent('입력한 내용은 그대로 두었어요. 잠시 후 다시 시도해 주세요.');
    expect(fe).toHaveValue('화면');
  });

  it('(k) 모든 입력에 접근 가능한 이름', async () => {
    setup({}, [repo(1, 'api'), repo(2, 'web')]);
    await input('frontend');
    for (const tb of screen.getAllByRole('textbox')) expect(tb).toHaveAccessibleName();
    expect(screen.getByRole('button', { name: 'frontend 이름 저장' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'backend/payments 이름 저장' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'backend/payments 이름 지우기' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAccessibleName('레포');
  });

  it('영역을 불러오는 동안 안내', async () => {
    vi.mocked(fetchAreas).mockReturnValue(new Promise(() => {}));
    setup();
    expect(await screen.findByText('영역을 불러오는 중…')).toBeInTheDocument();
    expect(await input('backend/payments')).toHaveValue('결제');
  });
  it('(l) PATCH 404(다른 사람이 지움) → 별칭 제거·안내, 입력 유지, 다시 저장하면 POST', async () => {
    const { calls, user } = setup({
      [`PATCH ${A}7/`]: () => ({ status: 404, json: { error: 'Not found' } }),
      [`POST ${A}`]: () => ({ status: 201, json: alias({ id: 9, displayName: '결제 흐름' }) }),
    });
    const pay = await input('backend/payments');
    await user.type(pay, ' 흐름');
    await user.click(within(rowOf(pay)).getByRole('button', { name: /이름 저장$/ }));
    const alert = await within(rowOf(pay)).findByRole('alert');
    expect(alert).toHaveTextContent('다른 사람이 이 이름을 지웠어요');
    expect(alert).toHaveTextContent('저장하면 새 이름으로 다시 붙여요.');
    expect(alert).not.toHaveTextContent('잠시 후 다시 시도해 주세요');
    expect(pay).toHaveValue('결제 흐름');
    expect(within(rowOf(pay)).queryByRole('button', { name: /이름 지우기$/ })).not.toBeInTheDocument();
    await user.click(within(rowOf(pay)).getByRole('button', { name: /이름 저장$/ }));
    await within(rowOf(pay)).findByText('저장했어요');
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ pathPrefix: 'backend/payments', displayName: '결제 흐름' });
  });

  it('(m) 레포 목록 조회 실패 → 실패 안내(빈 상태 아님)와 다시 시도', async () => {
    let fail = true;
    const { user } = setup({ [REPOS]: () => (fail ? { status: 500 } : { json: [repo(1, 'api')] }) });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('레포 목록을 읽지 못했어요');
    expect(screen.queryByText('연결된 레포가 있으면 영역 이름을 붙일 수 있어요')).not.toBeInTheDocument();
    fail = false;
    await user.click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(await input('backend/payments')).toHaveValue('결제');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('(o) 연결된 행의 지우기 대기 중엔 편집·저장 막힘(요청 0회)', async () => {
    const { calls, user } = setup();
    const pay = await input('backend/payments');
    await user.click(within(rowOf(pay)).getByRole('button', { name: /이름 지우기$/ }));
    expect(pay).toHaveAttribute('readonly');
    const save = within(rowOf(pay)).getByRole('button', { name: /이름 저장$/ });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription(/이름을 지우는 중이에요/);
    await user.type(pay, '새 이름');
    await user.click(save);
    expect(writes(calls, 'POST') + writes(calls, 'PATCH')).toBe(0);
  });
});
