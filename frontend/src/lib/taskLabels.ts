import { Task, TaskPriority, TaskStatus } from '../types';

export const STATUS_ORDER: TaskStatus[] = ['todo', 'inprogress', 'review', 'done'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '할 일',
  inprogress: '진행 중',
  review: '리뷰 중',
  done: '완료',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  urgent: '긴급',
};

export const adjacentStatus = (s: TaskStatus, dir: -1 | 1): TaskStatus | null =>
  STATUS_ORDER[STATUS_ORDER.indexOf(s) + dir] ?? null;

// kind 우선(API 계약 §6); 없으면 id 접두사. sourceUrl로 판정하지 않는다(수동 작업도 PR URL을 가질 수 있음).
export const isPrTask = (t: Pick<Task, 'id' | 'kind'>): boolean =>
  t.kind ? t.kind === 'pr' : t.id.startsWith('pr-');
