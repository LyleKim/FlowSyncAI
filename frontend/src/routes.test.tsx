import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithRouter } from './test/render';
import { ROUTES, titleFor } from './routes';

vi.mock('./services/taskSync', () => ({
  fetchTasksFromServer: vi.fn().mockResolvedValue({ status: 'error' }),
  invalidateTasksCacheHeaders: vi.fn(),
  TASKS_POLL_INTERVAL_MS: 180000,
}));
vi.mock('./services/integrationsApi', () => ({
  listWatchedRepos: vi.fn().mockResolvedValue([]),
  syncPullRequests: vi.fn(),
  formatSyncResult: () => '',
}));

import App from './App';

const h1s = () => screen.getAllByRole('heading', { level: 1 });

async function renderApp(route: string) {
  const r = renderWithRouter(<App />, { route });
  await act(async () => {});
  return r;
}

afterEach(() => vi.restoreAllMocks());

describe('routes', () => {
  it('(a) / 는 /me 로 치환되고 h1 "내 리뷰 요청"', async () => {
    await renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: '내 리뷰 요청' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /내 리뷰 요청/ })).toHaveAttribute('aria-current', 'page');
  });

  it.each(['/tasks/없는id', '/zzz', '/areas/한글%20이름', '/tasks/new', '/settings', '/areas'])(
    '(b,f) %s 에서 예외 없이 h1 1개·main 1개',
    async (route) => {
      await renderApp(route);
      expect(h1s()).toHaveLength(1);
      expect(screen.getAllByRole('main')).toHaveLength(1);
    },
  );

  it('(b) 알 수 없는 경로는 안내 + 내 리뷰 요청 링크', async () => {
    await renderApp('/zzz');
    expect(screen.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없어요' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getAllByRole('link', { name: /내 리뷰 요청/ }).at(-1)!);
  });

  it('ROUTES 는 id 를 인코딩한다', () => {
    expect(ROUTES.task('a b')).toBe('/tasks/a%20b');
    expect(ROUTES.area('한글')).toBe('/areas/%ED%95%9C%EA%B8%80');
    expect(titleFor('/tasks/x')).toBe('전체 작업');
    expect(titleFor('/nope')).toBe('페이지를 찾을 수 없어요');
  });

  it('(c) 라우트 이동 후 document.title 변경, 포커스가 main', async () => {
    const { user } = await renderApp('/me');
    expect(document.title).toBe('내 리뷰 요청 · FlowSyncAI');
    await user.click(screen.getByRole('link', { name: /전체 작업/ }));
    expect(document.title).toBe('전체 작업 · FlowSyncAI');
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('(c) 첫 마운트에서는 포커스를 옮기지 않는다', async () => {
    await renderApp('/me');
    expect(document.activeElement).toBe(document.body);
  });
});
