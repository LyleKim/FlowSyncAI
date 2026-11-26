import { useEffect, type ReactNode } from 'react';
import { purgeLegacyKeys } from './lib/storage';
import { useTheme } from './hooks/useTheme';
import { ToastProvider, useToasts } from './hooks/useToasts';
import { TasksProvider, useTasksContext } from './hooks/TasksContext';
import { PrSyncProvider } from './hooks/PrSyncContext';
import { ReviewQueueProvider } from './hooks/ReviewQueueContext';
import { ToastHost } from './components/common/ToastHost';
import AppShell from './components/layout/AppShell';
import { AppRoutes } from './routes';

function TasksWithNotify({ children }: { children: ReactNode }) {
  const { notify } = useToasts();
  return <TasksProvider notify={notify}>{children}</TasksProvider>;
}

function PrSyncWithRefresh({ children }: { children: ReactNode }) {
  const { refresh } = useTasksContext();
  return <PrSyncProvider onCreated={refresh}>{children}</PrSyncProvider>;
}

// 라우터는 포함하지 않는다: main.tsx가 HashRouter로, 테스트가 MemoryRouter로 감싼다.
export default function App() {
  useTheme(); // html.dark 적용. 전환 UI는 설정 화면(Task 12).
  useEffect(() => purgeLegacyKeys(), []);

  return (
    <ToastProvider>
      <TasksWithNotify>
        <PrSyncWithRefresh>
          <ReviewQueueProvider>
            <AppShell>
              <AppRoutes />
            </AppShell>
          </ReviewQueueProvider>
        </PrSyncWithRefresh>
      </TasksWithNotify>
      <ToastHost />
    </ToastProvider>
  );
}
