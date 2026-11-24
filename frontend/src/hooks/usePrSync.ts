import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateTasksCacheHeaders, TASKS_POLL_INTERVAL_MS } from '../services/taskSync';
import { formatSyncResult, listWatchedRepos, syncPullRequests } from '../services/integrationsApi';
import { mockSyncStatus, toSyncStatus, type SyncStatusInfo } from '../services/syncStatus';

export interface PrSyncApi {
  status: SyncStatusInfo;
  syncNow(repoId?: number): Promise<void>;
  lastResultText: string;
}

export function usePrSync(deps: { onCreated: () => Promise<void> }): PrSyncApi {
  const [status, setStatus] = useState<SyncStatusInfo>(() => mockSyncStatus());
  const [lastResultText, setLastResultText] = useState('');
  const statusRef = useRef(status);
  const onCreatedRef = useRef(deps.onCreated);
  onCreatedRef.current = deps.onCreated;
  const inflight = useRef<Promise<void> | null>(null);

  const apply = (next: SyncStatusInfo) => {
    statusRef.current = next;
    setStatus(next);
  };

  const run = async (repoId?: number) => {
    try {
      if ((await listWatchedRepos()).length === 0) return apply({ ...statusRef.current, syncing: false });
      apply({ ...statusRef.current, syncing: true });
      const result = await (repoId === undefined ? syncPullRequests() : syncPullRequests(repoId));
      apply(toSyncStatus(result, statusRef.current));
      setLastResultText(formatSyncResult(result));
      if (result.created > 0) {
        invalidateTasksCacheHeaders();
        await onCreatedRef.current();
      }
    } catch (err) {
      apply(toSyncStatus(err instanceof Error ? err : new Error(String(err)), statusRef.current));
    }
  };

  // 진행 중이면 그 요청을 기다린다(레포별 재시도도 동일).
  const syncNow = useCallback((repoId?: number) => {
    if (!inflight.current) {
      inflight.current = run(repoId).finally(() => {
        inflight.current = null;
      });
    }
    return inflight.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void syncNow();
    const id = window.setInterval(() => void syncNow(), TASKS_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [syncNow]);

  return { status, syncNow, lastResultText };
}
