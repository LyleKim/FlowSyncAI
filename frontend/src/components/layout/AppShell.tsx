import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import Sidebar from './Sidebar';
import { isStorageAvailable } from '../../lib/storage';
import { titleFor } from '../../routes';
import { useRouteAnnouncer } from '../../hooks/useRouteAnnouncer';
import { useReviewBadge } from '../../hooks/useReviewBadge';

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [storageOk] = useState(isStorageAvailable);
  const reviewBadge = useReviewBadge();
  useRouteAnnouncer(titleFor);

  return (
    <div className="flex h-screen flex-col bg-surface text-text md:flex-row">
      {/* HashRouter에서 #main 앵커는 라우트를 바꾸므로 현재 경로를 href로 두고 클릭 시 포커스만 옮긴다. */}
      <Link
        to={location}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-raised focus:px-3 focus:py-2 focus:outline-2 focus:outline-focus-ring"
      >
        본문으로 건너뛰기
      </Link>
      <Sidebar reviewBadge={reviewBadge} />
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
        {!storageOk && (
          <p role="status" className="mb-4 rounded-lg border border-warning px-4 py-2 text-sm">
            이 브라우저에서는 설정을 저장하지 못해요. 새로고침하면 처음 상태로 돌아가요.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
