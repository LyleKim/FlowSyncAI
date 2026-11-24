import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SyncStatusLine from './SyncStatusLine';
import { mockSyncStatus } from '../../services/syncStatus';

const now = new Date('2026-11-24T12:00:00Z');
const ago = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

describe('SyncStatusLine', () => {
  it('a: 3분 전 성공', () => {
    render(<SyncStatusLine status={mockSyncStatus({ lastSuccessAt: ago(3) })} onRefresh={() => {}} now={now} />);
    expect(screen.getByText(/3분 전 가져옴/)).toBeInTheDocument();
  });
  it('b: 실패해도 마지막 성공 시각 유지', () => {
    render(
      <SyncStatusLine
        status={mockSyncStatus({ lastSuccessAt: ago(3), error: { kind: 'upstream' } })}
        onRefresh={() => {}}
        now={now}
      />,
    );
    expect(screen.getByText(/3분 전 가져옴/)).toBeInTheDocument();
  });
  it('c: 7분 전이면 오래됨', () => {
    render(<SyncStatusLine status={mockSyncStatus({ lastSuccessAt: ago(7) })} onRefresh={() => {}} now={now} />);
    expect(screen.getByText(/오래됨/)).toBeInTheDocument();
  });
  it('d: rate_limit은 버튼 비활성', () => {
    const onRefresh = vi.fn();
    const resetAt = new Date(now.getTime() + 5 * 60000).toISOString();
    render(
      <SyncStatusLine
        status={mockSyncStatus({ lastSuccessAt: ago(1), error: { kind: 'rate_limit', resetAt } })}
        onRefresh={onRefresh}
        now={now}
      />,
    );
    const btn = screen.getByRole('button', { name: '지금 가져오기' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByText('5분 뒤에 다시 가져올 수 있어요')).toBeInTheDocument();
  });
  it('e: 같은 오류 리렌더해도 alert 1개', () => {
    const status = mockSyncStatus({ error: { kind: 'upstream' } });
    const { rerender } = render(<SyncStatusLine status={status} onRefresh={() => {}} now={now} />);
    const text = screen.getByRole('alert').textContent;
    for (let i = 0; i < 3; i++) rerender(<SyncStatusLine status={{ ...status, error: { kind: 'upstream' } }} onRefresh={() => {}} now={now} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toBe(text);
  });
  it('f: truncated', () => {
    render(<SyncStatusLine status={mockSyncStatus({ truncated: true })} onRefresh={() => {}} now={now} />);
    expect(screen.getByText(/일부만 가져왔어요/)).toBeInTheDocument();
  });
  it('버튼 클릭 시 onRefresh', () => {
    const onRefresh = vi.fn();
    render(<SyncStatusLine status={mockSyncStatus()} onRefresh={onRefresh} now={now} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
