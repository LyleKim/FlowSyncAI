import { render, screen } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { describe, expect, it } from 'vitest';
import { useListFocusFallback } from './useListFocusFallback';

function Harness({ ids, headingRef }: { ids: string[]; headingRef: RefObject<HTMLHeadingElement | null> }) {
  useListFocusFallback(headingRef, ids);
  return (
    <div>
      <input aria-label="검색" />
      <h2 ref={headingRef} tabIndex={-1}>목록</h2>
      <ul>{ids.map((id) => <li key={id}><a href="#x" data-row-id={id}>{id}</a></li>)}</ul>
    </div>
  );
}

describe('useListFocusFallback', () => {
  it('moves focus to heading when focused row disappears', () => {
    const ref = createRef<HTMLHeadingElement>();
    const { rerender } = render(<Harness ids={['a', 'b']} headingRef={ref} />);
    screen.getByText('a').focus();
    rerender(<Harness ids={['b']} headingRef={ref} />);
    expect(document.activeElement).toBe(ref.current);
  });

  it('leaves focus alone when it is in the search input', () => {
    const ref = createRef<HTMLHeadingElement>();
    const { rerender } = render(<Harness ids={['a', 'b']} headingRef={ref} />);
    const input = screen.getByLabelText('검색');
    input.focus();
    rerender(<Harness ids={['b']} headingRef={ref} />);
    expect(document.activeElement).toBe(input);
  });

  it('leaves focus alone when the row remains', () => {
    const ref = createRef<HTMLHeadingElement>();
    const { rerender } = render(<Harness ids={['a', 'b']} headingRef={ref} />);
    const a = screen.getByText('a');
    a.focus();
    rerender(<Harness ids={['a', 'b', 'c']} headingRef={ref} />);
    expect(document.activeElement).toBe(a);
  });
});
