import { describe, it, expect } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useHold } from './useHold';

function C() {
  const { held, holdProps } = useHold();
  return (
    <div>
      <div data-testid="box" {...holdProps}>
        <button>a</button>
        <button>b</button>
      </div>
      <button>outside</button>
      <output>{held ? 'held' : 'free'}</output>
    </div>
  );
}
const setup = () => render(<StrictMode><C /></StrictMode>);
const state = () => screen.getByRole('status', { hidden: true }).textContent;

describe('useHold', () => {
  it('focus → held, 컨테이너 밖으로 blur → 해제', () => {
    setup();
    fireEvent.focus(screen.getByText('a'));
    expect(state()).toBe('held');
    fireEvent.blur(screen.getByText('a'), { relatedTarget: screen.getByText('outside') });
    expect(state()).toBe('free');
  });
  it('컨테이너 내부 포커스 이동은 해제 아님', () => {
    setup();
    fireEvent.focus(screen.getByText('a'));
    fireEvent.blur(screen.getByText('a'), { relatedTarget: screen.getByText('b') });
    expect(state()).toBe('held');
  });
  it('relatedTarget 없는 blur(창 이탈)는 해제', () => {
    setup();
    fireEvent.focus(screen.getByText('a'));
    fireEvent.blur(screen.getByText('a'), { relatedTarget: null });
    expect(state()).toBe('free');
  });
  it('mouse enter/leave', () => {
    setup();
    const box = screen.getByTestId('box');
    fireEvent.pointerEnter(box, { pointerType: 'mouse' });
    expect(state()).toBe('held');
    fireEvent.pointerLeave(box, { pointerType: 'mouse' });
    expect(state()).toBe('free');
  });
  it('touch는 무시', () => {
    setup();
    fireEvent.pointerEnter(screen.getByTestId('box'), { pointerType: 'touch' });
    expect(state()).toBe('free');
  });
  it('포커스와 호버 동시: 하나만 풀려도 유지', () => {
    setup();
    const box = screen.getByTestId('box');
    fireEvent.focus(screen.getByText('a'));
    fireEvent.pointerEnter(box, { pointerType: 'mouse' });
    fireEvent.pointerLeave(box, { pointerType: 'mouse' });
    expect(state()).toBe('held');
  });
});
