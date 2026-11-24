import { describe, it, expect } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider, useToasts } from './useToasts';
import { ToastHost } from '../components/common/ToastHost';

let n: ReturnType<typeof useToasts>;
function Probe() { n = useToasts(); return null; }

describe('ToastHost', () => {
  it('info는 status, error는 alert이며 error는 닫기 전까지 유지된다', () => {
    render(<ToastProvider><Probe /><ToastHost /></ToastProvider>);
    act(() => { n.notify('안내'); n.notify('실패', 'error'); });
    expect(screen.getByRole('status')).toHaveTextContent('안내');
    expect(screen.getByRole('alert')).toHaveTextContent('실패');
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
