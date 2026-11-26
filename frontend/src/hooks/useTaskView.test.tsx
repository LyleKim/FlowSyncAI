import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useTaskView } from './useTaskView';

const wrap = (url: string) => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
);
const setup = (url = '/tasks?kind=pr&q=%EA%B2%B0%EC%A0%9C') => renderHook(() => useTaskView(), { wrapper: wrap(url) });

describe('useTaskView', () => {
  it('(a) URL을 상태로 파싱', () => {
    const { result } = setup();
    expect(result.current.state.kind).toBe('pr');
    expect(result.current.state.q).toBe('결제');
  });
  it('(b) 보드로 전환하면 status가 빠진다', () => {
    const { result } = setup('/tasks?status=review');
    act(() => result.current.set({ view: 'board' }));
    expect(result.current.search).toContain('view=board');
    expect(result.current.search).not.toContain('status');
  });
  it('(c) clearFilters는 view/sort 유지', () => {
    const { result } = setup('/tasks?view=board&sort=title&kind=pr&q=a&assignee=x');
    act(() => result.current.clearFilters());
    expect(result.current.state).toMatchObject({ view: 'board', sort: 'title', kind: 'all', q: '', assignee: '' });
  });
  it('(d) activeFilters 라벨', () => {
    const { result } = setup('/tasks?q=%EA%B2%B0%EC%A0%9C&status=review&kind=pr&assignee=minji');
    expect(result.current.activeFilters.map(f => f.label)).toEqual([
      '검색어 “결제”', '상태 리뷰 중', '출처 리뷰 요청', '담당자 minji',
    ]);
  });
  it('(d2) assignee me/none 라벨', () => {
    expect(setup('/tasks?assignee=me').result.current.activeFilters[0].label).toBe('담당자 나');
    expect(setup('/tasks?assignee=none').result.current.activeFilters[0].label).toBe('담당자 없음');
  });
});
