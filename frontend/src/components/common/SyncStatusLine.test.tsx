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
    expect(screen.getByText(/^\d{2}:\d{2}부터 가능$/)).toBeInTheDocument();
  });
  it('auth는 재시도 버튼 비활성, 제목·본문·관리자 문구 표시', () => {
    const onRefresh = vi.fn();
    render(<SyncStatusLine status={mockSyncStatus({ error: { kind: 'auth' } })} onRefresh={onRefresh} now={now} repo="acme/api" />);
    const btn = screen.getByRole('button', { name: '지금 가져오기' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(onRefresh).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('서버의 GitHub 토큰이 거부됐어요');
    expect(alert).toHaveTextContent('서버 관리자에게 전달해 주세요');
    expect(alert).toHaveTextContent('acme/api 레포를 읽지 못했어요. 서버의 GITHUB_TOKEN을 확인해 주세요.');
  });
  it('repo 없이도 not_found/unknown 제목이 어색하지 않다', () => {
    const { unmount } = render(<SyncStatusLine status={mockSyncStatus({ error: { kind: 'not_found' } })} onRefresh={() => {}} now={now} />);
    expect(screen.getByRole('alert')).toHaveTextContent('연결된 레포를 읽을 수 없어요');
    expect(screen.getByRole('alert')).toHaveTextContent('레포가 없어졌거나 서버 토큰에 읽기 권한이 없을 수 있어요.');
    unmount();
    render(<SyncStatusLine status={mockSyncStatus({ error: { kind: 'unknown' } })} onRefresh={() => {}} now={now} />);
    expect(screen.getByRole('alert')).toHaveTextContent('연결된 레포를 가져오지 못했어요');
    expect(screen.getByRole('alert')).toHaveTextContent('아직 가져온 적이 없어요.');
  });
  it('e: 같은 오류 리렌더해도 alert 1개', () => {
    const status = mockSyncStatus({ error: { kind: 'upstream' } });
    const { rerender } = render(<SyncStatusLine status={status} onRefresh={() => {}} now={now} />);
    const text = screen.getByRole('alert').textContent;
    expect(text).toContain('GitHub가 응답하지 않았어요');
    for (let i = 0; i < 3; i++) rerender(<SyncStatusLine status={{ ...status, error: { kind: 'upstream' } }} onRefresh={() => {}} now={now} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toBe(text);
    expect(screen.getAllByText('GitHub가 응답하지 않았어요')).toHaveLength(1);
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
