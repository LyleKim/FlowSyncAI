import { useId } from 'react';
import type { ConnectedRepo, QueueProbe } from '../../services/connectedReposApi';
import { describeRepoError } from '../../lib/repoCopy';

interface Props {
  login: string;
  repos: ConnectedRepo[];
  probe: QueueProbe | null;
  onChangeLogin: () => void;
  onRetry: () => void;
  onFinish: () => void;
}

const btn = 'min-h-9 rounded border border-border px-3 text-sm aria-disabled:opacity-60';

export default function FirstSyncResult({ login, repos, probe, onChangeLogin, onRetry, onFinish }: Props) {
  const id = useId();
  const rows = repos.map((r) => {
    const name = `${r.owner}/${r.name}`;
    return { r, name, err: r.lastError && describeRepoError(name, r.lastError, r.lastSuccessAt) };
  });
  const failed = rows.filter((x) => x.err);
  const okCount = rows.length - failed.length;
  const allFailed = rows.length > 0 && okCount === 0;
  const waiting = probe?.counts.waiting ?? 0;

  return (
    <div className="space-y-4">
      <h1 tabIndex={-1} className="text-xl font-bold">첫 가져오기 결과</h1>

      {/* 전 레포 실패면 건수를 말하지 않는다(성공처럼 보이지 않게). */}
      <div role="status" className="space-y-1 text-sm">
        {probe && !allFailed && (
          waiting > 0 ? <p className="font-semibold">레포 {okCount}개에서 리뷰 대기 {waiting}건을 찾았어요</p>
          : probe.knownLogin ? <p className="font-semibold">지금 리뷰 대기 PR이 없어요</p>
          : <p className="font-semibold">레포 {okCount}개에서 “{login}”에게 온 리뷰 요청을 찾지 못했어요. 정말 없는 걸 수도 있고, 로그인이 다른 이름일 수도 있어요.</p>
        )}
      </div>
      {probe && !allFailed && waiting === 0 && !probe.knownLogin && (
        <button type="button" onClick={onChangeLogin} className={btn}>로그인 확인</button>
      )}

      {failed.length > 0 && (
        <div role="alert" className="space-y-1 rounded border border-border bg-surface-sunken p-3 text-sm">
          <p className="font-semibold">{allFailed ? '레포를 하나도 확인하지 못했어요' : `레포 ${failed.length}개를 확인하지 못했어요`}</p>
          <p className="text-muted">아래에서 레포별 사유를 확인해 주세요.</p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded border border-border text-sm">
          {rows.map(({ r, name, err }) => (
            <li key={r.id} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-all font-semibold">{name}</span>
                {!err && <span className="text-success">확인했어요</span>}
              </div>
              {err && (
                <>
                  <p className="font-semibold text-danger">{err.title}</p>
                  <p className="text-muted">{err.body}</p>
                  {err.canRetry && (
                    <>
                      <button
                        type="button"
                        aria-label={`${name} 다시 시도`}
                        aria-disabled={!!err.retryDisabledReason}
                        aria-describedby={err.retryDisabledReason ? `${id}-${r.id}-why` : undefined}
                        onClick={() => { if (!err.retryDisabledReason) onRetry(); }}
                        className={btn}
                      >
                        다시 시도
                      </button>
                      {err.retryDisabledReason && <span id={`${id}-${r.id}-why`} className="ml-2 text-muted">{err.retryDisabledReason}</span>}
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm">
        {login}의 큐예요. 내 계정이 아니라면{' '}
        <button type="button" onClick={onChangeLogin} className="min-h-6 underline">로그인 바꾸기</button>
      </p>

      <div className="flex flex-wrap gap-2">
        {allFailed && failed.some((x) => x.err?.canRetry && !x.err.retryDisabledReason) && (
          <button type="button" onClick={onRetry} className={btn}>다시 시도</button>
        )}
        <button type="button" onClick={onFinish} className="min-h-9 rounded bg-accent px-3 text-sm font-semibold text-accent-contrast">
          내 리뷰 요청 보기
        </button>
      </div>
    </div>
  );
}
