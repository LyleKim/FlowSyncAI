import { useRef, useState } from 'react';
import { useTasksContext } from '../../hooks/TasksContext';
import { useFocusRescue } from '../../hooks/useFocusRescue';
import { useChecklistGenerator } from '../../hooks/useChecklistGenerator';
import type { Task } from '../../types';

const btn = 'min-h-6 rounded border border-border px-3 py-1.5 text-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring aria-disabled:opacity-60';

export function ChecklistSection({ task }: { task: Task }) {
  const { toggleSubtask, addSubtask, removeSubtask } = useTasksContext();
  const { generate, state, error } = useChecklistGenerator(task);
  const [draft, setDraft] = useState('');
  const done = task.subtasks.filter((s) => s.completed).length;
  const loading = state === 'loading';
  // 항목이 지워지면 이웃 항목 → 섹션 summary로 포커스를 옮긴다.
  const rescue = useFocusRescue('input, button', (el) => el.closest('details')?.querySelector('summary'));

  const adding = useRef(false);
  const add = async () => {
    const title = draft.trim();
    if (!title || adding.current) return;
    adding.current = true;
    try {
      const r = await addSubtask(task.id, title);
      if (r.ok) setDraft('');
    } finally {
      adding.current = false;
    }
  };

  return (
    <details className="mt-4 border-t border-border pt-3">
      <summary className="min-h-6 cursor-pointer text-body-sm font-semibold">체크리스트 ({done}/{task.subtasks.length}){task.hasUnreflectedReview && ' · 새 검토 미반영'}</summary>
      <div className="mt-3 flex flex-col gap-3">
        {task.hasUnreflectedReview && (
          <p className="text-body-sm text-warning">새 역할 검토가 아직 체크리스트에 반영되지 않았어요</p>
        )}
        <ul className="flex flex-col gap-1">
          {task.subtasks.map((s) => (
            <li key={s.id} ref={rescue} className="flex items-center gap-2">
              <label className="flex min-h-6 flex-1 items-center gap-2 text-body-sm">
                <input type="checkbox" checked={s.completed} onChange={(e) => void toggleSubtask(task.id, s.id, e.target.checked)} />
                <span className={s.completed ? 'text-muted line-through' : ''}>{s.title}</span>
              </label>
              <button type="button" aria-label={`‘${s.title}’ 삭제`} onClick={() => void removeSubtask(task.id, s.id)} className={`${btn} text-danger`}>삭제</button>
            </li>
          ))}
        </ul>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label className="flex flex-1 items-center gap-2 text-body-sm">
            새 항목
            <input value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-6 flex-1 rounded border border-border bg-surface px-2" />
          </label>
          <button type="submit" className={btn}>추가</button>
        </form>
        <div className="flex flex-col items-start gap-2">
          <button type="button" aria-disabled={loading} onClick={() => { if (!loading) void generate(); }} className={btn}>
            체크리스트 제안받기
          </button>
          {loading && <p role="status" className="text-caption text-muted">제안받는 중이에요…</p>}
          {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
        </div>
      </div>
    </details>
  );
}
