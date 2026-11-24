import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/** 라우트가 바뀌면 문서 제목을 갱신하고 본문(main)으로 포커스를 옮긴다. 첫 마운트에서는 포커스를 건드리지 않는다. */
export function useRouteAnnouncer(titleFor: (pathname: string) => string) {
  const { pathname } = useLocation();
  const prev = useRef(pathname);

  useEffect(() => {
    document.title = `${titleFor(pathname)} · FlowSyncAI`;
    if (prev.current === pathname) return;
    prev.current = pathname;
    document.getElementById('main')?.focus();
  }, [pathname, titleFor]);
}
