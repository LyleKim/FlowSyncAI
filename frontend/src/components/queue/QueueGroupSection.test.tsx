import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueueGroupSection } from './QueueGroupSection';

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}` }));
const renderItem = (it: { id: string }) => (
  <li key={it.id} data-row-id={it.id}>
    <a href={`#${it.id}`}>{it.id}</a>
  </li>
);
const setup = (n: number, over = {}) =>
  render(
    <QueueGroupSection id="g" title="리뷰 대기" items={mk(n)} defaultOpen renderItem={renderItem} {...over} />,
  );

describe('QueueGroupSection', () => {
  it('a: 버튼 헤더·aria 연결·키보드 토글·닫힌 본문 hidden', async () => {
    const user = userEvent.setup();
    setup(2, { hint: '오래된 순' });
    const btn = screen.getByRole('button', { name: /리뷰 대기 2건 · 오래된 순/ });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    const list = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(list).not.toHaveAttribute('hidden');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(list).toHaveAttribute('hidden');
    await user.keyboard(' ');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn.closest('h2')).toHaveAttribute('data-group-heading');
  });

  it('b: 120건 중 50건만, 더 보기 후 51번째 링크로 포커스', async () => {
    const user = userEvent.setup();
    setup(120);
    expect(document.querySelectorAll('li')).toHaveLength(50);
    await user.click(screen.getByRole('button', { name: '더 보기 (70건 더)' }));
    expect(document.querySelectorAll('li')).toHaveLength(120);
    expect(screen.getByRole('link', { name: 'r51' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull();
  });

  it('c: 헤더 건수는 전체', () => {
    setup(120);
    expect(screen.getByRole('button', { name: /리뷰 대기 120건/ })).toBeInTheDocument();
  });

  it('d: 0건이면 null', () => {
    const { container } = setup(0);
    expect(container).toBeEmptyDOMElement();
  });

  it('cap 이하면 더 보기 없음', () => {
    setup(50);
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull();
  });
});
