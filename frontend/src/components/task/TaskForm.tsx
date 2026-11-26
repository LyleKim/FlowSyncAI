import { useEffect, useId, useRef, type FormEvent } from 'react';
import type { TaskDraft } from '../../hooks/useTasks';
import type { TaskPriority, TaskStatus } from '../../types';
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER } from '../../lib/taskLabels';

interface TaskFormProps {
  values: TaskDraft;
  setField<K extends keyof TaskDraft>(k: K, v: TaskDraft[K]): void;
  onSubmit(): void;
  onCancel(): void;
  submitLabel: string;
  errors?: { title?: string };
  /** 기존 작업은 대화상자 상단 select가 상태를 맡으므로 끈다. */
  showStatus?: boolean;
}

const input = 'min-h-6 w-full rounded border border-border bg-surface px-2 py-1 text-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring aria-invalid:border-danger';
const lbl = 'mb-1 block text-body-sm font-semibold';

export function TaskForm({ values, setField, onSubmit, onCancel, submitLabel, errors, showStatus = true }: TaskFormProps) {
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  // 제출마다 새 errors 객체가 오므로, 제목 오류가 있으면 매번 제목 입력으로 포커스를 옮긴다.
  useEffect(() => {
    if (errors?.title) titleRef.current?.focus();
  }, [errors]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${id}-title`} className={lbl}>제목 (필수)</label>
        <input id={`${id}-title`} ref={titleRef} className={input} value={values.title} onChange={(e) => setField('title', e.target.value)}
          required aria-invalid={errors?.title ? true : undefined} aria-describedby={errors?.title ? `${id}-title-err` : undefined} />
        {errors?.title && <p id={`${id}-title-err`} role="alert" className="mt-1 text-body-sm text-danger">{errors.title}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-desc`} className={lbl}>설명</label>
        <textarea id={`${id}-desc`} rows={4} className={input} value={values.description} onChange={(e) => setField('description', e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {showStatus && (
          <div>
            <label htmlFor={`${id}-status`} className={lbl}>상태</label>
            <select id={`${id}-status`} className={input} value={values.status} onChange={(e) => setField('status', e.target.value as TaskStatus)}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-priority`} className={lbl}>우선순위</label>
          <select id={`${id}-priority`} className={input} value={values.priority} onChange={(e) => setField('priority', e.target.value as TaskPriority)}>
            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-category`} className={lbl}>분류</label>
          <input id={`${id}-category`} className={input} value={values.category} onChange={(e) => setField('category', e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-assignee`} className={lbl}>담당자</label>
          <input id={`${id}-assignee`} className={input} value={values.assigneeId} onChange={(e) => setField('assigneeId', e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-6 rounded border border-border px-3 py-1.5 text-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring">취소</button>
        <button type="submit" className="min-h-6 rounded bg-accent px-3 py-1.5 text-body-sm font-semibold text-accent-contrast focus-visible:outline-2 focus-visible:outline-focus-ring">{submitLabel}</button>
      </div>
    </form>
  );
}
