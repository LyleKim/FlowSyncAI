import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../../test/render';
import { EmptyQueueAreaSummary } from './EmptyQueueAreaSummary';
import { fetchAreas } from '../../services/areasApi';
import type { Area } from '../../types/areas';

vi.mock('../../services/areasApi');
const mocked = vi.mocked(fetchAreas);

const area = (id: string, lastChangeAt: string | null, prCount = 0) =>
  ({
    id, displayName: `영역${id}`, lastChangeAt, reviewWaiting: { prCount, oldestRequestedAt: null },
  }) as unknown as Area;
const resp = (areas: Area[]) => ({ repoId: 1, areas }) as never;

beforeEach(() => { vi.clearAllMocks(); });

describe('EmptyQueueAreaSummary', () => {
  it('상위 3개, 링크, 레포 이름, 대기 문구', async () => {
    mocked.mockResolvedValue(resp([
      area('a', '2026-11-01T00:00:00Z'),
      area('b', '2026-11-20T00:00:00Z', 2),
      area('c', '2026-11-10T00:00:00Z'),
      area('d', '2026-11-15T00:00:00Z'),
    ]));
    renderWithRouter(<EmptyQueueAreaSummary repoId={1} repoName="acme/api" />);
    expect(await screen.findByRole('heading', { level: 2, name: '다른 영역은 지금 이래요' })).toBeInTheDocument();
    expect(mocked).toHaveBeenCalledWith(1, 30, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText('acme/api 기준이에요')).toBeInTheDocument();
    const links = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(links.slice(0, 3)).toEqual(['/areas/b', '/areas/d', '/areas/c']);
    expect(screen.queryByText('영역a')).toBeNull();
    expect(screen.getByText('리뷰 대기 2건')).toBeInTheDocument();
    expect(screen.getAllByText('리뷰 대기 없음')).toHaveLength(2);
    expect(screen.getByRole('link', { name: '영역 흐름 전체 보기' })).toHaveAttribute('href', '/areas');
  });

  it('lastChangeAt이 null인 영역은 맨 뒤', async () => {
    mocked.mockResolvedValue(resp([
      area('n', null), area('a', '2026-11-01T00:00:00Z'), area('b', '2026-11-02T00:00:00Z'),
      area('c', '2026-11-03T00:00:00Z'),
    ]));
    renderWithRouter(<EmptyQueueAreaSummary repoId={1} repoName="acme/api" />);
    await screen.findByRole('heading', { level: 2 });
    expect(screen.queryByText('영역n')).toBeNull();
    expect(screen.getAllByRole('link').slice(0, 3).map((l) => l.getAttribute('href'))).toEqual(['/areas/c', '/areas/b', '/areas/a']);
  });

  it('0개면 렌더 없음', async () => {
    mocked.mockResolvedValue(resp([]));
    const { container } = renderWithRouter(<EmptyQueueAreaSummary repoId={1} repoName="acme/api" />);
    await waitFor(() => expect(mocked).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('실패하면 대체 문장과 링크, alert 아님', async () => {
    mocked.mockRejectedValue(new Error('x'));
    renderWithRouter(<EmptyQueueAreaSummary repoId={1} repoName="acme/api" />);
    expect(await screen.findByText('영역 흐름을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영역 흐름 전체 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('로딩 중 aria-busy, 언마운트 시 abort', () => {
    let sig: AbortSignal | undefined;
    mocked.mockImplementation((_i, _d, o) => { sig = o?.signal; return new Promise(() => {}); });
    const { container, unmount } = renderWithRouter(<EmptyQueueAreaSummary repoId={1} repoName="acme/api" />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('.border-t')).toBeNull();
    unmount();
    expect(sig?.aborted).toBe(true);
  });
});
