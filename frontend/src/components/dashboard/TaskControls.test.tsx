import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/render';
import { TaskTitle } from './TaskControls';
import type { Task } from '../../types';

const mk = (over: Partial<Task>) => ({ id: 't1', title: '제목', status: 'todo', ...over }) as Task;

describe('TaskTitle PR 배지', () => {
  it('sourceUrl 없는 PR 작업도 링크 없는 배지를 보인다', () => {
    renderWithRouter(<TaskTitle task={mk({ kind: 'pr' })} />);
    expect(screen.getByText('리뷰 요청')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'GitHub에서 열기' })).toBeNull();
  });
  it('수동 작업은 배지 없음', () => {
    renderWithRouter(<TaskTitle task={mk({})} />);
    expect(screen.queryByText('리뷰 요청')).toBeNull();
  });
});
