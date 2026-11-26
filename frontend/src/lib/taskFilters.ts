import { Task, TaskStatus } from '../types';
import { STATUS_ORDER } from './taskLabels';

export const searchTasks = (tasks: Task[], q: string): Task[] => {
  const n = q.trim().toLowerCase();
  if (!n) return tasks;
  return tasks.filter(t =>
    [t.title, t.description, t.category].some(s => (s ?? '').toLowerCase().includes(n)),
  );
};

export const countByStatus = (tasks: Task[]): Record<TaskStatus, number> & { all: number } => {
  const c = { all: tasks.length, todo: 0, inprogress: 0, review: 0, done: 0 };
  for (const t of tasks) c[t.status]++;
  return c;
};

export const filterTasks = (tasks: Task[], f: { status?: TaskStatus; assignee?: string }): Task[] =>
  tasks.filter(t => (!f.status || t.status === f.status) && (!f.assignee || t.assigneeId === f.assignee));

export const sortByCreatedAt = (tasks: Task[], dir: 'asc' | 'desc'): Task[] =>
  [...tasks].sort((a, b) => (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * (dir === 'asc' ? 1 : -1));
