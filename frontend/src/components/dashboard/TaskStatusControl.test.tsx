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
    function Parent() {
      const [pos, setPos] = useState('a');
      const [onMove] = useState(() => vi.fn(async () => { setPos('b'); return { ok: true as const, value: undefined }; }));
      (globalThis as any).__onMove = onMove;
      const ctl = <TaskStatusControl task={mk()} onMove={onMove} />;
      return pos === 'a' ? <div>{ctl}</div> : <section><p>x</p>{ctl}</section>;
    }
    render(<Parent />);
    await user.selectOptions(screen.getByRole('combobox'), 'review');
    expect((globalThis as any).__onMove).toHaveBeenCalledTimes(1);
    expect((globalThis as any).__onMove).toHaveBeenCalledWith('t1', 'review');
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
  it('e: PR 작업은 컨트롤 없이 텍스트', () => {
    const t = mk({ id: 'pr-a-b-1', status: 'review' });
    const { rerender } = render(<TaskStatusControl task={t} onMove={vi.fn()} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('리뷰 중 · GitHub 기준')).toBeInTheDocument();
    rerender(<TaskStatusControl task={t} onMove={vi.fn()} showLockNote />);
    expect(screen.getByText(/이동 불가/)).toBeInTheDocument();
  });
  it('f: kind=pr 이면 sourceUrl 없어도 PR', () => {
    render(<TaskStatusControl task={mk({ kind: 'pr' })} onMove={vi.fn()} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
