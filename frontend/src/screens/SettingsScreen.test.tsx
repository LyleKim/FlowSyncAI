import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { ToastProvider, UNDO_WINDOW_MS } from '../hooks/useToasts';
import { ToastHost } from '../components/common/ToastHost';
import { PrSyncProvider } from '../hooks/PrSyncContext';
import { renderWithRouter } from '../test/render';
import { routeFetch } from '../test/routeFetch';
import { STORAGE_KEYS } from '../lib/storage';
import SettingsScreen from './SettingsScreen';

const REPO = { id: 7, url: 'https://github.com/acme/api', owner: 'acme', name: 'api', githubLogin: null, lastSyncedAt: null, createdAt: '2026-11-01T00:00:00Z' };
const setup = () => {
  const r = routeFetch({
    'GET /api/v1/integrations/watched-repos/': () => ({ json: [REPO] }),
    'DELETE /api/v1/integrations/watched-repos/7/': () => ({ status: 204 }),
  });
  return { ...r, ...renderWithRouter(
    <ToastProvider><PrSyncProvider onCreated={async () => {}}><SettingsScreen /></PrSyncProvider><ToastHost /></ToastProvider>) };
};
beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove('dark'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('SettingsScreen', () => {
  it('(a) "@Octocat " 저장 → octocat, "octocat의 큐"', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('내 GitHub 로그인'), '@Octocat ');
    expect(screen.getByText('octocat으로 저장돼요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBe('octocat');
    expect(screen.getByText('octocat의 큐')).toBeInTheDocument();
  });

  it('(b) 무효 입력은 저장 안 되고 aria-invalid + 오류', async () => {
    const { user } = setup();
    const input = screen.getByLabelText('내 GitHub 로그인');
    await user.type(input, 'a b');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBeNull();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/GitHub 로그인은 영문·숫자·하이픈만 쓸 수 있어요/);
  });

  it('(d) /settings에는 SyncStatusLine(role=status)이 없다', async () => {
    setup();
    await screen.findByText('acme/api');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('(e) 연결 해제 → 행 숨김 → 되돌리기 복귀, 10초 후 DELETE 1회', async () => {
    const { user, calls } = setup();
    await screen.findByText('acme/api');
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    expect(screen.queryByText('acme/api')).not.toBeInTheDocument();
    expect(screen.getByText(/연결을 해제했어요. 팀 모두에게 적용돼요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(screen.getByText('acme/api')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    await user.click(screen.getByRole('button', { name: 'acme/api 연결 해제' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS); });
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('(f) 테마 라디오가 html.dark를 토글', async () => {
    const { user } = setup();
    const group = screen.getByRole('radiogroup', { name: '테마' });
    await user.click(within(group).getByRole('radio', { name: '어둡게' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await user.click(within(group).getByRole('radio', { name: '밝게' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('(g) "감시"·"동기화" 텍스트 없음', async () => {
    setup();
    await screen.findByText('acme/api');
    expect(document.body.textContent).not.toMatch(/감시|동기화/);
  });
});
