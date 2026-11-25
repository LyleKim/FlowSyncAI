import { useId, useRef, useState, type FC } from 'react';
import type { ConnectedRepo } from '../../services/connectedReposApi';
import { describeRepoError, formatFetched } from '../../lib/repoCopy';

interface Props {
  repo: ConnectedRepo;
  now?: Date;
  onRetry: (id: number) => void;
  onDisconnect: (repo: ConnectedRepo) => void;
  retrying: boolean;
  rowRef?: (el: HTMLElement | null) => void;
}

const BTN = 'min-h-6 rounded border border-border px-2 text-sm aria-disabled:opacity-60';

// FC 타입: 이 저장소에는 @types/react가 없어 함수 선언형 컴포넌트에 key를 넘기면 tsc가 거부한다.
const ConnectedRepoRow: FC<Props> = ({ repo, now = new Date(), onRetry, onDisconnect, retrying, rowRef }) => {
  const id = useId();
  const name = `${repo.owner}/${repo.name}`;
  const view = repo.lastError ? describeRepoError(name, repo.lastError, repo.lastSuccessAt, now) : null;
  const [copied, setCopied] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const copyRef = useRef<HTMLInputElement>(null);
  const retryBlocked = !!view?.retryDisabledReason || retrying;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view!.adminCopy!);
      setCopied(true);
    } catch {
      setShowCopy(true);
      requestAnimationFrame(() => copyRef.current?.select());
    }
  };

  return (
    <li ref={rowRef} className="space-y-1 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 truncate text-sm font-medium">{name}</span>
        <span className={`rounded border px-1.5 text-xs ${view ? 'border-danger text-danger' : 'border-success text-success'}`}>
          {view ? '실패' : '정상'}
        </span>
        <span className="text-xs text-muted">{formatFetched(repo.lastSuccessAt, now)}</span>
        <button type="button" onClick={() => onDisconnect(repo)} aria-label={`${name} 연결 해제`} className={`${BTN} ml-auto`}>
          연결 해제
        </button>
      </div>
      {view && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{view.title}</p>
          <p className="text-muted">{view.body}</p>
        </div>
      )}
      {repo.truncated && <p className="text-sm text-muted">일부만 가져왔어요</p>}
      {view && (view.canRetry || view.adminCopy) && (
        <div className="flex flex-wrap items-center gap-2">
          {view.canRetry && (
            <>
              <button
                type="button"
                aria-disabled={retryBlocked}
                aria-describedby={view.retryDisabledReason ? `${id}-why` : undefined}
                onClick={() => { if (!retryBlocked) onRetry(repo.id); }}
                className={BTN}
              >
                다시 시도
              </button>
              {view.retryDisabledReason && <span id={`${id}-why`} className="text-xs text-muted">{view.retryDisabledReason}</span>}
            </>
          )}
          {view.adminCopy && (
            <button type="button" onClick={() => void copy()} className={BTN}>관리자에게 보낼 내용 복사</button>
          )}
          {copied && <span role="status" className="text-xs text-muted">복사했어요</span>}
        </div>
      )}
      {showCopy && view?.adminCopy && (
        <div className="space-y-1">
          <label htmlFor={`${id}-copy`} className="block text-xs text-muted">아래 내용을 직접 복사해 주세요</label>
          <input id={`${id}-copy`} ref={copyRef} readOnly value={view.adminCopy} onFocus={(e) => e.currentTarget.select()}
            className="min-h-9 w-full rounded border border-border bg-surface-sunken px-2 text-xs" />
        </div>
      )}
    </li>
  );
};

export default ConnectedRepoRow;
