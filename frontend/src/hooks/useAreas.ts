import { useCallback, useEffect, useRef, useState } from 'react';
import { AreasApiError, fetchAreaAliases, fetchAreas } from '../services/areasApi';
import type { AreaAlias, AreasResponse } from '../types/areas';
import { isAbort } from '../lib/abort';

export const REFRESH_COOLDOWN_MS = 30_000;

export type AreaError = { status: number; code: string | null; message: string };

export function toAreaError(e: unknown): AreaError {
  if (e instanceof AreasApiError) return { status: e.status, code: e.code, message: e.message };
  return { status: 0, code: null, message: e instanceof Error ? e.message : '알 수 없는 오류' };
}

export { isAbort } from '../lib/abort';

type Result = { key: string; data: AreasResponse | null; error: AreaError | null; fails: number };
type Aliases = { repoId: number; list: AreaAlias[]; failed: boolean };

export function useAreas(repoId: number | null, days: number): {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: AreasResponse | null;
  aliases: AreaAlias[];
  aliasesFailed: boolean;
  error: AreaError | null;
  stale: boolean;
  refresh(): void;
  canRefresh: boolean;
  // 요청 진행 중(오류 화면에서 다시 시도 중 표시용)
  pending: boolean;
  // 실패할 때마다 1씩 증가: 같은 문구의 알림을 다시 마운트해 재낭독시키는 키
  failSeq: number;
} {
  const key = `${repoId}:${days}`;
  const [result, setResult] = useState<Result>({ key: '', data: null, error: null, fails: 0 });
  const [aliasState, setAliasState] = useState<Aliases | null>(null);
  const [nonce, setNonce] = useState(0);
  const [cooling, setCooling] = useState(false);
  const [inflight, setInflight] = useState(false);
  const refreshRef = useRef(false);
  const inflightRef = useRef(false);
  const lockRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (repoId === null) return;
    const ctl = new AbortController();
    const refresh = refreshRef.current;
    refreshRef.current = false;
    inflightRef.current = true;
    setInflight(true);
    fetchAreas(repoId, days, { refresh, signal: ctl.signal }).then(
      (data) => !ctl.signal.aborted && setResult((r) => ({ key, data, error: null, fails: r.fails })),
      (e) => {
        if (ctl.signal.aborted || isAbort(e)) return;
        // 같은 키의 직전 데이터는 유지(stale), 키가 바뀐 경우엔 null로 시작
        setResult((r) => ({ key, data: r.key === key ? r.data : null, error: toAreaError(e), fails: r.fails + 1 }));
      },
    ).finally(() => {
      if (ctl.signal.aborted) return;
      inflightRef.current = false;
      setInflight(false);
    });
    fetchAreaAliases(repoId, ctl.signal).then(
      (list) => !ctl.signal.aborted && setAliasState({ repoId, list, failed: false }),
      (e) => !ctl.signal.aborted && !isAbort(e) && setAliasState((a) => ({ repoId, list: a?.repoId === repoId ? a.list : [], failed: true })),
    );
    return () => ctl.abort();
  }, [repoId, days, key, nonce]);

  // 키가 바뀌면 갱신 제한을 초기화하고, 언마운트 시 타이머를 정리한다
  useEffect(() => {
    lockRef.current = false;
    setCooling(false);
    return () => clearTimeout(timerRef.current);
  }, [key]);

  const refresh = useCallback(() => {
    if (repoId === null || lockRef.current || inflightRef.current) return;
    lockRef.current = true;
    setCooling(true);
    timerRef.current = setTimeout(() => {
      lockRef.current = false;
      setCooling(false);
    }, REFRESH_COOLDOWN_MS);
    refreshRef.current = true;
    setNonce((n) => n + 1);
  }, [repoId]);

  const same = repoId !== null && result.key === key;
  const data = same ? result.data : null;
  const error = same ? result.error : null;
  const status = repoId === null ? 'idle' : data ? 'ready' : error ? 'error' : 'loading';
  const al = aliasState && aliasState.repoId === repoId ? aliasState : null;

  return {
    status,
    data,
    aliases: al?.list ?? [],
    aliasesFailed: al?.failed ?? false,
    error,
    stale: !!data && !!error,
    refresh,
    canRefresh: repoId !== null && !cooling && !inflight,
    pending: repoId !== null && inflight,
    failSeq: result.fails,
  };
}
