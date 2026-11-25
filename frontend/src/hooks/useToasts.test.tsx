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
});
