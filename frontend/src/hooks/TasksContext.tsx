import { createContext, useContext, type ReactNode } from 'react';
import { useTasks, type TasksApi } from './useTasks';

const TasksContext = createContext<TasksApi | null>(null);

export function TasksProvider({
  children,
  notify,
}: {
  children: ReactNode;
  notify?: (msg: string, kind: 'error' | 'info') => void;
}) {
  return <TasksContext.Provider value={useTasks({ notify })}>{children}</TasksContext.Provider>;
}

export function useTasksContext(): TasksApi {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasksContext는 TasksProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
