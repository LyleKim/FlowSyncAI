import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ROUTES } from '../../routes';
import { formatClock } from '../../lib/repoCopy';

export type QueueNoticeKind = 'loading' | 'server_error' | 'no_repos' | 'login_unknown' | 'no_waiting';

interface Props {
  kind: QueueNoticeKind;
  login: string;
  repoCount?: number;
  lastSuccessAt?: string | null;
  onRetry?: () => void;
  children?: ReactNode;
}

const SLOW_MS = 10_000;
const link = 'underline focus-visible:outline-2 focus-visible:outline-focus-ring';
const btn =
  'min-h-6 rounded border border-border px-2 text-sm focus-visible:outline-2 focus-visible:outline-focus-ring';

function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" aria-busy="true" className="py-4">
      <p>{slow ? '계속 확인하는 중이에요. 다른 화면으로 가도 돼요' : '리뷰 요청을 확인하는 중이에요'}</p>
      <div aria-hidden="true" className="mt-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 rounded bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}

export function QueueNotice({ kind, login, repoCount = 0, lastSuccessAt, onRetry, children }: Props) {
  if (kind === 'loading') return <Loading />;
  const clock = lastSuccessAt ? formatClock(lastSuccessAt) : '';
  return (
    <div className="py-4" role={kind === 'server_error' ? 'alert' : undefined}>
      {kind === 'server_error' && (
        <>
          <p className="font-medium">서버에 연결할 수 없어요</p>
          <p className="text-sm">
            이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요. 지금은 리뷰 요청을 보여드릴 수 없어요.
          </p>
          {onRetry && (
            <button type="button" className={`${btn} mt-2`} onClick={onRetry}>
              다시 시도
            </button>
          )}
        </>
      )}
      {kind === 'no_repos' && (
        <>
          <p className="font-medium">아직 리뷰 요청을 가져올 레포가 없어요</p>
          <p className="text-sm">
            <Link to={ROUTES.settings} className={link}>레포 연결</Link>
          </p>
        </>
      )}
      {kind === 'login_unknown' && (
        <>
          <p className="font-medium">
            레포 {repoCount}개에서 “{login}”에게 온 리뷰 요청을 찾지 못했어요.
          </p>
          <p className="text-sm">정말 없는 걸 수도 있고, 로그인이 다른 이름일 수도 있어요.</p>
          <p className="text-sm">
            <Link to={ROUTES.settings} className={link}>로그인 확인</Link>
          </p>
        </>
      )}
      {kind === 'no_waiting' && (
        <>
          <p className="font-medium">지금 리뷰 대기 PR이 없어요</p>
          {clock && <p className="text-sm text-muted">{clock}에 가져왔어요</p>}
          <p className="text-sm">
            <Link to={ROUTES.areas} className={link}>영역 흐름 보기</Link>
          </p>
          {children}
        </>
      )}
    </div>
  );
}
