import { useEffect, useMemo, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useTasksContext } from '../hooks/TasksContext';
import { usePendingIds, useUndo } from '../hooks/useUndo';
import { useMyLogin } from '../hooks/useMyLogin';
import { useTaskView } from '../hooks/useTaskView';
import { useListFocusFallback } from '../hooks/useListFocusFallback';
import { countByStatus } from '../lib/taskFilters';
import { applyTaskFilter, assigneeOptions, displayTitle, nextSort, sortTasks, type TaskSortKey, type TaskViewState } from '../lib/taskView';
import { ROUTES } from '../routes';
import type { Task } from '../types';
import TaskBoard from '../components/dashboard/TaskBoard';
import TaskList from '../components/dashboard/TaskList';
import TaskFilterBar from '../components/dashboard/TaskFilterBar';
import { TasksEmptyAll, TasksEmptyFiltered, TasksLoadError, TasksLoading } from '../components/dashboard/TaskCollectionStates';

export default function TasksScreen() {
  const { tasks, loadState, refresh, moveTask, deleteTask } = useTasksContext();
  const { schedule } = useUndo();
  const pending = usePendingIds();
  const { login } = useMyLogin();
  const { state, filter, search, set, clearFilters, activeFilters } = useTaskView();
  const { pathname } = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 되돌리기 창 동안 숨긴 작업은 폴링으로 다시 내려와도 제외(결정 30)
  const live = useMemo(() => tasks.filter((t) => !pending.has(t.id)), [tasks, pending]);
  const fctx = useMemo(() => ({ me: login }), [login]);
  const counts = useMemo(() => countByStatus(applyTaskFilter(live, { ...filter, status: 'all' }, fctx)), [live, filter, fctx]);
  const shown = useMemo(() => sortTasks(applyTaskFilter(live, filter, fctx), state.sort, state.dir), [live, filter, fctx, state.sort, state.dir]);
  const assignees = useMemo(() => assigneeOptions(live), [live]);
  const ids = useMemo(() => shown.map((t) => t.id), [shown]);
  useListFocusFallback(headingRef, ids);

  // 상세(/tasks/:id, /tasks/new)가 닫혔는데 포커스가 body면(딥링크로 열었거나 연 행이 삭제됨) 목록 제목으로.
  const wasChild = useRef(pathname !== ROUTES.tasks);
  useEffect(() => {
    const isChild = pathname !== ROUTES.tasks;
    if (wasChild.current && !isChild && (!document.activeElement || document.activeElement === document.body)) headingRef.current?.focus();
    wasChild.current = isChild;
  }, [pathname]);

  // 검색어 타이핑만 history를 쌓지 않는다
  const onChange = (patch: Partial<TaskViewState>) => {
    const keys = Object.keys(patch);
    set(patch, { replace: keys.length === 1 && keys[0] === 'q' });
  };
  const onSortChange = (k: TaskSortKey) => {
    const s = nextSort({ key: state.sort, dir: state.dir }, k);
    set({ sort: s.key, dir: s.dir }, { replace: true });
  };
  const onDeleteTask = (t: Task) =>
    // 숨김은 Provider의 pendingIds가 담당한다(R2)
    schedule({ label: `‘${displayTitle(t)}’ 작업을 삭제했어요`, key: t.id, hide: () => {}, restore: () => {}, commit: () => deleteTask(t.id) });

  const common = { tasks: shown, linkSearch: search, onMoveTask: moveTask, onDeleteTask };
  const body = loadState === 'loading' && tasks.length === 0 ? <TasksLoading />
    : loadState === 'error' && tasks.length === 0 ? <TasksLoadError hasStale={false} onRetry={() => void refresh()} />
    : (
      <>
        {loadState === 'error' && <TasksLoadError hasStale onRetry={() => void refresh()} />}
        {live.length === 0 ? <TasksEmptyAll />
          : shown.length === 0 ? <TasksEmptyFiltered activeFilters={activeFilters} onClear={clearFilters} />
          : state.view === 'board' ? <TaskBoard {...common} />
          : <TaskList {...common} sort={{ key: state.sort, dir: state.dir }} onSortChange={onSortChange} />}
      </>
    );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-heading font-bold">전체 작업</h1>
        <Link to={ROUTES.newTask} className="inline-flex min-h-9 items-center rounded border border-border bg-surface-raised px-3 text-body-sm font-medium hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus-ring">새 작업</Link>
      </div>
      <div className="mt-4">
        <TaskFilterBar state={state} onChange={onChange} assignees={assignees} counts={counts} hasMe={!!login} resultCount={shown.length} />
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">작업 목록</h2>
      <div className="mt-4">{body}</div>
      <Outlet />{/* /tasks/new, /tasks/:id 대화상자 */}
    </>
  );
}
