import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { listConnectedRepos, type ConnectedRepo } from '../../services/connectedReposApi';
import { removeWatchedRepo } from '../../services/integrationsApi';
import { usePrSyncContext } from '../../hooks/PrSyncContext';
import { usePendingIds, useUndo } from '../../hooks/useUndo';
import { useNow } from '../../hooks/useNow';
import ConnectRepoForm, { repoPendingKey as pendingKey } from './ConnectRepoForm';
import ConnectedRepoRow from './ConnectedRepoRow';

export default function ConnectedReposSection() {
  const id = useId();
  const [params] = useSearchParams();
  const { status, syncNow } = usePrSyncContext();
  const { schedule } = useUndo();
  const pending = usePendingIds();
  const now = useNow();
  const [repos, setRepos] = useState<ConnectedRepo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const retryingRef = useRef(false);

  const load = useCallback(() =>
    listConnectedRepos()
      .then((r) => { setRepos(r); setLoadFailed(false); })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoaded(true)), []);
  // 마운트 시, 그리고 가져오기가 끝날 때마다(syncing true→false) 레포별 상태를 다시 읽는다.
  const wasSyncing = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasSyncing.current === null || (wasSyncing.current && !status.syncing)) void load();
    wasSyncing.current = status.syncing;
  }, [status.syncing, load]);

  const visible = repos.filter((r) => !pending.has(pendingKey(r.id)));

  const fetchAll = async () => {
    if (status.syncing || visible.length === 0) return;
    await syncNow();
    await load();
  };

  const retry = async (repoId: number) => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetryingId(repoId);
    try {
      await syncNow(repoId);
    } finally {
      retryingRef.current = false;
      setRetryingId(null);
    }
    await load();
  };

  const onConnected = (repo: ConnectedRepo, alreadyConnected: boolean) => {
    setRepos((p) => (p.some((x) => x.id === repo.id) ? p : [...p, repo]));
    if (!alreadyConnected) void syncNow();
  };

  const disconnect = (r: ConnectedRepo) => {
    const name = `${r.owner}/${r.name}`;
    // 숨김·복원은 Provider의 대기 key(usePendingIds)가 맡는다. DELETE는 창이 끝날 때 한 번만.
    schedule({
      label: `${name} 연결을 해제했어요 · 팀 모두에게 적용돼요`,
      key: pendingKey(r.id),
      hide: () => {},
      restore: () => {},
      commit: async () => {
        try {
          await removeWatchedRepo(r.id);
          setRepos((p) => p.filter((x) => x.id !== r.id));
          return { ok: true };
        } catch {
          return { ok: false, error: `${name} 연결을 해제하지 못해 원래대로 되돌렸어요. 잠시 후 다시 시도해 주세요.` };
        }
      },
    });
  };

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-h`} className="text-base font-semibold">연결된 레포</h2>
        {visible.length > 0 && (
          <button type="button" onClick={() => void fetchAll()} aria-disabled={status.syncing}
            className="min-h-9 shrink-0 rounded border border-border px-3 text-sm aria-disabled:opacity-60">
            {status.syncing ? '가져오는 중…' : '지금 가져오기'}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        팀이 함께 쓰는 목록이에요. 여기서 가져온 리뷰 요청이 각자의 “내 리뷰 요청”이 돼요.
      </p>
      {loadFailed && (
        <div role="alert" className="space-y-1 rounded border border-border bg-surface-sunken p-3 text-sm">
          <p className="font-medium">서버에 연결할 수 없어요</p>
          <p className="text-muted">이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요.</p>
          <button type="button" onClick={() => void load()} className="min-h-9 rounded border border-border px-3">다시 시도</button>
        </div>
      )}
      {!loaded ? (
        <p className="text-sm text-muted">불러오는 중이에요</p>
      ) : visible.length > 0 ? (
        <ul className="divide-y divide-border">
          {visible.map((r) => (
            <ConnectedRepoRow key={r.id} repo={r} now={now} onRetry={(rid) => void retry(rid)} onDisconnect={disconnect} retrying={retryingId === r.id} />
          ))}
        </ul>
      ) : (
        !loadFailed && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">아직 리뷰 요청을 가져올 레포가 없어요</p>
            <p className="text-muted">레포를 연결하면 내게 온 리뷰 요청이 여기에 모여요.</p>
          </div>
        )
      )}
      <ConnectRepoForm onConnected={onConnected} autoFocus={params.get('focus') === 'repos'} />
    </section>
  );
}
