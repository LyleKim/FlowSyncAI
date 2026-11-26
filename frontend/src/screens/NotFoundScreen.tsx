import { Link } from 'react-router';
import { NOT_FOUND_TITLE, ROUTES } from '../routes';

export default function NotFoundScreen() {
  return (
    <>
      <h1 className="text-xl font-bold">{NOT_FOUND_TITLE}</h1>
      <p className="mt-2 text-sm text-muted">주소가 바뀌었거나 없는 화면이에요. 내 리뷰 요청에서 다시 시작해 주세요.</p>
      <Link to={ROUTES.me} className="mt-4 inline-block min-h-6 font-semibold text-accent underline focus-visible:outline-2 focus-visible:outline-focus-ring">
        내 리뷰 요청으로 가기
      </Link>
    </>
  );
}
