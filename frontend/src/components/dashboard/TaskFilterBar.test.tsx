import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEW_STATE, type TaskViewState } from '../../lib/taskView';
import TaskFilterBar from './TaskFilterBar';

const counts = { all: 6, todo: 1, inprogress: 2, review: 2, done: 1 };
const assignees = [{ value: 'minji', label: 'minji', count: 2 }];
function setup(state: Partial<TaskViewState> = {}, props: { hasMe?: boolean; resultCount?: number } = {}) {
  const onChange = vi.fn();
  const full = { ...DEFAULT_VIEW_STATE, ...state };
  const ui = (s: TaskViewState, n = props.resultCount ?? 3) => (
    <TaskFilterBar state={s} onChange={onChange} assignees={assignees} counts={counts} hasMe={props.hasMe ?? true} resultCount={n} />
  );
  const r = render(ui(full));
  return { onChange, rerender: (s: Partial<TaskViewState>, n?: number) => r.rerender(ui({ ...DEFAULT_VIEW_STATE, ...s }, n)) };
}

describe('TaskFilterBar', () => {
  it('(e) hasMe=false면 "나" 옵션 없음', () => {
    setup({}, { hasMe: false });
    expect(within(screen.getByRole('combobox', { name: '담당자' })).queryByRole('option', { name: '나' })).toBeNull();
  });
  it('(e2) hasMe면 나, 담당자 없음, 개수 포함 옵션', () => {
    setup();
    const sel = screen.getByRole('combobox', { name: '담당자' });
    expect(within(sel).getByRole('option', { name: '나' })).toBeTruthy();
    expect(within(sel).getByRole('option', { name: '담당자 없음' })).toBeTruthy();
    expect(within(sel).getByRole('option', { name: 'minji (2)' })).toBeTruthy();
  });
  it('(f) 상태 칩 클릭, 보드에선 칩 없음', () => {
    const { onChange } = setup();
    const chip = screen.getByRole('button', { name: '리뷰 중 2' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({ status: 'review' });
  });
  it('(f2) 보드 보기에서는 상태 칩 그룹이 없다', () => {
    setup({ view: 'board' });
    expect(screen.queryByRole('group', { name: '상태 필터' })).toBeNull();
  });
  it('(g) 한글 조합 중에는 onChange 미호출', () => {
    const { onChange } = setup();
    const input = screen.getByRole('searchbox', { name: '작업 검색' });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '결ㅈ' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '결제' } });
    fireEvent.compositionEnd(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: '결제' });
  });
  it('(h) 외부 q 변경 시 입력값 갱신', () => {
    const { rerender } = setup({ q: 'a' });
    const input = screen.getByRole('searchbox', { name: '작업 검색' }) as HTMLInputElement;
    expect(input.value).toBe('a');
    rerender({ q: 'b' });
    expect(input.value).toBe('b');
  });
  it('(i) 필터 없으면 해제 버튼 없고, 있으면 기본 필터로 호출', () => {
    const a = setup();
    expect(screen.queryByRole('button', { name: '필터 해제' })).toBeNull();
    a.rerender({ kind: 'pr' });
    fireEvent.click(screen.getByRole('button', { name: '필터 해제' }));
    expect(a.onChange).toHaveBeenCalledWith({ q: '', status: 'all', kind: 'all', assignee: '' });
  });
  it('(j) 결과 수 status, 같은 값 리렌더 시 노드 유지', () => {
    const { rerender } = setup({}, { resultCount: 3 });
    const node = screen.getByRole('status');
    expect(node.textContent).toBe('작업 3개');
    rerender({}, 3);
    expect(screen.getByRole('status')).toBe(node);
  });
  it('(k) 모든 컨트롤이 이름을 가진다', () => {
    const { onChange } = setup();
    screen.getByRole('combobox', { name: '출처' });
    screen.getByRole('group', { name: '보기 전환' });
    fireEvent.click(screen.getByRole('button', { name: '보드' }));
    expect(onChange).toHaveBeenCalledWith({ view: 'board' });
    expect(screen.getByRole('button', { name: '목록' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByRole('combobox', { name: '출처' }), { target: { value: 'pr' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'pr' });
  });
  it('(l) animate- 클래스 없음', () => {
    const { } = setup({ kind: 'pr' });
    expect(document.body.innerHTML).not.toMatch(/animate-/);
  });
});
