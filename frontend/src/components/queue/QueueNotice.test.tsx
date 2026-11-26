import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/render';
import { QueueNotice, type QueueNoticeKind } from './QueueNotice';

const r = (kind: QueueNoticeKind, over = {}) =>
  renderWithRouter(<QueueNotice kind={kind} login="octo" repoCount={2} {...over} />);

afterEach(() => vi.useRealTimers());

describe('QueueNotice', () => {
  it('loading: 문구, aria-busy, 10초 뒤 문구 전환', () => {
    vi.useFakeTimers();
    r('loading');
    expect(screen.getByText('리뷰 요청을 확인하는 중이에요')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[aria-hidden="true"] > div')).toHaveClass('bg-surface-sunken');
    act(() => { vi.advanceTimersByTime(9000); });
    expect(screen.queryByText(/계속 확인하는 중/)).toBeNull();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByText('계속 확인하는 중이에요. 다른 화면으로 가도 돼요')).toBeInTheDocument();
  });

  it('server_error: alert + 재시도', async () => {
    const onRetry = vi.fn();
    const { user } = r('server_error', { onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결할 수 없어요');
    expect(screen.getByText(/서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('no_repos: 레포 연결 링크', () => {
    r('no_repos');
    expect(screen.getByText('아직 리뷰 요청을 가져올 레포가 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '레포 연결' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('login_unknown: 문구와 로그인 확인 링크', () => {
    r('login_unknown');
    expect(screen.getByText(/레포 2개에서 “octo”에게 온 리뷰 요청을 찾지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인 확인' })).toHaveAttribute('href', '/settings');
  });

  it('no_waiting: 시각, 영역 링크, children, 축하 단어 없음, login_unknown과 다름', () => {
    const { container } = r('no_waiting', {
      lastSuccessAt: '2026-11-24T05:07:00', children: <p>슬롯</p>,
    });
    expect(screen.getByText('지금 리뷰 대기 PR이 없어요')).toBeInTheDocument();
    expect(screen.getByText('05:07에 가져왔어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '영역 흐름 보기' })).toHaveAttribute('href', '/areas');
    expect(screen.getByText('슬롯')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/완료|축하/);
    expect(container.textContent).not.toMatch(/찾지 못했어요/);
  });

  it('no_waiting: lastSuccessAt 없으면 시각 문구 없음', () => {
    r('no_waiting');
    expect(screen.queryByText(/가져왔어요/)).toBeNull();
  });
});
