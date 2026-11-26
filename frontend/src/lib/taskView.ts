import { Task, TaskPriority, TaskStatus } from '../types';
import { ROUTES } from '../routes';
import { STATUS_ORDER, isPrTask } from './taskLabels';
import { searchTasks } from './taskFilters';

export type TaskView = 'list' | 'board';
export type TaskKindFilter = 'all' | 'pr' | 'manual';
export type TaskSortKey = 'createdAt' | 'title' | 'status' | 'priority';
type Dir = 'asc' | 'desc';
export type TaskViewFilter = { q: string; status: TaskStatus | 'all'; kind: TaskKindFilter; assignee: string };
export type TaskViewState = TaskViewFilter & { view: TaskView; sort: TaskSortKey; dir: Dir };

export const DEFAULT_VIEW_STATE: TaskViewState = {
  view: 'list', q: '', status: 'all', kind: 'all', assignee: '', sort: 'createdAt', dir: 'desc',
};

const Q_MAX = 200;
const oneOf = <T extends string>(v: string | null, ok: readonly T[], d: T): T =>
  ok.includes(v as T) ? (v as T) : d;

export function parseTaskViewParams(sp: URLSearchParams): TaskViewState {
  const d = DEFAULT_VIEW_STATE;
  const view = oneOf(sp.get('view'), ['list', 'board'], d.view); // get()은 첫 값
  return {
    view,
    q: (sp.get('q') ?? '').trim().slice(0, Q_MAX),
    status: view === 'board' ? 'all' : oneOf(sp.get('status'), STATUS_ORDER, d.status),
    kind: oneOf(sp.get('kind'), ['pr', 'manual'], d.kind),
    assignee: sp.get('assignee') ?? '',
    sort: oneOf(sp.get('sort'), ['createdAt', 'title', 'status', 'priority'], d.sort),
    dir: oneOf(sp.get('dir'), ['asc', 'desc'], d.dir),
  };
}

export function toTaskViewParams(s: Partial<TaskViewState>): URLSearchParams {
  const sp = new URLSearchParams();
  const d = DEFAULT_VIEW_STATE;
  for (const k of ['view', 'q', 'status', 'kind', 'assignee', 'sort', 'dir'] as const) {
    const v = s[k];
    if (v === undefined || v === d[k]) continue;
    if (k === 'status' && s.view === 'board') continue;
    sp.set(k, v);
  }
  return sp;
}

export function tasksPath(s: Partial<TaskViewState>): string {
  const qs = toTaskViewParams(s).toString();
  return qs ? `${ROUTES.tasks}?${qs}` : ROUTES.tasks;
}

export const taskLinkTo = (id: string, search: string) => ({ pathname: ROUTES.task(id), search });

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function applyTaskFilter(tasks: Task[], f: TaskViewFilter, ctx: { me: string | null }): Task[] {
  const hit = new Set(searchTasks(tasks, f.q));
  const q = norm(f.q);
  const me = norm(ctx.me);
  return tasks.filter(t => {
    if (q && !hit.has(t) && !norm(t.assigneeId).includes(q) && !norm(t.author).includes(q)) return false;
    if (f.status !== 'all' && t.status !== f.status) return false;
    if (f.kind !== 'all' && isPrTask(t) !== (f.kind === 'pr')) return false;
    switch (f.assignee) {
      case '': return true;
      case 'none': return !norm(t.assigneeId);
      case 'me': return !me || norm(t.assigneeId) === me || norm(t.author) === me;
      default: return norm(t.assigneeId) === norm(f.assignee);
    }
  });
}

const PRIORITY_ORDER: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export function sortTasks(tasks: Task[], key: TaskSortKey, dir: Dir): Task[] {
  const cmp = (a: Task, b: Task): number => {
    switch (key) {
      case 'title': return a.title.localeCompare(b.title, 'ko');
      case 'status': return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      case 'priority': return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      default: return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => sign * cmp(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function nextSort(cur: { key: TaskSortKey; dir: Dir }, key: TaskSortKey): { key: TaskSortKey; dir: Dir } {
  if (cur.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'createdAt' ? 'desc' : 'asc' };
}

export function assigneeOptions(tasks: Task[]): { value: string; label: string; count: number }[] {
  const m = new Map<string, { value: string; label: string; count: number }>();
  for (const t of tasks) {
    const label = (t.assigneeId ?? '').trim();
    if (!label) continue;
    const value = label.toLowerCase();
    const o = m.get(value);
    if (o) o.count++;
    else m.set(value, { value, label, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}

export const displayTitle = (t: Pick<Task, 'title'>): string => t.title.replace(/^\[PR\] /, '');
