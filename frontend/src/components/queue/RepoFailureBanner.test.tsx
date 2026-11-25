import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoFailureBanner } from './RepoFailureBanner';
import type { RepoSyncState } from '../../types/repoSync';

const now = new Date('2026-11-24T05:00:00Z');
const ok: RepoSyncState = {
  repoId: 1, repo: 'acme/ok', lastAttemptAt: null, lastSuccessAt: '2026-11-24T04:00:00Z', lastError: null, truncated: false,
};
const bad = (over: Partial<RepoSyncState> = {}): RepoSyncState => ({
  ...ok, repoId: 2, repo: 'acme/api', lastError: { kind: 'upstream', message: '' }, ...over,
});
const r = (repos: RepoSyncState[], over = {}) =>
  render(<RepoFailureBanner repos={repos} allFailed={false} retryingRepoId={null} onRetry={() => {}} now={now} {...over} />);

describe('RepoFailureBanner', () => {
  it('h/m: 실패 없으면 렌더 없음', () => {
    const { container } = r([ok]);
    expect(container).toBeEmptyDOMElement();
  });

  it('성공 레포는 배너에 없음, 실패 레포 기준 시각 표시', () => {
    r([ok, bad({ lastSuccessAt: '2026-11-24T03:05:00Z' })]);
    expect(screen.queryByText(/acme\/ok/)).toBeNull();
    expect(screen.getByText('GitHub가 응답하지 않았어요')).toBeInTheDocument();
    expect(screen.getByText(/기준$/)).toBeInTheDocument();
  });

  it('i: rate_limit 미래 resetAt이면 aria-disabled, 클릭 무시', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    r([bad({ lastError: { kind: 'rate_limit', message: '', resetAt: '2026-11-24T06:30:00Z' } })], { onRetry });
    const btn = screen.getByRole('button', { name: /이 레포만 다시 시도/ });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/부터 가능/)).toBeInTheDocument();
    await user.click(btn);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('재시도 가능하면 onRetry(repoId)', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    r([bad()], { onRetry });
    await user.click(screen.getByRole('button', { name: /이 레포만 다시 시도/ }));
    expect(onRetry).toHaveBeenCalledWith(2);
  });

  it('j: auth는 재시도 없음, 복사 버튼, 클립보드 거부 시 텍스트 노출', async () => {
    const user = userEvent.setup();
    r([bad({ lastError: { kind: 'auth', message: '' } })]);
    expect(screen.queryByRole('button', { name: /이 레포만 다시 시도/ })).toBeNull();
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: '관리자에게 보낼 내용 복사' }));
    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByRole('textbox')).toHaveAttribute('readonly');
  });

  it('k/l: 일부 실패 alert 1개(리렌더 유지), 전체 실패는 group', () => {
    const { rerender } = r([ok, bad()]);
    const el = screen.getByRole('alert');
    for (let i = 0; i < 3; i++)
      rerender(<RepoFailureBanner repos={[ok, bad()]} allFailed={false} retryingRepoId={null} onRetry={() => {}} now={now} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toBe(el);
    rerender(<RepoFailureBanner repos={[bad()]} allFailed retryingRepoId={null} onRetry={() => {}} now={now} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('n: retrying이면 aria-disabled + 확인 중 문구', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    r([bad()], { retryingRepoId: 2, onRetry });
    const btn = screen.getByRole('button', { name: /이 레포만 다시 시도/ });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/다시 확인하는 중/)).toBeInTheDocument();
    await user.click(btn);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
