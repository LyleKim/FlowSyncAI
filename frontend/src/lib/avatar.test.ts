import { describe, it, expect } from 'vitest';
import { getInitials, getAvatarColor } from './avatar';

describe('avatar', () => {
  it('getInitials', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('john doe')).toBe('JD');
    expect(getInitials('alice')).toBe('AL');
  });
  it('getAvatarColor is stable', () => {
    expect(getAvatarColor('')).toBe('bg-slate-500');
    expect(getAvatarColor('alice')).toBe(getAvatarColor('alice'));
    expect(getAvatarColor('alice')).toMatch(/^bg-/);
  });
});
