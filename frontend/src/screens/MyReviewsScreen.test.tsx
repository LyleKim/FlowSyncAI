import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ToastProvider } from '../hooks/useToasts';
import { PrSyncProvider } from '../hooks/PrSyncContext';
import { renderWithRouter } from '../test/render';
import { routeFetch } from '../test/routeFetch';
import { STORAGE_KEYS } from '../lib/storage';
import MyReviewsScreen from './MyReviewsScreen';

const setup = () => {
  routeFetch({ 'GET /api/v1/integrations/watched-repos/': () => ({ json: [] }) });
  return renderWithRouter(<ToastProvider><PrSyncProvider onCreated={async () => {}}><MyReviewsScreen /></PrSyncProvider></ToastProvider>);
};
beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('MyReviewsScreen', () => {
  it('(c) 로그인 없음: 안내 폼만, 큐 제목 줄 없음. 저장하면 큐로 전환', async () => {
    const { user } = setup();
    expect(screen.getByLabelText('내 GitHub 로그인')).toBeInTheDocument();
    expect(screen.queryByText(/의 큐/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('내 GitHub 로그인'), 'octocat');
    await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
    expect(screen.getByText('octocat의 큐')).toBeInTheDocument();
  });

  it('(c2) 저장소가 throw해도 폼이 동작', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const { user } = setup();
    await user.type(screen.getByLabelText('내 GitHub 로그인'), 'octocat');
    await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
    expect(screen.getByText('octocat의 큐')).toBeInTheDocument();
  });

  it('(d) 로그인 있음: 제목 줄에 SyncStatusLine, 빈 상태에 영역 흐름 링크', () => {
    localStorage.setItem(STORAGE_KEYS.myLogin, 'octocat');
    setup();
    expect(screen.getByRole('heading', { level: 1, name: '내 리뷰 요청' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지금 가져오기' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영역 흐름 보기' })).toHaveAttribute('href', '/areas');
  });
});
