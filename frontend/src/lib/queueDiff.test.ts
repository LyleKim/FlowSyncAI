import { describe, it, expect } from 'vitest';
import { diffQueue, describeQueueDiff, nextFocusId } from './queueDiff';
import { makeQueueItem as mk } from '../test/fixtures/reviewQueue';

describe('diffQueue', () => {
  it('waiting→awaiting_author 이동', () => {
    const d = diffQueue([mk({ id: 'a' })], [mk({ id: 'a', group: 'awaiting_author' })]);
    expect(d).toEqual({ addedWaiting: 0, movedToAwaiting: 1, movedToClosed: 0, removed: 0, changedIds: ['a'] });
  });
  it('새 행·사라진 행', () => {
    const d = diffQueue([mk({ id: 'a' })], [mk({ id: 'b' })]);
    expect(d.addedWaiting).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.changedIds.sort()).toEqual(['a', 'b']);
  });
  it('closed 이동', () => {
    expect(diffQueue([mk({ id: 'a' })], [mk({ id: 'a', group: 'closed' })]).movedToClosed).toBe(1);
  });
  it('제목·시각만 바뀌면 changed 아님', () => {
    const d = diffQueue([mk({ id: 'a' })], [mk({ id: 'a', title: '다른 제목', updatedAt: '2026-11-25T00:00:00Z' })]);
    expect(d.changedIds).toEqual([]);
  });
});

describe('describeQueueDiff', () => {
  const z = { addedWaiting: 0, movedToAwaiting: 0, movedToClosed: 0, removed: 0, changedIds: [] };
  it('변화 없으면 null', () => expect(describeQueueDiff(z)).toBeNull());
  it('한 문장으로 묶음', () => {
    expect(describeQueueDiff({ ...z, addedWaiting: 2, movedToAwaiting: 1, movedToClosed: 1 })).toBe(
      '새 리뷰 요청 2건, 작성자 응답 대기로 1건 이동, 정리됨 1건',
    );
  });
  it('일부만', () => expect(describeQueueDiff({ ...z, addedWaiting: 1 })).toBe('새 리뷰 요청 1건'));
  it('사라진 행만', () => expect(describeQueueDiff({ ...z, removed: 3 })).toBe('목록에서 사라짐 3건'));
});

describe('nextFocusId', () => {
  it('중간 제거 → 뒤쪽', () => expect(nextFocusId(['a', 'b', 'c'], 'b', ['a', 'c'])).toBe('c'));
  it('마지막 제거 → 앞쪽', () => expect(nextFocusId(['a', 'b', 'c'], 'c', ['a', 'b'])).toBe('b'));
  it('뒤쪽이 모두 사라졌으면 앞쪽 생존', () => expect(nextFocusId(['a', 'b', 'c'], 'b', ['a'])).toBe('a'));
  it('유일 행 → null', () => expect(nextFocusId(['a'], 'a', [])).toBeNull());
});
