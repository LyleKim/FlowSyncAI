import { Link } from 'react-router';
import { ROUTES } from '../routes';

export default function AreaDetailScreen() {
  return (
    <>
      <h1 className="text-xl font-bold">영역 상세</h1>
      <Link to={ROUTES.areas} className="mt-2 inline-block text-sm underline">영역 흐름으로 돌아가기</Link>
    </>
  );
}
