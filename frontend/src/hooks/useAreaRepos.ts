import { useCallback, useEffect, useState } from 'react';
import { listWatchedRepos } from '../services/integrationsApi';
import type { WatchedRepo } from '../types';

export function useAreaRepos(): { status: 'loading' | 'ready' | 'error'; repos: WatchedRepo[]; retry(): void } {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; repos: WatchedRepo[] }>({
    status: 'loading',
    repos: [],
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false; // listWatchedRepos는 signal을 받지 않아 결과만 무시한다
    listWatchedRepos().then(
      (repos) => !cancelled && setState({ status: 'ready', repos }),
      () => !cancelled && setState({ status: 'error', repos: [] }),
    );
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading' }));
    setNonce((n) => n + 1);
  }, []);

  return { ...state, retry };
}
