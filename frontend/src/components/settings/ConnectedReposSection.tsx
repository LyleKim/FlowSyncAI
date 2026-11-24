import { useEffect, useId, useState, type FormEvent } from 'react';
import type { WatchedRepo } from '../../types';
import {
  addWatchedRepo,
  formatLastSynced,
  listWatchedRepos,
  removeWatchedRepo,
} from '../../services/integrationsApi';
import { usePrSyncContext } from '../../hooks/PrSyncContext';
import { usePendingIds, useUndo } from '../../hooks/useUndo';

export default function ConnectedReposSection() {
  const id = useId();
  const { status, syncNow, lastResultText } = usePrSyncContext();
  const { schedule } = useUndo();
  const pending = usePendingIds();
  const [repos, setRepos] = useState<WatchedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const load = () =>
    listWatchedRepos()
      .then((r) => { setRepos(r); setError(''); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);
  // 가져오기가 끝나면 마지막 가져온 시각을 갱신한다.
  useEffect(() => { if (!status.syncing) void load(); }, [status.syncing]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || adding) return;
    setAdding(true);
    setError('');
    try {
      const repo = await addWatchedRepo(url.trim());
      setRepos((p) => [...p, repo]);
      setUrl('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const remove = (r: WatchedRepo) =>
    schedule({
      label: `${r.owner}/${r.name} 연결을 해제했어요. 팀 모두에게 적용돼요`,
      key: `repo:${r.id}`,
      hide: () => {},
      restore: () => {},
      commit: async () => {
        try {
          await removeWatchedRepo(r.id);
          setRepos((p) => p.filter((x) => x.id !== r.id));
          return { ok: true };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
    });

  const visible = repos.filter((r) => !pending.has(`repo:${r.id}`));

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3">
      <h2 id={`${id}-h`} className="text-base font-semibold">연결된 레포</h2>
      <p className="text-sm text-muted">연결한 레포에서 내 리뷰가 요청된 PR을 가져와요. 연결은 팀 모두에게 적용돼요.</p>
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor={`${id}-url`} className="sr-only">레포 주소</label>
        <input
          id={`${id}-url`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          disabled={adding}
          className="min-h-9 w-full max-w-md rounded border border-border bg-surface-raised px-3 text-sm"
        />
        <button type="submit" disabled={adding || !url.trim()} className="min-h-9 rounded bg-accent px-3 text-sm font-medium text-accent-contrast disabled:opacity-60">
          {adding ? '추가하는 중' : '추가'}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted">불러오는 중이에요</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">연결된 레포가 없어요.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.owner}/{r.name}</div>
                <div className="text-xs text-muted">마지막으로 가져옴: {formatLastSynced(r.lastSyncedAt)}</div>
              </div>
              <button type="button" onClick={() => remove(r)} aria-label={`${r.owner}/${r.name} 연결 해제`} className="min-h-6 shrink-0 rounded border border-border px-2 text-sm">
                연결 해제
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void syncNow()} aria-disabled={status.syncing || repos.length === 0} className="min-h-9 rounded border border-border px-3 text-sm aria-disabled:opacity-60">
        {status.syncing ? '가져오는 중' : '지금 가져오기'}
      </button>
      {lastResultText && !status.syncing && <p className="text-sm text-muted">{lastResultText}</p>}
    </section>
  );
}
