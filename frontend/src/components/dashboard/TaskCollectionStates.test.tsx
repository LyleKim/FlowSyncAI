import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { TasksEmptyAll, TasksEmptyFiltered, TasksLoadError, TasksLoading } from './TaskCollectionStates';

const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('TaskCollectionStates', () => {
  it('(a) loading is role=status without animate-*', () => {
    const { container } = wrap(<TasksLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('작업을 불러오는 중이에요');
    expect(container.innerHTML).not.toMatch(/animate-/);
    expect(container.querySelectorAll('[aria-hidden="true"] > *, [aria-hidden="true"]').length).toBeGreaterThanOrEqual(5);
  });

  it('(b) load error: single alert, retry once, stable across re-renders, stale copy', async () => {
    const onRetry = vi.fn();
    const ui = <MemoryRouter><TasksLoadError onRetry={onRetry} hasStale={false} /></MemoryRouter>;
    const { rerender } = render(ui);
    for (let i = 0; i < 3; i++) rerender(ui);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('서버에 연결할 수 없어요')).toBeInTheDocument();
    expect(screen.getByText(/서버가 꺼져 있거나/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<MemoryRouter><TasksLoadError onRetry={onRetry} hasStale /></MemoryRouter>);
    expect(screen.getByText('아래 목록은 마지막으로 가져온 내용이에요.')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('(c) empty-all links to /tasks/new and /me, no repo-connect guidance', () => {
    const { container } = wrap(<TasksEmptyAll />);
    expect(screen.getByText('아직 작업이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '새 작업' })).toHaveAttribute('href', '/tasks/new');
    expect(screen.getByRole('link', { name: '내 리뷰 요청' })).toHaveAttribute('href', '/me');
    expect(container.textContent).not.toContain('레포를 연결하면');
  });

  it('(d) empty-filtered lists active filters and clears', async () => {
    const onClear = vi.fn();
    wrap(<TasksEmptyFiltered onClear={onClear} activeFilters={[{ key: 'a', label: '상태: 할 일' }, { key: 'b', label: '우선순위: 높음' }, { key: 'c', label: '검색: 로그인' }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: '필터 해제' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('(e) no vague error wording in source', () => {
    const src = readFileSync('frontend/src/components/dashboard/TaskCollectionStates.tsx', 'utf8');
    expect(src).not.toMatch(/문제가 발생|잘못된/);
  });
});
