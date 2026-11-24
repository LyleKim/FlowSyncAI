import { Link, Outlet, useSearchParams } from 'react-router';
import { useTasksContext } from '../hooks/TasksContext';
import { usePendingIds, useUndo } from '../hooks/useUndo';
import { searchTasks, sortByCreatedAt } from '../lib/taskFilters';
import { STATUS_ORDER } from '../lib/taskLabels';
import { ROUTES } from '../routes';
import type { TaskStatus } from '../types';
import TaskBoard from '../components/dashboard/TaskBoard';
import TaskList from '../components/dashboard/TaskList';

export default function TasksScreen() {
  const { tasks, moveTask, deleteTask, loadState } = useTasksContext();
  const { schedule } = useUndo();
  const pending = usePendingIds();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const view = params.get('view') === 'board' ? 'board' : 'list';
  const s = params.get('status');
  const status = STATUS_ORDER.includes(s as TaskStatus) ? (s as TaskStatus) : null;

  const set = (key: string, value: string | null) =>
    setParams((p) => { const n = new URLSearchParams(p); if (value) n.set(key, value); else n.delete(key); return n; }, { replace: true });

  const visible = sortByCreatedAt(searchTasks(tasks.filter((t) => !pending.has(t.id)), q), 'desc');

  const onDeleteTask = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    // 숨김은 Provider의 pendingIds가 담당하므로 hide/restore는 할 일이 없다.
    schedule({ label: `‘${t.title}’ 작업을 삭제했어요`, key: id, hide: () => {}, restore: () => {}, commit: () => deleteTask(id) });
  };
  const shared = { tasks: visible, onMoveTask: (id: string, st: TaskStatus) => void moveTask(id, st), onDeleteTask,
    selectedStatus: status, onSelectedStatusChange: (st: TaskStatus | null) => set('status', st) };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">전체 작업</h1>
        <Link to={ROUTES.newTask} className="inline-flex min-h-6 items-center rounded-lg bg-accent px-3 py-1.5 text-body-sm font-semibold text-accent-contrast focus-visible:outline-2 focus-visible:outline-focus-ring">새 작업</Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-body-sm">
          작업 검색
          <input type="search" value={q} onChange={(e) => set('q', e.target.value)} className="min-h-6 rounded border border-border bg-surface px-2" />
        </label>
        <div className="flex gap-1" role="group" aria-label="보기 전환">
          {([['board', '보드'], ['list', '목록']] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => set('view', v)}
              className="min-h-6 rounded border border-border px-3 py-1 text-body-sm aria-pressed:border-accent aria-pressed:font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring">{label}</button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {loadState === 'loading' ? <p className="text-sm text-muted">불러오는 중이에요.</p>
          : loadState === 'error' ? <p role="alert" className="text-sm text-danger">작업을 불러오지 못했어요.</p>
          : view === 'board' ? <TaskBoard {...shared} /> : <TaskList {...shared} />}
      </div>
      <Outlet />{/* /tasks/new, /tasks/:id 대화상자 */}
    </>
  );
}
