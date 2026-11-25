import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConnectedRepo, QueueProbe } from '../../services/connectedReposApi';
import FirstSyncResult from './FirstSyncResult';

const r = (id: number, name: string, lastError: ConnectedRepo['lastError'] = null) =>
  ({ id, owner: 'acme', name, lastError, lastSuccessAt: null }) as unknown as ConnectedRepo;
const probe = (waiting: number, knownLogin = true): QueueProbe =>
  ({ login: 'minji', knownLogin, repos: [], counts: { waiting, awaitingAuthor: 0, closed: 0 } });

const setup = (props: Partial<ComponentProps<typeof FirstSyncResult>>) => {
  const fns = { onChangeLogin: vi.fn(), onRetry: vi.fn(), onFinish: vi.fn() };
  render(<FirstSyncResult login="minji" repos={[r(1, 'api')]} probe={probe(1)} {...fns} {...props} />);
  return { ...fns, user: userEvent.setup() };
};
const UPSTREAM = { kind: 'upstream' as const, message: '' };
const AUTH = { kind: 'auth' as const, message: '' };

describe('FirstSyncResult', () => {
  it('(g) 일부 실패: 성공 행 확인했어요, 실패 행 사유·다시 시도, 주 버튼 활성, alert 1개', async () => {
    const { user, onRetry, onFinish } = setup({ repos: [r(1, 'api'), r(2, 'web', UPSTREAM)] });
    const ok = screen.getByText('acme/api').closest('li')!;
    expect(within(ok).getByText('확인했어요')).toBeInTheDocument();
    const bad = screen.getByText('acme/web').closest('li')!;
    expect(within(bad).getByText('GitHub가 응답하지 않았어요')).toBeInTheDocument();
    await user.click(within(bad).getByRole('button', { name: 'acme/web 다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    const main = screen.getByRole('button', { name: '내 리뷰 요청 보기' });
    expect(main).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(main);
    expect(onFinish).toHaveBeenCalled();
  });

  it('(g) 전 레포 auth 실패 → 다시 시도 없음, 성공을 주장하지 않음, 주 버튼은 있음', () => {
    setup({ repos: [r(1, 'api', AUTH), r(2, 'web', AUTH)], probe: probe(0, false) });
    expect(screen.queryByRole('button', { name: /다시 시도/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/찾았어요|리뷰 대기 PR이 없어요|찾지 못했어요/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('레포를 하나도 확인하지 못했어요');
    expect(screen.getByRole('button', { name: '내 리뷰 요청 보기' })).toBeInTheDocument();
  });

  it('전 레포 재시도 가능한 실패 → 요약 다시 시도', async () => {
    const { user, onRetry } = setup({ repos: [r(1, 'api', UPSTREAM)] });
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('(h) 0건+knownLogin:true → 지금 리뷰 대기 PR이 없어요', () => {
    setup({ probe: probe(0, true) });
    expect(screen.getByRole('status')).toHaveTextContent('지금 리뷰 대기 PR이 없어요');
    expect(screen.queryByRole('button', { name: '로그인 확인' })).not.toBeInTheDocument();
  });

  it('(i) 프로브 null → 건수 줄 없음', () => {
    setup({ probe: null });
    expect(screen.queryByText(/리뷰 대기|찾지 못했어요/)).not.toBeInTheDocument();
    expect(screen.getByText('확인했어요')).toBeInTheDocument();
  });

  it('(j) 어떤 결과든 이름 재확인 줄과 로그인 바꾸기', async () => {
    const { user, onChangeLogin } = setup({ probe: probe(3) });
    expect(screen.getByText(/minji의 큐예요\. 내 계정이 아니라면/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '로그인 바꾸기' }));
    expect(onChangeLogin).toHaveBeenCalled();
  });

  it('(j) 프로브 null·전 레포 실패에서도 재확인 줄', () => {
    setup({ probe: null, repos: [r(1, 'api', AUTH)] });
    expect(screen.getByRole('button', { name: '로그인 바꾸기' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/감시|동기화/);
  });
});
