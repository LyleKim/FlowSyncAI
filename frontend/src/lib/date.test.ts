import { describe, it, expect } from 'vitest';
import { formatDate, minutesAgo } from './date';

describe('date', () => {
  it('formatDate', () => {
    expect(formatDate('2026-03-05T12:00:00Z')).toMatch(/2026/);
    expect(formatDate('')).toBe('-');
    expect(formatDate('garbage')).toBe('-');
  });
  it('minutesAgo', () => {
    const now = new Date('2026-01-01T01:00:00Z');
    expect(minutesAgo('2026-01-01T00:30:00Z', now)).toBe(30);
    expect(minutesAgo('2026-01-01T02:00:00Z', now)).toBe(0);
  });
});
