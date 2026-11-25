import { describe, it, expect } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider, useToasts } from './useToasts';
import { ToastHost } from '../components/common/ToastHost';

let n: ReturnType<typeof useToasts>;
function Probe() { n = useToasts(); return null; }

describe('ToastHost', () => {
  it('live region은 항상 있는 status·alert 한 쌍이고, 토스트는 그 안에 역할 없이 들어간다', () => {
    render(<ToastProvider><Probe /><ToastHost /></ToastProvider>);
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    expect(status).toBeEmptyDOMElement();
    expect(alert).toBeEmptyDOMElement();
    act(() => { n.notify('안내'); n.notify('실패', 'error'); });
    expect(screen.getByRole('status')).toBe(status);
    expect(screen.getByRole('alert')).toBe(alert);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(status).toHaveTextContent('안내');
    expect(alert).toHaveTextContent('실패');
    expect(alert.textContent!.split('실패')).toHaveLength(2); // 한 번만
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(alert).toBeEmptyDOMElement();
  });

  it('토스트가 없어도 두 live region이 DOM에 남고(숨김 없음), 빈 래퍼는 클릭을 막지 않는다', () => {
    render(<ToastProvider><Probe /><ToastHost /></ToastProvider>);
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    for (const region of [status, alert]) {
      expect(region).toBeInTheDocument();
      expect(region.className).not.toMatch(/empty:hidden|\bhidden\b/);
    }
    const wrapper = status.parentElement!;
    expect(wrapper).toBe(alert.parentElement);
    expect(wrapper).toHaveClass('pointer-events-none');
    act(() => { n.notify('안내'); });
    expect(status.firstElementChild).toHaveClass('pointer-events-auto');
  });
});
