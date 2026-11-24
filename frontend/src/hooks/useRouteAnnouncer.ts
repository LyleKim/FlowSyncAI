import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { NOT_FOUND_TITLE, ROUTES } from '../routes';

const inTasks = (p: string) => p === ROUTES.tasks || p.startsWith(`${ROUTES.tasks}/`);

/**
 * 라우트가 바뀌면 문서 제목을 갱신하고 본문(main)으로 포커스를 옮긴다.
 * - 정상 화면으로 처음 열릴 때는 포커스를 옮기지 않는다(첫 Tab이 스킵 링크에 가도록).
 * - `/` → `/me` 리다이렉트는 이동으로 보지 않는다.
 * - 존재하지 않는 주소로 처음 열리면 안내를 바로 읽도록 main으로 옮긴다(Review Focus 2).
 */
export function useRouteAnnouncer(titleFor: (pathname: string) => string) {
  const { pathname } = useLocation();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    const title = titleFor(pathname);
    document.title = `${title} · FlowSyncAI`;
    const from = prev.current;
    prev.current = pathname;
    if (from === pathname) return; // StrictMode 재실행 등
    // /tasks ↔ /tasks/:id|new 는 목록 위 대화상자 열기/닫기: 포커스는 Dialog(제목·열었던 요소)가 맡는다.
    const move = from === null ? title === NOT_FOUND_TITLE : from !== '/' && !(inTasks(from) && inTasks(pathname));
    if (move) document.getElementById('main')?.focus();
  }, [pathname, titleFor]);
}
