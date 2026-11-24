import { useCallback, useEffect, useState } from 'react';
import { fetchAreaDetail } from '../services/areasApi';
import type { AreaDetail } from '../types/areas';
import { isAbort, toAreaError, type AreaError } from './useAreas';

type Result = { key: string; data: AreaDetail | null; error: AreaError | null };

export function useAreaDetail(repoId: number | null, areaId: string, days: number): {
  status: 'loading' | 'ready' | 'gone' | 'error';
  data: AreaDetail | null;
  error: AreaError | null;
  retry(): void;
} {
  const key = `${repoId}:${areaId}:${days}`;
  const [result, setResult] = useState<Result>({ key: '', data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (repoId === null) return;
    const ctl = new AbortController();
    fetchAreaDetail(repoId, areaId, days, ctl.signal).then(
      (data) => !ctl.signal.aborted && setResult({ key, data, error: null }),
      (e) => !ctl.signal.aborted && !isAbort(e) && setResult({ key, data: null, error: toAreaError(e) }),
    );
    return () => ctl.abort();
  }, [repoId, areaId, days, key, nonce]);

  const retry = useCallback(() => {
    setResult({ key: '', data: null, error: null });
    setNonce((n) => n + 1);
  }, []);

  const same = result.key === key;
  const data = same ? result.data : null;
  const error = same ? result.error : null;
  const status = data ? 'ready' : error ? (error.code === 'area_not_found' ? 'gone' : 'error') : 'loading';
  return { status, data, error, retry };
}
