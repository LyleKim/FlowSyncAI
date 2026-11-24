import { matchPath, Navigate, Route, Routes } from 'react-router';
import MyReviewsScreen from './screens/MyReviewsScreen';
import AreasScreen from './screens/AreasScreen';
import AreaDetailScreen from './screens/AreaDetailScreen';
import TasksScreen from './screens/TasksScreen';
import SettingsScreen from './screens/SettingsScreen';
import NotFoundScreen from './screens/NotFoundScreen';

export const ROUTES = {
  me: '/me',
  areas: '/areas',
  area: (id: string) => `/areas/${encodeURIComponent(id)}`,
  tasks: '/tasks',
  task: (id: string) => `/tasks/${encodeURIComponent(id)}`,
  newTask: '/tasks/new',
  settings: '/settings',
} as const;

// 내비 항목 경로 → 화면명
export const SCREEN_TITLES: Record<string, string> = {
  [ROUTES.me]: '내 리뷰 요청',
  [ROUTES.areas]: '영역 흐름',
  [ROUTES.tasks]: '전체 작업',
  [ROUTES.settings]: '설정',
};
export const NOT_FOUND_TITLE = '페이지를 찾을 수 없어요';

// AppRoutes와 같은 패턴. 일치하는 라우트가 없으면(/me/x, /tasks/a/b 등) NotFound 제목.
const TITLE_PATTERNS: [string, string][] = [
  ['/', SCREEN_TITLES[ROUTES.me]], // /me 리다이렉트 중 NotFound 제목이 깜빡이지 않게
  [ROUTES.me, SCREEN_TITLES[ROUTES.me]],
  [ROUTES.areas, SCREEN_TITLES[ROUTES.areas]],
  ['/areas/:areaId', SCREEN_TITLES[ROUTES.areas]],
  [ROUTES.tasks, SCREEN_TITLES[ROUTES.tasks]],
  [ROUTES.newTask, SCREEN_TITLES[ROUTES.tasks]],
  ['/tasks/:id', SCREEN_TITLES[ROUTES.tasks]],
  [ROUTES.settings, SCREEN_TITLES[ROUTES.settings]],
];

export function titleFor(pathname: string): string {
  return TITLE_PATTERNS.find(([p]) => matchPath(p, pathname))?.[1] ?? NOT_FOUND_TITLE;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={ROUTES.me} replace />} />
      <Route path={ROUTES.me} element={<MyReviewsScreen />} />
      <Route path={ROUTES.areas} element={<AreasScreen />} />
      <Route path="/areas/:areaId" element={<AreaDetailScreen />} />
      {/* 하위 경로는 Task 13이 대화상자로 채운다(TasksScreen의 Outlet, R1). */}
      <Route path={ROUTES.tasks} element={<TasksScreen />}>
        <Route path="new" />
        <Route path=":id" />
      </Route>
      <Route path={ROUTES.settings} element={<SettingsScreen />} />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}
