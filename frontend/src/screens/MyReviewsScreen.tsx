import { Link } from 'react-router';
import { useMyLogin } from '../hooks/useMyLogin';
import { usePrSyncContext } from '../hooks/PrSyncContext';
import MyLoginForm from '../components/settings/MyLoginForm';
import SyncStatusLine from '../components/common/SyncStatusLine';
import { ROUTES } from '../routes';

// 큐 항목 데이터는 백엔드 큐 계획이 채운다. 여기서는 셸과 빈 상태만 둔다.
export default function MyReviewsScreen() {
  const { login } = useMyLogin();
  const { status, syncNow } = usePrSyncContext();
  return (
    <>
      <h1 className="text-xl font-bold">내 리뷰 요청</h1>
      {!login ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">내 GitHub 로그인을 알려 주면 나에게 요청된 리뷰를 모아 보여 줘요.</p>
          <MyLoginForm onSaved={() => {}} />
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-sm">{login}의 큐</p>
            <SyncStatusLine status={status} onRefresh={() => void syncNow()} />
          </div>
          <p className="mt-6 text-sm text-muted">
            리뷰할 요청이 없어요. 팀의 변경 흐름은 <Link to={ROUTES.areas} className="underline">영역 흐름 보기</Link>에서 확인할 수 있어요.
          </p>
        </>
      )}
    </>
  );
}
