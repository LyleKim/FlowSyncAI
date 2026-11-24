import { Navigate, Route, Routes } from 'react-router';
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

// 최상위 경로 → 화면명. 하위 경로(/tasks/:id 등)는 첫 세그먼트로 찾는다.
export const SCREEN_TITLES: Record<string, string> = {
  [ROUTES.me]: '내 리뷰 요청',
  [ROUTES.areas]: '영역 흐름',
  [ROUTES.tasks]: '전체 작업',
  [ROUTES.settings]: '설정',
};
export const NOT_FOUND_TITLE = '페이지를 찾을 수 없어요';

export function titleFor(pathname: string): string {
  return SCREEN_TITLES['/' + (pathname.split('/')[1] ?? '')] ?? NOT_FOUND_TITLE;
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
