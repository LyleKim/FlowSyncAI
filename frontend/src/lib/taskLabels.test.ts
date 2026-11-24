import { describe, it, expect } from 'vitest';
import { adjacentStatus, isPrTask, STATUS_ORDER, STATUS_LABEL, PRIORITY_LABEL } from './taskLabels';

describe('taskLabels', () => {
  it('adjacentStatus', () => {
    expect(adjacentStatus('todo', -1)).toBeNull();
    expect(adjacentStatus('review', 1)).toBe('done');
    expect(adjacentStatus('done', 1)).toBeNull();
    expect(adjacentStatus('todo', 1)).toBe('inprogress');
  });
  it('labels', () => {
    expect(STATUS_ORDER).toEqual(['todo', 'inprogress', 'review', 'done']);
    expect(STATUS_LABEL.review).toBe('리뷰 중');
    expect(PRIORITY_LABEL.urgent).toBe('긴급');
  });
  it('isPrTask', () => {
    expect(isPrTask({ id: 'pr-a-b-1' })).toBe(true);
    expect(isPrTask({ id: 't1' })).toBe(false);
    expect(isPrTask({ id: 't1', kind: 'pr' })).toBe(true);
    expect(isPrTask({ id: 'pr-a-b-1', kind: 'manual' })).toBe(false);
    expect(isPrTask({ id: 't1', sourceUrl: 'https://github.com/a/b/pull/1' } as any)).toBe(false);
  });
});
