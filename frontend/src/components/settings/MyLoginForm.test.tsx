import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../hooks/useToasts';
import { ToastHost } from '../common/ToastHost';
import { routeFetch } from '../../test/routeFetch';
import { STORAGE_KEYS } from '../../lib/storage';
import MyLoginForm from './MyLoginForm';

const RQ = 'GET /api/v1/integrations/review-queue/';
const PROBE_UNKNOWN = { login: 'minji', knownLogin: false, repos: [{ lastSuccessAt: '2026-11-20T00:00:00Z' }], counts: {} };
const setup = (props: Partial<ComponentProps<typeof MyLoginForm>> = {}, probe?: Parameters<typeof routeFetch>[0][string]) => {
  const r = routeFetch(probe ? { [RQ]: probe } : {});
  const onSaved = vi.fn();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ToastProvider><MyLoginForm onSaved={onSaved} {...props} /><ToastHost /></ToastProvider>);
  return { ...r, onSaved, user, input: screen.getByLabelText('내 GitHub 로그인') };
};
const probes = (calls: { url: string }[]) => calls.filter((c) => c.url.includes('review-queue'));
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('MyLoginForm', () => {
  it('(a) 입력 중 미리보기', async () => {
    const { user, input } = setup();
    await user.type(input, '@Octocat ');
    expect(screen.getByText('octocat 으로 확인해요 (대소문자는 구분하지 않아요)')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(/octocat 으로 확인해요/);
  });

  it('(b) 후보 칩은 채우기만, 제출 시 프로브 없이 저장', async () => {
    const { user, input, calls, onSaved } = setup({ variant: 'first-run', candidates: ['Octocat'] });
    await user.click(screen.getByRole('button', { name: 'Octocat' }));
    expect(input).toHaveValue('Octocat');
    expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBeNull();
    await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
    expect(probes(calls)).toHaveLength(0);
    expect(onSaved).toHaveBeenCalledWith('octocat');
  });

  it.each(['a b', 'octocat-'])('(c) 무효 입력 %s', async (bad) => {
    const { user, input, onSaved } = setup();
    await user.type(input, bad);
    await user.click(screen.getByRole('button', { name: '로그인 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('영문·숫자·하이픈만');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/영문·숫자·하이픈만 쓸 수 있어요 \(최대 39자\)/);
    expect(input).toHaveValue(bad);
    expect(onSaved).not.toHaveBeenCalled();
  });

  describe('settings 변형', () => {
    it('(d0) 즉시 저장 + 되돌리기(이전 없음 → 비움), 10초 후에도 유지', async () => {
      const { user, input, onSaved } = setup({}, () => ({ status: 500 }));
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '로그인 저장' }));
      expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBe('minji');
      expect(onSaved).toHaveBeenCalledWith('minji');
      await user.click(screen.getByRole('button', { name: '되돌리기' }));
      expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBeNull();
      await act(async () => { vi.advanceTimersByTime(11_000); });
      expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBeNull();
    });

    it('(d0) 이전 값 복원, 같은 값 재저장은 알림 없음', async () => {
      localStorage.setItem(STORAGE_KEYS.myLogin, 'old');
      const { user, input } = setup({ initial: 'old' }, () => ({ status: 500 }));
      await user.clear(input);
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '로그인 저장' }));
      await user.click(screen.getByRole('button', { name: '되돌리기' }));
      expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBe('old');
      await user.clear(input);
      await user.type(input, 'old');
      await user.click(screen.getByRole('button', { name: '로그인 저장' }));
      expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument();
    });

    it('되돌리기를 프로브 응답보다 먼저 누르면 오래된 안내를 띄우지 않는다', async () => {
      const { user, input } = setup();
      let release!: () => void;
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => {
        release = () => res(new Response(JSON.stringify(PROBE_UNKNOWN), { status: 200 }));
      })));
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '로그인 저장' }));
      await user.click(screen.getByRole('button', { name: '되돌리기' }));
      await act(async () => { release(); });
      expect(screen.queryByText(/본 적 없는 이름/)).not.toBeInTheDocument();
    });

    it('(d0) 본 적 없는 이름이면 저장은 유지되고 한 줄 안내', async () => {
      const { user, input } = setup({}, () => ({ json: PROBE_UNKNOWN }));
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '로그인 저장' }));
      expect(await screen.findByText('“minji”은 이 팀에서 본 적 없는 이름이에요. 철자를 확인해 주세요.')).toBeInTheDocument();
      expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBe('minji');
    });
  });

  describe('first-run 변형', () => {
    it('(d) 본 적 없는 이름 → 확인 단계, [맞아요]로 저장', async () => {
      const { user, input, onSaved } = setup({ variant: 'first-run' }, () => ({ json: PROBE_UNKNOWN }));
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
      expect(await screen.findByText('“minji”은 이 팀에서 본 적 없는 이름이에요. 맞나요?')).toBeInTheDocument();
      expect(screen.getByText('철자와 대문자는 상관없어요.')).toBeInTheDocument();
      expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBeNull();
      await user.click(screen.getByRole('button', { name: '맞아요' }));
      expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBe('minji');
      expect(onSaved).toHaveBeenCalledWith('minji');
    });

    it('(d) [수정] → 입력으로 포커스', async () => {
      const { user, input } = setup({ variant: 'first-run' }, () => ({ json: PROBE_UNKNOWN }));
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
      await user.click(await screen.findByRole('button', { name: '수정' }));
      expect(input).toHaveFocus();
      expect(localStorage.getItem(STORAGE_KEYS.myLogin)).toBeNull();
    });

    it.each([
      ['(e) 성공 이력 없는 서버', () => ({ json: { ...PROBE_UNKNOWN, repos: [{ lastSuccessAt: null }] } })],
      ['(f) 500', () => ({ status: 500 })],
      ['(g) knownLogin true', () => ({ json: { ...PROBE_UNKNOWN, knownLogin: true } })],
    ])('%s → 확인 없이 저장', async (_n, handler) => {
      const { user, input, onSaved } = setup({ variant: 'first-run' }, handler);
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith('minji'));
      expect(screen.queryByText(/맞나요/)).not.toBeInTheDocument();
    });

    it('(f) 네트워크 오류 → 확인 없이 저장', async () => {
      const { user, input, onSaved } = setup({ variant: 'first-run' });
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))));
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith('minji'));
    });

    it('(f) 3초 초과 → 확인 없이 저장', async () => {
      const { user, input, onSaved } = setup({ variant: 'first-run' });
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      await user.type(input, 'minji');
      await user.click(screen.getByRole('button', { name: '저장하고 내 리뷰 요청 보기' }));
      expect(onSaved).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(3_100); });
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith('minji'));
    });
  });

  it('(h) 후보가 없으면 영역 없음', () => {
    setup({ candidates: [] });
    expect(screen.queryByText('팀에서 찾은 로그인')).not.toBeInTheDocument();
  });

  it('(i) 저장소가 throw해도 onSaved', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const { user, input, onSaved } = setup({}, () => ({ status: 500 }));
    await user.type(input, 'minji');
    await user.click(screen.getByRole('button', { name: '로그인 저장' }));
    expect(onSaved).toHaveBeenCalledWith('minji');
  });
});
