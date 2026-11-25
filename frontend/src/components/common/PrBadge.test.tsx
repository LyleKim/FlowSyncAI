import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrBadge from './PrBadge';

describe('PrBadge', () => {
  it('g: 리뷰 요청 글자와 링크 속성', () => {
    render(<PrBadge url="https://github.com/a/b/pull/1" />);
    const a = screen.getByRole('link', { name: 'GitHub에서 열기' });
    expect(a).toHaveTextContent('리뷰 요청');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('url 없으면 글자만', () => {
    render(<PrBadge />);
    expect(screen.getByText('리뷰 요청')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
