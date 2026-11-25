import { Fragment, useEffect, useRef, useState } from 'react';
import type { RepoSyncState } from '../../types/repoSync';
import { describeRepoError, formatClock } from '../../lib/repoCopy';

const btn =
  'min-h-6 rounded border border-border px-2 text-sm focus-visible:outline-2 focus-visible:outline-focus-ring aria-disabled:text-muted';

function RepoFailure({
  repo,
  retrying,
  onRetry,
  now,
}: {
  repo: RepoSyncState;
  retrying: boolean;
  onRetry: (id: number) => void;
  now?: Date;
}) {
  const [fallback, setFallback] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (fallback) areaRef.current?.focus();
  }, [fallback]);
  const v = describeRepoError(repo.repo, repo.lastError!, repo.lastSuccessAt, now);
  const clock = repo.lastSuccessAt ? formatClock(repo.lastSuccessAt) : '';
  const note = retrying ? '다시 확인하는 중' : v.retryDisabledReason;
  const noteId = `repo-fail-${repo.repoId}-note`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(v.adminCopy!);
    } catch {
      setFallback(true);
    }
  };
  return (
    <li className="py-2">
      <p className="font-medium">{v.title}</p>
      <p className="text-sm">{v.body}</p>
      {clock && <p className="text-sm text-muted">{clock} 기준</p>}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {v.canRetry && (
          <>
            <button
              type="button"
              className={btn}
              aria-disabled={note ? true : undefined}
              aria-describedby={note ? noteId : undefined}
              onClick={() => {
                if (!note) onRetry(repo.repoId);
              }}
            >
              이 레포만 다시 시도
            </button>
            {note && (
              <span id={noteId} className="text-sm text-muted">
                {note}
              </span>
            )}
          </>
        )}
        {v.adminCopy && (
          <button type="button" className={btn} onClick={copy}>
            관리자에게 보낼 내용 복사
          </button>
        )}
      </div>
      {fallback && (
        <textarea
          ref={areaRef}
          readOnly
          aria-label="관리자에게 보낼 내용"
          value={v.adminCopy}
          rows={3}
          className="mt-2 w-full rounded border border-border bg-surface p-2 text-sm"
        />
      )}
    </li>
  );
}

export function RepoFailureBanner({
  repos,
  allFailed,
  retryingRepoId,
  onRetry,
  now,
}: {
  repos: RepoSyncState[];
  allFailed: boolean;
  retryingRepoId: number | null;
  onRetry: (repoId: number) => void;
  now?: Date;
}) {
  const failed = repos.filter((r) => r.lastError !== null);
  if (failed.length === 0) return null;
  // key on <RepoFailure> directly gave TS2322; the Fragment carries it instead
  return (
    <div
      role={allFailed ? 'group' : 'alert'}
      aria-label="레포 가져오기 실패"
      className="mb-4 rounded-lg border border-warning bg-surface px-4 py-2"
    >
      <ul>
        {failed.map((r) => (
          <Fragment key={r.repoId}>
            <RepoFailure repo={r} retrying={retryingRepoId === r.repoId} onRetry={onRetry} now={now} />
          </Fragment>
        ))}
      </ul>
    </div>
  );
}
