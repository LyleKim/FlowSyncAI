import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Dialog } from '../common/Dialog';
import { useTasksContext } from '../../hooks/TasksContext';
import { useToasts } from '../../hooks/useToasts';
import { useUndo } from '../../hooks/useUndo';
import { useTaskForm } from '../../hooks/useTaskForm';
import { STATUS_LABEL, STATUS_ORDER, isPrTask } from '../../lib/taskLabels';
import { ROUTES } from '../../routes';
import type { TaskStatus } from '../../types';
import { ChecklistSection } from './ChecklistSection';
import { TaskForm } from './TaskForm';
import { TaskSummary } from './TaskSummary';

const btn = 'min-h-6 rounded border border-border px-3 py-1.5 text-body-sm focus-visible:outline-2 focus-visible:outline-focus-ring';

/** /tasks/new, /tasks/:id 라우트 요소. TasksScreen의 Outlet에 렌더된다. */
export default function TaskDetailDialog() {
  const { id } = useParams();
  const isNew = id === undefined;
  const { tasks, loadState, moveTask, createTask, updateTask, deleteTask } = useTasksContext();
  const { schedule } = useUndo();
  const { notify } = useToasts();
  const navigate = useNavigate();
  const location = useLocation();
  const task = isNew ? null : tasks.find((t) => t.id === id) ?? null;
  const form = useTaskForm(task);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<{ title?: string }>({});

  // 목록에서 열었으면 뒤로(필터·검색 유지, R13), 딥링크로 열었으면 목록으로 교체.
  const back = () => (location.key === 'default' ? navigate(ROUTES.tasks, { replace: true }) : navigate(-1));

  // 로드 후 없는 id, 또는 열어 둔 작업이 폴링으로 사라진 경우(Review Focus 2).
  const missing = !isNew && loadState === 'ready' && !task;
  const handled = useRef(false);
  useEffect(() => {
    if (!missing || handled.current) return;
    handled.current = true;
    notify('작업을 찾을 수 없어요. 이미 삭제됐을 수 있어요.');
    back();
    // /tasks/* 사이 이동은 라우트 안내가 포커스를 옮기지 않으므로 직접 main으로.
    document.getElementById('main')?.focus();
  });

  if (!isNew && !task) return null;

  const save = async () => {
    if (!form.values.title.trim()) {
      setErrors({ title: '제목을 입력해 주세요.' });
      return;
    }
    setErrors({});
    const payload = form.toPayload();
    if (!task) {
      const r = await createTask(payload);
      if (r.ok) navigate(ROUTES.task(r.value.id), { replace: true });
      return;
    }
    const { status, ...patch } = payload; // 상태는 상단 select(moveTask)가 맡는다
    const r = await updateTask(task.id, patch);
    if (r.ok) {
      form.reset();
      setEditing(false);
    }
  };

  const remove = () => {
    if (!task) return;
    // 숨김은 Provider의 pendingIds가 담당한다(R2).
    schedule({ label: `‘${task.title}’ 작업을 삭제했어요`, key: task.id, hide: () => {}, restore: () => {}, commit: () => deleteTask(task.id) });
    back();
  };

  const formProps = { values: form.values, setField: form.setField, onSubmit: () => void save(), errors };

  return (
    <Dialog open onClose={back} title={task ? task.title : '새 작업'} size="lg">
      {!task ? (
        <TaskForm {...formProps} submitLabel="만들기" onCancel={back} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {!isPrTask(task) && (
              <label className="flex items-center gap-2 text-body-sm">
                상태
                <select value={task.status} onChange={(e) => void moveTask(task.id, e.target.value as TaskStatus)}
                  className="min-h-6 rounded border border-border bg-surface px-1">
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </label>
            )}
            <button type="button" aria-pressed={editing} onClick={() => setEditing((v) => !v)} className={btn}>정보 수정</button>
            <button type="button" onClick={remove} className={`${btn} text-danger`}>작업 삭제</button>
          </div>
          {editing ? (
            <TaskForm {...formProps} showStatus={false} submitLabel="저장"
              onCancel={() => { form.reset(); setErrors({}); setEditing(false); }} />
          ) : (
            <TaskSummary task={task} />
          )}
          <ChecklistSection task={task} />{/* F-T14 */}
          {/* Task 15: ReviewSection */}
        </>
      )}
    </Dialog>
  );
}
