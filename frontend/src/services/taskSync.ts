import { Task } from '../types';
import { STORAGE_KEYS, readStorage, removeStorage, writeStorage } from '../lib/storage';

export const TASKS_POLL_INTERVAL_MS = 3 * 60 * 1000;

function getConditionalHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const etag = readStorage(STORAGE_KEYS.tasksEtag);
  const lastModified = readStorage(STORAGE_KEYS.tasksLastModified);

  if (etag) headers['If-None-Match'] = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;

  return headers;
}

function storeConditionalHeaders(response: Response) {
  const etag = response.headers.get('ETag');
  const lastModified = response.headers.get('Last-Modified');

  if (etag) writeStorage(STORAGE_KEYS.tasksEtag, etag);
  if (lastModified) writeStorage(STORAGE_KEYS.tasksLastModified, lastModified);
}

export function invalidateTasksCacheHeaders() {
  removeStorage(STORAGE_KEYS.tasksEtag);
  removeStorage(STORAGE_KEYS.tasksLastModified);
}

export type TaskSyncResult =
  | { status: 'updated'; tasks: Task[] }
  | { status: 'not-modified' }
  | { status: 'error' };

export async function fetchTasksFromServer(): Promise<TaskSyncResult> {
  try {
    const response = await fetch('/api/v1/tasks/', {
      headers: getConditionalHeaders(),
    });

    if (response.status === 304) {
      return { status: 'not-modified' };
    }

    if (!response.ok) {
      return { status: 'error' };
    }

    storeConditionalHeaders(response);

    const data = await response.json();
    const tasks = Array.isArray(data) ? (data as Task[]) : [];

    return { status: 'updated', tasks };
  } catch {
    return { status: 'error' };
  }
}
