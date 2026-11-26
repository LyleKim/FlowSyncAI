import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTaskForm } from './useTaskForm';
import type { Task } from '../types';

const mk = (o: Partial<Task> = {}): Task => ({
  id: 't1', title: '제목', description: '설명', status: 'todo', priority: 'medium',
  category: '', assigneeId: '', subtasks: [], createdAt: '2026-11-20T00:00:00Z', ...o,
});

describe('useTaskForm', () => {
  it('새 작업은 빈 값과 initialStatus', () => {
    const { result } = renderHook(() => useTaskForm(null, 'review'));
    expect(result.current.values).toMatchObject({ title: '', description: '', status: 'review', priority: 'medium' });
    expect(result.current.isDirty).toBe(false);
  });

  it('같은 id의 서버 갱신: 수정한 필드는 보존, 안 건드린 필드는 갱신', () => {
    const { result, rerender } = renderHook(({ t }) => useTaskForm(t), { initialProps: { t: mk() } });
    act(() => result.current.setField('description', '내가 쓰는 중'));
    expect(result.current.isDirty).toBe(true);
    rerender({ t: mk({ title: '서버가 바꾼 제목', description: '서버 설명' }) });
    expect(result.current.values.description).toBe('내가 쓰는 중');
    expect(result.current.values.title).toBe('서버가 바꾼 제목');
  });

  it('id가 바뀌면 초기화, reset은 수정 내용을 버린다', () => {
    const { result, rerender } = renderHook(({ t }) => useTaskForm(t), { initialProps: { t: mk() } });
    act(() => result.current.setField('title', '수정'));
    rerender({ t: mk({ id: 't2', title: '다른 작업' }) });
    expect(result.current.values.title).toBe('다른 작업');
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setField('title', '또 수정'));
    act(() => result.current.reset());
    expect(result.current.values.title).toBe('다른 작업');
  });

  it('toPayload는 제목·설명을 다듬고 PR 메타 필드를 넣지 않는다', () => {
    const { result } = renderHook(() => useTaskForm(mk({ kind: 'pr', author: 'kim', sourceUrl: 'https://x' })));
    act(() => result.current.setField('title', '  공백  '));
    const p = result.current.toPayload();
    expect(p.title).toBe('공백');
    expect(p).not.toHaveProperty('kind');
    expect(p).not.toHaveProperty('author');
  });
});
