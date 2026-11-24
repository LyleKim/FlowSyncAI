import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from './useToasts';
import { useUndo, usePendingIds } from './useUndo';
import { ToastHost } from '../components/common/ToastHost';

const mk = (ok = true) => ({ hide: vi.fn(), restore: vi.fn(), commit: vi.fn().mockResolvedValue(ok ? { ok: true } : { ok: false }) });
let api: ReturnType<typeof useUndo>;
let ids: ReadonlySet<string>;
function Probe() { api = useUndo(); ids = usePendingIds(); return null; }
function Scheduler({ a }: { a: ReturnType<typeof mk> }) {
  const { schedule } = useUndo();
  return <button onClick={() => schedule({ label: '‘제목’ 작업을 삭제했어요', key: 'k', ...a })}>go</button>;
}
const wrap = (ui: ReactNode) => render(<ToastProvider><Probe />{ui}<ToastHost /></ToastProvider>);
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useUndo', () => {
  it('(a) schedule 직후 hide만 호출, 키가 대기 집합에 들어간다', () => {
    const a = mk(); wrap(null);
    act(() => api.schedule({ label: 'x', key: 'k', ...a }));
    expect(a.hide).toHaveBeenCalledTimes(1); expect(a.commit).not.toHaveBeenCalled();
    expect(ids.has('k')).toBe(true); expect(api.isPending('k')).toBe(true);
  });
  it('(b) 9.9초엔 미호출, 10초에 1회', async () => {
    const a = mk(); wrap(null);
    act(() => api.schedule({ label: 'x', ...a }));
    await tick(9900); expect(a.commit).not.toHaveBeenCalled();
    await tick(100); expect(a.commit).toHaveBeenCalledTimes(1);
  });
  it('(c) 되돌리기 → restore, commit 없음', async () => {
    const a = mk(); wrap(null);
    act(() => api.schedule({ label: 'x', key: 'k', ...a }));
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    await tick(20000);
    expect(a.restore).toHaveBeenCalledTimes(1); expect(a.commit).not.toHaveBeenCalled(); expect(ids.has('k')).toBe(false);
  });
  it('(d) commit 실패 → restore + alert', async () => {
    const a = mk(false); wrap(null);
    act(() => api.schedule({ label: 'x', ...a }));
    await tick(10000);
    expect(a.restore).toHaveBeenCalledTimes(1); expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('(e) 두 건은 독립 commit', async () => {
    const a = mk(), b = mk(); wrap(null);
    act(() => api.schedule({ label: 'a', ...a }));
    await tick(4000);
    act(() => api.schedule({ label: 'b', ...b }));
    await tick(6000); expect(a.commit).toHaveBeenCalledTimes(1); expect(b.commit).not.toHaveBeenCalled();
    await tick(4000); expect(b.commit).toHaveBeenCalledTimes(1);
  });
  it('(f) pagehide 시 대기 항목 즉시 commit', async () => {
    const a = mk(); wrap(null);
    act(() => api.schedule({ label: 'x', ...a }));
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    expect(a.commit).toHaveBeenCalledTimes(1);
    await tick(10000); expect(a.commit).toHaveBeenCalledTimes(1);
  });
  it('(f2) 스케줄한 컴포넌트가 언마운트돼도 조기 commit 없이 창이 유지된다', async () => {
    const a = mk();
    function Host() { const [on, setOn] = useState(true); return <>{on && <Scheduler a={a} />}<button onClick={() => setOn(false)}>away</button></>; }
    wrap(<Host />);
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByText('away'));
    await tick(9000); expect(a.commit).not.toHaveBeenCalled(); expect(ids.has('k')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(a.restore).toHaveBeenCalledTimes(1);
  });
  it('(g) 되돌리기는 이름 있는 버튼이고 Enter(클릭)로 동작', async () => {
    const a = mk(); wrap(null);
    act(() => api.schedule({ label: 'x', ...a }));
    const btn = screen.getByRole('button', { name: '되돌리기' });
    btn.focus(); expect(btn).toHaveFocus();
    fireEvent.click(btn); // 네이티브 button은 Enter가 click으로 변환됨
    expect(a.restore).toHaveBeenCalled();
  });
});
