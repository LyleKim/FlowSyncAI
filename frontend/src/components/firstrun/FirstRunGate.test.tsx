import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/render';
import { STORAGE_KEYS } from '../../lib/storage';
import FirstRunGate from './FirstRunGate';

vi.mock('./FirstRunFlow', () => ({ default: () => <p>첫 실행 흐름</p> }));

afterEach(() => localStorage.clear());

describe('FirstRunGate', () => {
  it('(e) 로그인이 이미 있으면 children을 바로 렌더(FirstRunFlow 미마운트)', () => {
    localStorage.setItem(STORAGE_KEYS.myLogin, 'minji');
    renderWithRouter(<FirstRunGate><h1>내 리뷰 요청 화면</h1></FirstRunGate>, { route: '/me' });
    expect(screen.getByRole('heading', { name: '내 리뷰 요청 화면' })).toBeInTheDocument();
    expect(screen.queryByText('첫 실행 흐름')).not.toBeInTheDocument();
  });

  it('로그인이 없으면 FirstRunFlow', () => {
    renderWithRouter(<FirstRunGate><h1>내 리뷰 요청 화면</h1></FirstRunGate>, { route: '/me' });
    expect(screen.getByText('첫 실행 흐름')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '내 리뷰 요청 화면' })).not.toBeInTheDocument();
  });
});
