import { Link, Outlet, useSearchParams } from 'react-router';
import { useTasksContext } from '../hooks/TasksContext';
import { usePendingIds, useUndo } from '../hooks/useUndo';
import { filterTasks, searchTasks } from '../lib/taskFilters';
import { nextSort, parseTaskViewParams, sortTasks, type TaskSortKey } from '../lib/taskView';
import { STATUS_ORDER } from '../lib/taskLabels';
import { ROUTES } from '../routes';
import type { Task, TaskStatus } from '../types';
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

  // ponytail: T-T7이 useTaskView/TaskFilterBar로 교체할 임시 배선
  const vs = parseTaskViewParams(params);
  const sort = { key: vs.sort, dir: vs.dir };
  const onSortChange = (k: TaskSortKey) => setParams((p) => {
    const n = new URLSearchParams(p); const s2 = nextSort(sort, k); n.set('sort', s2.key); n.set('dir', s2.dir); return n;
  }, { replace: true });
  const visible = sortTasks(searchTasks(tasks.filter((t) => !pending.has(t.id)), q), vs.sort, vs.dir);

  const onDeleteTask = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    // 숨김은 Provider의 pendingIds가 담당하므로 hide/restore는 할 일이 없다.
    schedule({ label: `‘${t.title}’ 작업을 삭제했어요`, key: id, hide: () => {}, restore: () => {}, commit: () => deleteTask(id) });
  };
  const shown = filterTasks(visible, { status: status ?? undefined });
  const common = { tasks: shown, linkSearch: params.toString(), onMoveTask: moveTask, onDeleteTask: (t: Task) => onDeleteTask(t.id) };

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
          : view === 'board' ? <TaskBoard {...common} />
          : <TaskList {...common} sort={sort} onSortChange={onSortChange} />}
      </div>
      <Outlet />{/* /tasks/new, /tasks/:id 대화상자 */}
    </>
  );
}
