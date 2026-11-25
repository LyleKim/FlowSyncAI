import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ToastProvider, useToasts } from '../../hooks/useToasts';
import { TasksProvider, useTasksContext } from '../../hooks/TasksContext';
import { ToastHost } from '../common/ToastHost';
import { renderWithRouter } from '../../test/render';
import { routeFetch } from '../../test/routeFetch';
import type { Task } from '../../types';
import { ChecklistSection } from './ChecklistSection';

const subs = [
  { id: 's1', title: '로그 확인', completed: true },
  { id: 's2', title: '재현 테스트', completed: false },
  { id: 's3', title: '수정 배포', completed: false },
];
const mk = (o: Partial<Task> = {}): Task => ({
  id: 't1', title: '버그', description: '설명', status: 'todo', priority: 'medium', category: '',
  assigneeId: 'lee', subtasks: subs, createdAt: '2026-11-20T00:00:00Z', kind: 'manual', ...o,
});

let list: Task[] = [];
function Inner() {
  const { tasks, refresh } = useTasksContext();
  const t = tasks.find((x) => x.id === 't1');
  return <><button onClick={() => void refresh()}>폴링</button>{t && <ChecklistSection task={t} />}</>;
}
function Wrap() {
  const { notify } = useToasts();
  return <TasksProvider notify={notify}><Inner /></TasksProvider>;
}
const setup = (task: Task, extra: Parameters<typeof routeFetch>[0] = {}) => {
  list = [task];
  const r = routeFetch({ 'GET /api/v1/tasks/': () => ({ json: list }), ...extra });
  return { ...r, ...renderWithRouter(<ToastProvider><Wrap /><ToastHost /></ToastProvider>) };
};
afterEach(() => vi.unstubAllGlobals());

describe('ChecklistSection', () => {
  it('(a) 기본 접힘, summary에 완료/전체', async () => {
    setup(mk());
    const s = await screen.findByText('체크리스트 (1/3)');
    expect(s.closest('details')).not.toHaveAttribute('open');
  });

  it('(b) 토글은 PATCH, 실패하면 롤백', async () => {
    const { user, calls } = setup(mk(), { 'PATCH /api/v1/tasks/t1/subtasks/s2/': () => ({ status: 500 }) });
    const cb = await screen.findByRole('checkbox', { name: '재현 테스트', hidden: true });
    await user.click(cb);
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ completed: true }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '재현 테스트', hidden: true })).not.toBeChecked());
    expect(screen.getAllByText('체크리스트 항목을 변경하지 못했습니다.')).toHaveLength(1);
  });

  it('(c) 제안받기 성공: sub-ai- id로 PUT', async () => {
    const { user, calls } = setup(mk(), {
      'POST /api/v1/generate-checklist/': () => ({ json: { checklist: [{ title: 'A' }, { title: 'B' }] } }),
      'PUT /api/v1/tasks/t1/subtasks/': (r) => ({ json: r.body }),
    });
    await user.click(await screen.findByRole('button', { name: '체크리스트 제안받기', hidden: true }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT')!.body as { id: string }[];
    expect(put).toHaveLength(2);
    expect(put.every((i) => i.id.startsWith('sub-ai-'))).toBe(true);
    expect(await screen.findByText('체크리스트 (0/2)')).toBeInTheDocument();
  });

  it('(d) 502 → role=alert 안내, 재시도 가능', async () => {
    const { user, calls } = setup(mk(), { 'POST /api/v1/generate-checklist/': () => ({ status: 502, json: { error: 'x' } }) });
    const btn = await screen.findByRole('button', { name: '체크리스트 제안받기', hidden: true });
    await user.click(btn);
    expect((await screen.findByRole('alert')).textContent).toBe('AI 서버가 응답하지 않았어요. 잠시 뒤에 다시 시도해 주세요.');
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(btn);
    await waitFor(() => expect(calls.filter((c) => c.url.includes('generate-checklist'))).toHaveLength(2));
  });

  it('(e) 로딩 중 aria-disabled, 중복 호출 없음', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { calls } = setup(mk(), { 'PUT /api/v1/tasks/t1/subtasks/': (r) => ({ json: r.body }) });
    const base = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (i: RequestInfo | URL, init?: RequestInit) => {
      if (String(i).includes('generate-checklist')) {
        calls.push({ url: String(i), method: 'POST', body: undefined });
        await gate;
        return new Response(JSON.stringify({ checklist: [{ title: 'A' }] }), { status: 200 });
      }
      return base(i, init);
    }));
    const btn = await screen.findByRole('button', { name: '체크리스트 제안받기', hidden: true });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(btn);
    release();
    await screen.findByText('체크리스트 (0/1)');
    expect(calls.filter((c) => c.url.includes('generate-checklist'))).toHaveLength(1);
  });

  it('(f) 폴링으로 task가 갱신돼도 추가 입력값 유지', async () => {
    const { user } = setup(mk());
    const input = await screen.findByLabelText('새 항목', { selector: 'input' });
    await user.type(input, '작성 중');
    await user.click(screen.getByRole('button', { name: '폴링' }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('새 항목')).toHaveValue('작성 중');
  });

  it('(g) 삭제 버튼은 항목명을 이름에 포함하고 포커스 가능, 클릭 시 DELETE', async () => {
    const { user, calls } = setup(mk(), { 'DELETE /api/v1/tasks/t1/subtasks/s2/': () => ({ status: 204 }) });
    const del = await screen.findByRole('button', { name: '‘재현 테스트’ 삭제', hidden: true });
    del.focus();
    expect(del).toHaveFocus();
    await user.click(del);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  it('(h) 미반영 검토 문구는 정적, 항목 추가 가능', async () => {
    const { user, calls } = setup(mk({ hasUnreflectedReview: true }), {
      'POST /api/v1/tasks/t1/subtasks/': (r) => ({ json: { id: 'n1', ...(r.body as object) } }),
    });
    expect(await screen.findByText('새 역할 검토가 아직 체크리스트에 반영되지 않았어요')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '체크리스트 제안받기', hidden: true })).toHaveLength(1);
    await user.type(screen.getByLabelText('새 항목'), '문서화{Enter}');
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ title: '문서화', completed: false }));
    expect(await screen.findByText('체크리스트 (1/4)')).toBeInTheDocument();
    expect(screen.getByLabelText('새 항목')).toHaveValue('');
  });
});
