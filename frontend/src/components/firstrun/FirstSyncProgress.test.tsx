import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ConnectedRepo } from '../../services/connectedReposApi';
import FirstSyncProgress from './FirstSyncProgress';

const r = (id: number, name: string) => ({ id, owner: 'acme', name, lastError: null }) as unknown as ConnectedRepo;

describe('FirstSyncProgress', () => {
  it('진행 문구·레포별 텍스트, 10초 전에는 안내 없음', () => {
    render(<FirstSyncProgress repos={[r(1, 'api'), r(2, 'web')]} running elapsedMs={9_999} />);
    expect(screen.getByRole('status')).toHaveTextContent('레포 2개에서 리뷰 요청을 확인하는 중이에요');
    expect(screen.getAllByText('확인하는 중…')).toHaveLength(2);
    expect(screen.getByText('acme/web')).toBeInTheDocument();
    expect(screen.queryByText(/계속 확인 중이에요/)).not.toBeInTheDocument();
  });

  it('10초 이상이면 계속 확인 중 안내', () => {
    render(<FirstSyncProgress repos={[r(1, 'api')]} running elapsedMs={10_000} />);
    expect(screen.getByRole('status')).toHaveTextContent('계속 확인 중이에요. 다른 화면으로 가도 돼요.');
  });
});
