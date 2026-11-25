import { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskStatusControl from './TaskStatusControl';
import type { Task } from '../../types';

const notify = vi.fn();
vi.mock('../../hooks/useToasts', () => ({ useToasts: () => ({ notify }) }));

const mk = (over: Partial<Task> = {}) => ({ id: 't1', title: '제목', status: 'todo', ...over }) as Task;
beforeEach(() => notify.mockReset());

describe('TaskStatusControl', () => {
  it('a: combobox 이름과 옵션 4개', () => {
    render(<TaskStatusControl task={mk()} onMove={vi.fn()} />);
    const cb = screen.getByRole('combobox', { name: '‘제목’ 상태 변경' });
    expect(Array.from((cb as HTMLSelectElement).options).map((o) => o.text)).toEqual(['할 일', '진행 중', '리뷰 중', '완료']);
  });
  it('b,c: 선택 시 onMove 1회, 성공 알림, 리마운트 후 포커스', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn(async () => { setPosOuter('b'); return { ok: true as const, value: undefined }; });
    let setPosOuter: (p: string) => void = () => {};
    function Parent() {
      const [pos, setPos] = useState('a');
      setPosOuter = setPos;
      const ctl = <TaskStatusControl task={mk()} onMove={onMove} />;
      return pos === 'a' ? <div>{ctl}</div> : <section><p>x</p>{ctl}</section>;
    }
    render(<Parent />);
    await user.selectOptions(screen.getByRole('combobox'), 'review');
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('t1', 'review');
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith('‘제목’을 리뷰 중으로 옮겼어요', 'info');
    expect(document.activeElement).toBe(document.querySelector('[data-status-control="t1"]'));
  });
  it('d: 실패하면 값 복귀, 알림 없음', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn(async () => ({ ok: false as const, error: 'x', notified: true }));
    render(<TaskStatusControl task={mk()} onMove={onMove} />);
    await user.selectOptions(screen.getByRole('combobox'), 'done');
    await waitFor(() => expect(onMove).toHaveBeenCalled());
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('todo');
    expect(notify).not.toHaveBeenCalled();
  });
  it('e: PR 작업은 select 없이 GitHub 기준 글자와 완료 처리 버튼만(결정 12 개정)', () => {
    const t = mk({ id: 'pr-a-b-1', status: 'review' });
    const onMove = vi.fn();
    const { rerender } = render(<TaskStatusControl task={t} onMove={onMove} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('리뷰 중 · GitHub 기준')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '‘제목’ 완료 처리' })).toHaveTextContent('완료 처리');
    expect(onMove).not.toHaveBeenCalled();
    rerender(<TaskStatusControl task={t} onMove={vi.fn()} showLockNote />);
    expect(screen.getByText('리뷰 중 · GitHub 기준 · 완료 처리만 가능해요')).toBeInTheDocument();
    expect(screen.queryByText(/이동 불가/)).toBeNull();
  });
  it('e2: 완료 처리 → onMove(id, done) 1회, 알림 1회, 완료되면 버튼 사라지고 포커스는 그 작업의 상태 영역', async () => {
    const user = userEvent.setup();
    function Parent() {
      const [t, setT] = useState(mk({ id: 'pr-a-b-1', status: 'review' }));
      const onMove = async (id: string, s: Task['status']) => { moves.push([id, s]); setT((x) => ({ ...x, status: s })); return { ok: true as const, value: undefined }; };
      return t.status === 'done' ? <section><TaskStatusControl task={t} onMove={onMove} showLockNote /></section> : <div><TaskStatusControl task={t} onMove={onMove} showLockNote /></div>;
    }
    const moves: [string, string][] = [];
    render(<Parent />);
    await user.click(screen.getByRole('button', { name: '‘제목’ 완료 처리' }));
    expect(moves).toEqual([['pr-a-b-1', 'done']]);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith('‘제목’을 완료로 옮겼어요', 'info');
    expect(screen.queryByRole('button', { name: /완료 처리/ })).toBeNull();
    expect(screen.getByText('완료 · GitHub 기준 · 이동 불가')).toBeInTheDocument();
    expect(document.activeElement).toBe(document.querySelector('[data-status-control="pr-a-b-1"]'));
  });
  it('e3: 완료 처리 실패 → 버튼 유지·포커스 유지, 이 컨트롤은 알리지 않음(단일 알림)', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn(async () => ({ ok: false as const, error: 'x', notified: true }));
    render(<TaskStatusControl task={mk({ id: 'pr-a-b-1', status: 'review' })} onMove={onMove} />);
    const btn = screen.getByRole('button', { name: '‘제목’ 완료 처리' });
    await user.click(btn);
    await waitFor(() => expect(onMove).toHaveBeenCalledWith('pr-a-b-1', 'done'));
    expect(notify).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(btn);
  });
  it('e4: 이미 완료된 PR 작업은 완료 처리 버튼 없음', () => {
    render(<TaskStatusControl task={mk({ id: 'pr-a-b-1', status: 'done' })} onMove={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('완료 · GitHub 기준')).toBeInTheDocument();
  });
  it('f: kind=pr 이면 sourceUrl 없어도 PR', () => {
    render(<TaskStatusControl task={mk({ kind: 'pr' })} onMove={vi.fn()} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });
  it('h: 성공 후 언마운트, 나중에 같은 id 재마운트해도 포커스 안 훔침', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const { unmount } = render(<TaskStatusControl task={mk()} onMove={onMove} />);
    await user.selectOptions(screen.getByRole('combobox'), 'review');
    unmount();
    await new Promise((r) => setTimeout(r, 5));
    render(<TaskStatusControl task={mk()} onMove={onMove} />);
    expect(document.activeElement).toBe(document.body);
  });
  it('i: 실패 시 pendingFocus 해제', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn(async () => ({ ok: false as const, error: 'x', notified: true }));
    const { unmount } = render(<TaskStatusControl task={mk()} onMove={onMove} />);
    await user.selectOptions(screen.getByRole('combobox'), 'done');
    unmount();
    await new Promise((r) => setTimeout(r, 5));
    render(<TaskStatusControl task={mk()} onMove={onMove} />);
    expect(document.activeElement).toBe(document.body);
  });
});
