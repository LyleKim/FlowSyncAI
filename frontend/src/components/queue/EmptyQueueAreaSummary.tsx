import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ROUTES } from '../../routes';
import { fetchAreas } from '../../services/areasApi';
import { isAbort } from '../../lib/abort';
import { formatDate } from '../../lib/date';
import type { Area } from '../../types/areas';

type State = { s: 'loading' } | { s: 'error' } | { s: 'ok'; areas: Area[] };
const link = 'underline focus-visible:outline-2 focus-visible:outline-focus-ring';

export function EmptyQueueAreaSummary({ repoId, repoName }: { repoId: number; repoName: string }) {
  const [state, setState] = useState<State>({ s: 'loading' });
  useEffect(() => {
    const ac = new AbortController();
    setState({ s: 'loading' });
    fetchAreas(repoId, 30, { signal: ac.signal })
      .then((r) => {
        const areas = [...r.areas]
          .sort((a, b) => (b.lastChangeAt ? Date.parse(b.lastChangeAt) : -Infinity) - (a.lastChangeAt ? Date.parse(a.lastChangeAt) : -Infinity) || 0)
          .slice(0, 3);
        setState({ s: 'ok', areas });
      })
      .catch((e) => {
        if (!isAbort(e)) setState({ s: 'error' });
      });
    return () => ac.abort();
  }, [repoId]);

  if ((state.s === 'ok' && state.areas.length === 0)) return null;
  const all = (
    <Link to={ROUTES.areas} className={link}>영역 흐름 전체 보기</Link>
  );
  return (
    <section aria-busy={state.s === 'loading'} className={state.s === 'loading' ? undefined : 'mt-4 border-t border-border pt-3'}>
      {state.s === 'error' && (
        <p className="text-sm"><span>영역 흐름을 불러오지 못했어요</span> {all}</p>
      )}
      {state.s === 'ok' && (
        <>
          <h2 className="font-medium">다른 영역은 지금 이래요</h2>
          <p className="text-sm text-muted">{repoName} 기준이에요</p>
          <ul className="mt-2 space-y-1">
            {state.areas.map((a) => (
              <li key={a.id} className="text-sm">
                <Link to={ROUTES.area(a.id)} className={link}>{a.displayName}</Link>
                {a.lastChangeAt && <span className="text-muted"> · {formatDate(a.lastChangeAt)}</span>}
                <span> · </span>
                <span>{a.reviewWaiting.prCount > 0 ? `리뷰 대기 ${a.reviewWaiting.prCount}건` : '리뷰 대기 없음'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">{all}</p>
        </>
      )}
    </section>
  );
}
