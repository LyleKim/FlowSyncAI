import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueueSummary } from './QueueSummary';

const base = {
  waitingCount: 3,
  oldestLabel: '4일',
  awaitingCount: 2,
  draftCount: 0,
  showDrafts: false,
  onShowDraftsChange: () => {},
  partial: false,
  truncated: false,
};
const r = (over = {}) => render(<QueueSummary {...base} {...over} />);

describe('QueueSummary', () => {
  it('e: 문구 조합', () => {
    const { container, rerender } = r();
    expect(container).toHaveTextContent('리뷰 대기 3건 · 가장 오래 4일');
    expect(container).toHaveTextContent('작성자 응답 대기 2건');
    expect(container).not.toHaveTextContent('확인된 레포 기준');
    rerender(<QueueSummary {...base} oldestLabel={null} partial truncated />);
    expect(container).not.toHaveTextContent('가장 오래');
    expect(container).toHaveTextContent('(확인된 레포 기준)');
    expect(container).toHaveTextContent('(일부만 가져옴)');
  });

  it('f: 체크박스 토글·Space·숨김 문구', async () => {
    const user = userEvent.setup();
    const fn = vi.fn();
    r({ draftCount: 4, onShowDraftsChange: fn });
    expect(screen.getByText('초안 4건은 숨겨져 있어요')).toBeInTheDocument();
    const cb = screen.getByRole('checkbox', { name: '초안 4건 보기' });
    cb.focus();
    await user.keyboard(' ');
    expect(fn).toHaveBeenCalledWith(true);
    await user.click(cb);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('f2: showDrafts면 숨김 문구 없음', () => {
    r({ draftCount: 4, showDrafts: true });
    expect(screen.queryByText(/숨겨져/)).toBeNull();
  });

  it('g: 초안 0건이면 체크박스 없음', () => {
    r();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
