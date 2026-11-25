import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskSummary } from './TaskSummary';
import type { Task } from '../../types';

const mk = (over: Partial<Task>) => ({ id: 't1', title: '제목', status: 'todo', priority: 'medium', description: '', createdAt: '2026-11-24T00:00:00Z', ...over }) as Task;

describe('TaskSummary PR 배지', () => {
  it('sourceUrl 없는 PR 작업도 링크 없는 배지를 보인다', () => {
    render(<TaskSummary task={mk({ kind: 'pr' })} />);
    expect(screen.getByText('리뷰 요청')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('수동 작업은 배지 없음', () => {
    render(<TaskSummary task={mk({})} />);
    expect(screen.queryByText('리뷰 요청')).toBeNull();
  });
});
