import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchReviewQueue, QueueFetchError } from '../services/reviewQueueApi';
import { TASKS_POLL_INTERVAL_MS } from '../services/taskSync';
import type { ReviewQueueResponse } from '../types/reviewQueue';
import { usePrSyncContext } from './PrSyncContext';
import { isAbort } from '../lib/abort';

export interface ReviewQueueState {
  data: ReviewQueueResponse | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  loadError: QueueFetchError | null;
  refreshError: QueueFetchError | null;
  refreshing: boolean;
  retryingRepoId: number | null;
  refresh(): Promise<void>;
  reload(): Promise<void>;
  retryRepo(repoId: number): Promise<void>;
}

type Snap = Pick<ReviewQueueState, 'data' | 'loadState' | 'loadError' | 'refreshError'> & { key: string | null };

const initial = (key: string | null): Snap => ({
  key,
  data: null,
  loadState: key ? 'loading' : 'idle',
  loadError: null,
  refreshError: null,
});

const toQueueError = (e: unknown) =>
  e instanceof QueueFetchError ? e : new QueueFetchError('network', '서버에 연결하지 못했어요');

const swallow = () => {};

export function useReviewQueue(login: string | null, teams?: string[]): ReviewQueueState {
  const { syncNow } = usePrSyncContext();
  const teamsKey = teams?.join(',') ?? '';
  const key = login ? `${login}|${teamsKey}` : null;
  const [snap, setSnap] = useState<Snap>(() => initial(key));
  const [refreshing, setRefreshing] = useState(false);
  const [retryingRepoId, setRetryingRepoId] = useState<number | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;
  const ctlRef = useRef<AbortController | null>(null);
  const getRef = useRef<Promise<void> | null>(null);
  const refreshRef = useRef<Promise<void> | null>(null);
  const retrySeq = useRef(0);

  // force: 진행 중 GET을 취소하고 새로 요청(서버 동기화 직후 최신 결과가 필요할 때)
  const get = useCallback(
    (force: boolean): Promise<void> => {
      // 로그인 변경·언마운트 뒤 이전 렌더의 refresh/retryRepo가 부르면 아무것도 하지 않는다(새 키의 요청을 취소하지 않도록)
      if (!login || keyRef.current !== key) return Promise.resolve();
      if (getRef.current && !force) return getRef.current;
      ctlRef.current?.abort();
      const ctl = new AbortController();
      ctlRef.current = ctl;
      // 응답 반영 직전에 "지금 로그인과 같은 요청인지" 한 번 더 확인
      const live = () => !ctl.signal.aborted && keyRef.current === key;
      const p: Promise<void> = fetchReviewQueue({ login, teams: teamsKey ? teamsKey.split(',') : undefined }, ctl.signal)
        .then(
          (data) => {
            if (live()) setSnap({ key, data, loadState: 'ready', loadError: null, refreshError: null });
          },
          (e) => {
            if (!live() || isAbort(e)) return;
            const err = toQueueError(e);
            // 실패해도 마지막 성공 데이터는 유지
            setSnap((s) =>
              s.key === key && s.data
                ? { ...s, refreshError: err }
                : { key, data: null, loadState: 'error', loadError: err, refreshError: null },
            );
          },
        )
        .finally(() => {
          if (getRef.current === p) getRef.current = null;
        });
      getRef.current = p;
      return p;
    },
    [login, teamsKey, key],
  );

  const reload = useCallback(() => get(false), [get]);

  const refresh = useCallback((): Promise<void> => {
    if (!login) return Promise.resolve();
    if (refreshRef.current) return refreshRef.current;
    setRefreshing(true);
    const p: Promise<void> = syncNow()
      .catch(swallow)
      .then(() => get(true))
      .finally(() => {
        if (refreshRef.current === p) refreshRef.current = null;
        setRefreshing(false);
      });
    refreshRef.current = p;
    return p;
  }, [login, syncNow, get]);

  const retryRepo = useCallback(
    async (repoId: number) => {
      if (!login) return;
      const seq = ++retrySeq.current;
      setRetryingRepoId(repoId);
      try {
        await syncNow(repoId).catch(swallow);
        await get(true);
      } finally {
        // 겹친 재시도 중 마지막 것만 표시를 지운다
        if (retrySeq.current === seq) setRetryingRepoId(null);
      }
    },
    [login, syncNow, get],
  );

  // 마운트·로그인 변경 시 1회 요청, 정리 때 진행 중 요청 취소(StrictMode 이중 실행에도 안전)
  useEffect(() => {
    keyRef.current = key;
    void reload();
    return () => {
      ctlRef.current?.abort();
      ctlRef.current = null;
      getRef.current = null;
      refreshRef.current = null;
      keyRef.current = null; // 언마운트 뒤 이전 요청 체인이 GET하지 않게(키 변경 시엔 다음 effect가 다시 설정)
    };
  }, [key, reload]);

  useEffect(() => {
    if (!login) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void reload();
    }, TASKS_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [login, reload]);

  // 키가 바뀐 직후 렌더에서도 이전 로그인의 데이터가 보이지 않게 한다
  const view = snap.key === key ? snap : initial(key);
  return {
    data: view.data,
    loadState: view.loadState,
    loadError: view.loadError,
    refreshError: view.refreshError,
    refreshing,
    retryingRepoId,
    refresh,
    reload,
    retryRepo,
  };
}
