import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/render';
import AppShell from './AppShell';
import Sidebar from './Sidebar';

afterEach(() => vi.restoreAllMocks());

const shell = (route = '/me') => renderWithRouter(<AppShell><h1>화면</h1></AppShell>, { route });

describe('AppShell', () => {
  it('(d) 첫 Tab 은 스킵 링크, Enter 후 main 포커스', async () => {
    const { user } = shell();
    await user.tab();
    const skip = screen.getByRole('link', { name: '본문으로 건너뛰기' });
    expect(document.activeElement).toBe(skip);
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('(e) nav aria-label="주 메뉴", 현재 항목 aria-current="page"', () => {
    shell('/settings');
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(nav).toBeInTheDocument();
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('설정');
  });

  it('(g) 저장소가 throw 해도 렌더되고 안내 배너', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
    shell();
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent(
      '이 브라우저에서는 설정을 저장하지 못해요. 새로고침하면 처음 상태로 돌아가요.',
    );
  });

  it('저장소가 정상이면 배너 없음', () => {
    shell();
    expect(screen.queryByText(/설정을 저장하지 못해요/)).toBeNull();
  });
});

describe('Sidebar', () => {
  it('(h) 4개 항목, "분석"·"v1.0.0"·"메인 메뉴" 없음', () => {
    renderWithRouter(<Sidebar />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['내 리뷰 요청', '영역 흐름', '전체 작업', '설정']);
    expect(screen.queryByText(/분석/)).toBeNull();
    expect(screen.queryByText(/v1\.0\.0/)).toBeNull();
    expect(screen.queryByText('메인 메뉴')).toBeNull();
  });

  it('배지는 1 이상일 때만', () => {
    const { unmount } = renderWithRouter(<Sidebar reviewBadge={3} />);
    expect(screen.getByLabelText('리뷰 대기 3건')).toHaveTextContent('3');
    unmount();
    renderWithRouter(<Sidebar reviewBadge={0} />);
    expect(screen.queryByLabelText(/리뷰 대기/)).toBeNull();
  });
});
