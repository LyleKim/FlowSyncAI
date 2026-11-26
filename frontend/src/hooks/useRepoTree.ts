import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchRepoTree } from '../services/folderTreeApi';
import type { RepoTree } from '../types/areas';
import { isAbort } from '../lib/abort';
import { toAreaError, type AreaError } from './useAreas';
import { usePendingIds } from './useUndo';

export const folderUndoKey = (repoId: number, path: string) => `folder-desc:${repoId}:${path}`;

/** 되돌리기 창(10초) 안에서 지운 것으로 보이는 폴더 경로 */
export function useHiddenFolders(repoId: number | null): ReadonlySet<string> {
  const pending = usePendingIds();
  return useMemo(() => {
    const prefix = `folder-desc:${repoId}:`;
    return new Set([...pending].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
  }, [pending, repoId]);
}

type State = { repoId: number | null; data: RepoTree | null; error: AreaError | null };

export function useRepoTree(repoId: number | null): {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: RepoTree | null;
  error: AreaError | null;
  /** 설명을 만들거나 고친 뒤 다시 읽는다(데이터는 유지한 채 교체) */
  reload(): void;
} {
  const [state, setState] = useState<State>({ repoId: null, data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (repoId === null) return;
    const ctl = new AbortController();
    fetchRepoTree(repoId, { signal: ctl.signal }).then(
      (data) => !ctl.signal.aborted && setState({ repoId, data, error: null }),
      (e) => {
        if (ctl.signal.aborted || isAbort(e)) return;
        setState((s) => ({ repoId, data: s.repoId === repoId ? s.data : null, error: toAreaError(e) }));
      },
    );
    return () => ctl.abort();
  }, [repoId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const same = repoId !== null && state.repoId === repoId;
  const data = same ? state.data : null;
  const error = same ? state.error : null;
  return { status: repoId === null ? 'idle' : data ? 'ready' : error ? 'error' : 'loading', data, error, reload };
}
