import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('frontend/src/index.css', 'utf8');
const NAMES = [
  'surface', 'surface-raised', 'surface-sunken', 'text', 'text-muted', 'border', 'border-strong',
  'accent', 'accent-contrast', 'focus-ring', 'danger', 'success', 'warning',
  'status-todo', 'status-inprogress', 'status-review', 'status-done',
  'priority-low', 'priority-medium', 'priority-high', 'priority-urgent',
];
const block = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

describe('design tokens', () => {
  it('dark custom variant', () => {
    expect(css).toContain('@custom-variant dark (&:where(.dark, .dark *));');
  });
  it.each([':root', '.dark'])('%s defines all tokens', (sel) => {
    const b = block(sel);
    for (const n of NAMES) expect(b, n).toMatch(new RegExp(`--${n}:`));
  });
  it('reduced-motion block', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
