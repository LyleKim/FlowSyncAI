import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

// 큐·영역 요청은 모듈 모킹(큐 계획 Task 8). 대기 0건 + 성공한 레포 1개 → 빈 상태
vi.mock('../services/reviewQueueApi', async () => {
  const actual = await vi.importActual<typeof import('../services/reviewQueueApi')>('../services/reviewQueueApi');
  return { ...actual, fetchReviewQueue: vi.fn(async () => makeQueue({ items: [] })) };
});
vi.mock('../services/areasApi', async () => {
  const actual = await vi.importActual<typeof import('../services/areasApi')>('../services/areasApi');
  return { ...actual, fetchAreas: vi.fn(async () => makeAreasResponse({ areas: [] })) };
});
import { makeQueue } from '../test/fixtures/reviewQueue';
import { makeAreasResponse } from '../test/fixtures/areas';
import { ReviewQueueProvider } from '../hooks/ReviewQueueContext';
import { ToastProvider } from '../hooks/useToasts';
import { PrSyncProvider } from '../hooks/PrSyncContext';
import { renderWithRouter } from '../test/render';
import { routeFetch } from '../test/routeFetch';
import { STORAGE_KEYS } from '../lib/storage';
import MyReviewsScreen from './MyReviewsScreen';

const setup = () => {
  routeFetch({ 'GET /api/v1/integrations/watched-repos/': () => ({ json: [] }) });
  return renderWithRouter(<ToastProvider><PrSyncProvider onCreated={async () => {}}><ReviewQueueProvider><MyReviewsScreen /></ReviewQueueProvider></PrSyncProvider></ToastProvider>);
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

  it('(d) 로그인 있음: 제목 줄에 SyncStatusLine, 빈 상태에 영역 흐름 링크', async () => {
    localStorage.setItem(STORAGE_KEYS.myLogin, 'octocat');
    setup();
    await screen.findByText('지금 리뷰 대기 PR이 없어요');
    expect(screen.getByRole('heading', { level: 1, name: '내 리뷰 요청' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지금 가져오기' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영역 흐름 보기' })).toHaveAttribute('href', '/areas');
  });
});
