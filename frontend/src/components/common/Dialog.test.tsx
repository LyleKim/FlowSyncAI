import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
// @ts-expect-error vite ?raw 타입 선언 없음
import src from './Dialog.tsx?raw';
import { Dialog } from './Dialog';

function Harness(p: { open: boolean; onClose?: () => void; role?: 'dialog' | 'alertdialog'; withRef?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={p.open} onClose={p.onClose ?? (() => {})} title="작업 상세" role={p.role} initialFocusRef={p.withRef ? ref : undefined}>
      <input ref={ref} aria-label="필드" />
      <p>내용</p>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('(a) open이면 showModal, false면 close', () => {
    const { rerender } = render(<Harness open />);
    const d = screen.getByRole('dialog', { name: '작업 상세' }) as HTMLDialogElement;
    expect(d.open).toBe(true);
    rerender(<Harness open={false} />);
    expect(d.open).toBe(false);
  });

  it('(b) 초기 포커스: 제목 h2, initialFocusRef가 있으면 그 요소', () => {
    const { unmount } = render(<Harness open />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '작업 상세' }));
    unmount();
    render(<Harness open withRef />);
    expect(document.activeElement).toBe(screen.getByLabelText('필드'));
  });

  it('(c) cancel -> onClose 1회, 기본 닫힘 취소 (입력 안에서 발생해도)', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    const ev = new Event('cancel', { bubbles: true, cancelable: true });
    screen.getByLabelText('필드').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('(d) 닫으면 열기 전 포커스 요소로 복귀', () => {
    function T() {
      const [o, setO] = useState(false);
      return (
        <>
          <button onClick={() => setO(true)}>열기</button>
          <Dialog open={o} onClose={() => setO(false)} title="작업 상세">x</Dialog>
        </>
      );
    }
    render(<T />);
    const btn = screen.getByRole('button', { name: '열기' });
    btn.focus();
    fireEvent.click(btn);
    expect(document.activeElement).not.toBe(btn);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(document.activeElement).toBe(btn);
  });

  it('(e) 백드롭 클릭: dialog만 onClose, alertdialog/자식은 무시', () => {
    const a = vi.fn();
    const { unmount } = render(<Harness open onClose={a} />);
    fireEvent.click(screen.getByText('내용'));
    expect(a).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(a).toHaveBeenCalledTimes(1);
    unmount();
    const b = vi.fn();
    render(<Harness open onClose={b} role="alertdialog" />);
    fireEvent.click(screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByText('내용'));
    expect(b).not.toHaveBeenCalled();
  });

  it('(f) 닫기 버튼', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('언마운트 시 열려 있으면 close()', () => {
    const { unmount } = render(<Harness open />);
    const d = screen.getByRole('dialog') as HTMLDialogElement;
    unmount();
    expect(d.open).toBe(false);
  });

  it('(g) 소스 가드: 네이티브가 제공하는 수동 구현 금지', () => {
    for (const w of ['createPortal', 'inert', 'aria-modal', 'useFocusTrap']) expect(src).not.toContain(w);
  });
});
