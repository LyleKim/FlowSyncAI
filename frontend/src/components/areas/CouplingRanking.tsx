import { Link } from 'react-router';
import { areaHref } from '../../lib/areaRoute';
import type { Area, AreasResponse } from '../../types/areas';

const TOP = 10;
const BAR_MAX_PX = 96;

interface Props {
  couplings: AreasResponse['couplings'];
  areas: Area[];
  repoId: number;
  days?: number;
}

// 결정 22: 원형 그래프 대신 순위 목록
export function CouplingRanking({ couplings, areas, repoId, days }: Props) {
  if (couplings.length === 0) return <p className="text-body-sm text-muted">함께 바뀐 영역이 없어요.</p>;
  const top = [...couplings].sort((x, y) => y.count - x.count).slice(0, TOP);
  const max = top[0].count || 1;
  const names = new Map(areas.map((a) => [a.id, a.displayName]));
  const name = (id: string) =>
    names.has(id) ? (
      <Link
        to={areaHref(id, { repoId, days })}
        className="inline-block min-h-6 font-semibold underline underline-offset-2 wrap-anywhere focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {names.get(id)}
      </Link>
    ) : (
      <span className="wrap-anywhere">{id}</span>
    );

  return (
    <>
      <ol aria-label="함께 바뀐 영역" className="space-y-3 text-body-sm">
        {top.map((c) => (
          <li key={`${c.a}|${c.b}`} className="space-y-1">
            <p className="wrap-anywhere">
              {name(c.a)} <span aria-hidden="true">↔</span>
              <span className="sr-only">그리고</span> {name(c.b)}
            </p>
            <p className="flex items-center gap-2 text-caption text-muted">
              <span>커밋 {c.count}개</span>
              <span aria-hidden="true" className="h-2 rounded-sm bg-muted" style={{ width: Math.max(4, (c.count / max) * BAR_MAX_PX) }} />
            </p>
          </li>
        ))}
      </ol>
      {couplings.length > TOP && (
        <p className="mt-2 text-caption text-muted">상위 {TOP}쌍만 보여요(전체 {couplings.length}쌍)</p>
      )}
    </>
  );
}
