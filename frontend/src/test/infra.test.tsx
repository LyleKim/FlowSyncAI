import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithRouter } from './render';

describe('test infra', () => {
  it('renderWithRouter renders ui', () => {
    renderWithRouter(<h1>안녕</h1>);
    expect(screen.getByRole('heading', { name: '안녕' })).toBeInTheDocument();
  });

  it('dialog stub: open/close/event/focus restore', () => {
    const btn = document.createElement('button');
    document.body.append(btn);
    btn.focus();
    const dlg = document.createElement('dialog');
    document.body.append(dlg);
    const onClose = vi.fn();
    dlg.addEventListener('close', onClose);
    dlg.showModal();
    expect(dlg.open).toBe(true);
    dlg.close('x');
    expect(dlg.open).toBe(false);
    expect(dlg.returnValue).toBe('x');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(btn);
  });

  it('stubs matchMedia and scrollIntoView', () => {
    expect(window.matchMedia('(min-width: 1px)').matches).toBe(false);
    expect(() => document.createElement('div').scrollIntoView()).not.toThrow();
  });
});
