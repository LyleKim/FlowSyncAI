import { describe, it, expect } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useFrozenQueue } from './useFrozenQueue';
import { makeQueue, makeQueueItem as mk, makeRepo } from '../test/fixtures/reviewQueue';
import type { ReviewQueueResponse } from '../types/reviewQueue';

const q1 = makeQueue({ items: [mk({ id: 'a' }), mk({ id: 'b' })] });
const q2 = makeQueue({ items: [mk({ id: 'a', group: 'awaiting_author' }), mk({ id: 'b' }), mk({ id: 'c' })], repos: [makeRepo({ lastSuccessAt: '2026-11-24T06:00:00Z' })] });

function setup(initial: { live: ReviewQueueResponse | null; held: boolean }) {
  return renderHook((p: { live: ReviewQueueResponse | null; held: boolean }) => useFrozenQueue(p.live, p.held), {
    initialProps: initial,
    wrapper: StrictMode,
  });
}

describe('useFrozenQueue', () => {
  it('null live → shown null', () => {
    expect(setup({ live: null, held: true }).result.current.shown).toBeNull();
  });
  it('held 아니면 live 그대로', () => {
    const { result, rerender } = setup({ live: q1, held: false });
    rerender({ live: q2, held: false });
    expect(result.current.shown?.items).toEqual(q2.items);
    expect(result.current.pendingCount).toBe(0);
  });
  it('첫 데이터는 held여도 즉시 반영', () => {
    const { result, rerender } = setup({ live: null, held: true });
    rerender({ live: q1, held: true });
    expect(result.current.shown?.items).toEqual(q1.items);
  });
  it('held 중 live 교체 → items 고정, pending 증가, repos는 최신', () => {
    const { result, rerender } = setup({ live: q1, held: true });
    rerender({ live: q2, held: true });
    expect(result.current.shown?.items).toEqual(q1.items);
    expect(result.current.pendingCount).toBe(2);
    expect(result.current.shown?.repos).toEqual(q2.repos);
  });
  it('applyNow → 반영·pending 0', () => {
    const { result, rerender } = setup({ live: q1, held: true });
    rerender({ live: q2, held: true });
    act(() => result.current.applyNow());
    expect(result.current.shown?.items).toEqual(q2.items);
    expect(result.current.pendingCount).toBe(0);
  });
  it('held 해제 → 자동 반영', () => {
    const { result, rerender } = setup({ live: q1, held: true });
    rerender({ live: q2, held: true });
    rerender({ live: q2, held: false });
    expect(result.current.shown?.items).toEqual(q2.items);
    expect(result.current.pendingCount).toBe(0);
  });
  it('live가 원래대로 돌아오면 pending 0', () => {
    const { result, rerender } = setup({ live: q1, held: true });
    rerender({ live: q2, held: true });
    rerender({ live: { ...q1, items: [...q1.items] }, held: true });
    expect(result.current.pendingCount).toBe(0);
  });
});
