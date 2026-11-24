import React, { useEffect, useState } from 'react';
import { X, Trash2, RefreshCw, Plus } from 'lucide-react';
import { SyncResult, WatchedRepo } from '../../types';
import {
  addWatchedRepo,
  formatLastSynced,
  formatSyncResult,
  listWatchedRepos,
  removeWatchedRepo,
} from '../../services/integrationsApi';

export interface SyncInfo {
  result?: SyncResult;
  error?: string;
}

interface Props {
  onClose: () => void;
  syncing: boolean;
  syncInfo: SyncInfo | null;
  onSync: () => void;
}

const input =
  'w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-blue-500';

export default function WatchedReposPanel({ onClose, syncing, syncInfo, onSync }: Props) {
  const [repos, setRepos] = useState<WatchedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [url, setUrl] = useState('');
  const [login, setLogin] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [confirmId, setConfirmId] = useState<WatchedRepo['id'] | null>(null);

  const load = () =>
    listWatchedRepos()
      .then((r) => { setRepos(r); setLoadError(''); })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);
  // 동기화가 끝나면 lastSyncedAt 갱신을 위해 다시 불러온다.
  useEffect(() => { if (!syncing) load(); }, [syncing]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || adding) return;
    setAdding(true);
    setAddError('');
    try {
      const repo = await addWatchedRepo(url.trim(), login.trim() || undefined);
      setRepos((p) => [...p, repo]);
      setUrl('');
      setLogin('');
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: WatchedRepo['id']) => {
    try {
      await removeWatchedRepo(id);
      setRepos((p) => p.filter((r) => r.id !== id));
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setConfirmId(null);
    }
  };

  const errors = syncInfo?.result?.errors ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="감시 레포"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">감시 레포</h2>
          <button onClick={onClose} aria-label="닫기" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          등록한 레포에서 내 리뷰가 요청된 PR이 자동으로 할 일 보드에 추가됩니다.
        </p>

        <form onSubmit={add} className="space-y-2 mb-4">
          <input className={input} placeholder="https://github.com/owner/repo" value={url} onChange={(e) => setUrl(e.target.value)} disabled={adding} />
          <div className="flex gap-2">
            <input className={input} placeholder="GitHub 로그인 (선택)" value={login} onChange={(e) => setLogin(e.target.value)} disabled={adding} />
            <button
              type="submit"
              disabled={adding || !url.trim()}
              className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={13} />{adding ? '추가 중...' : '추가'}
            </button>
          </div>
          {addError && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{addError}</p>}
        </form>

        {loadError && <p className="text-xs text-red-600 dark:text-red-400 mb-2" role="alert">{loadError}</p>}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 mb-4">
          {loading && <li className="py-3 text-xs text-slate-400">불러오는 중...</li>}
          {!loading && repos.length === 0 && <li className="py-3 text-xs text-slate-400">등록된 레포가 없습니다.</li>}
          {repos.map((r) => (
            <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{r.owner}/{r.name}</div>
                <div className="text-[11px] text-slate-400">마지막 동기화: {formatLastSynced(r.lastSyncedAt)}</div>
              </div>
              {confirmId === r.id ? (
                <div className="flex items-center gap-1.5 shrink-0 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">삭제할까요?</span>
                  <button onClick={() => remove(r.id)} className="px-2 py-1 rounded bg-red-600 text-white font-semibold">삭제</button>
                  <button onClick={() => setConfirmId(null)} className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">취소</button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(r.id)} aria-label={`${r.owner}/${r.name} 삭제`} className="p-1.5 text-slate-400 hover:text-red-500 shrink-0">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          onClick={onSync}
          disabled={syncing || repos.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? '동기화 중...' : '지금 동기화'}
        </button>

        {syncInfo?.result && !syncing && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{formatSyncResult(syncInfo.result)}</p>
        )}
        {syncInfo?.error && !syncing && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{syncInfo.error}</p>}
        {errors.length > 0 && !syncing && (
          <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-400">
            {errors.map((e, i) => (
              <li key={i}>
                {e}
                {/GITHUB_TOKEN/i.test(e) && ' (서버 .env에 GITHUB_TOKEN을 설정하세요)'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
