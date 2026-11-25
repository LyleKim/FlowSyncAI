import type { ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ROUTES } from '../routes';
import { useAreaRepos } from '../hooks/useAreaRepos';
import { useAreas } from '../hooks/useAreas';
import { useNow } from '../hooks/useNow';
import { AREA_DAY_OPTIONS, type AreaSort, areasHref, parseAreaParams } from '../lib/areaRoute';
import { disconnectedAliases, sortAreas, summarizeAreas } from '../lib/areaChart';
import { AreaRows } from '../components/areas/AreaRows';
import { AreaNotices, analyzedAgo } from '../components/areas/AreaNotices';
import { CouplingRanking } from '../components/areas/CouplingRanking';
import type { Area } from '../types/areas';

const SORT_OPTIONS: { value: AreaSort; label: string }[] = [
  { value: 'recent', label: '최근 변경 순' },
  { value: 'waiting', label: '리뷰 대기 많은 순' },
  { value: 'name', label: '이름 순' },
];

const REFRESH_HINT = '분석 중이거나 방금 분석했어요. 잠시 뒤에 다시 할 수 있어요.';
const focus = 'focus-visible:outline-2 focus-visible:outline-focus-ring';
const btn = `min-h-9 rounded border border-border bg-surface-raised px-3 text-body-sm font-semibold aria-disabled:text-muted ${focus}`;
const linkBtn = `inline-flex min-h-9 items-center rounded border border-border px-3 text-body-sm font-semibold hover:bg-surface-sunken ${focus}`;
const selectCls = `min-h-9 max-w-full rounded border border-border bg-surface-raised px-2 text-body-sm ${focus}`;
const box = 'mt-4 rounded border border-border bg-surface-raised p-4 text-body-sm';

const md = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

function Title() {
  return <h1 className="text-xl font-bold">영역 흐름</h1>;
}

function Skeleton({ rows }: { rows: number }) {
  // 정적 자리표시(애니메이션 없음)
  return (
    <div aria-hidden="true" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-10 rounded bg-surface-sunken" />)}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      <label htmlFor={id} className="text-caption font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}

function WeeklyTable({ areas }: { areas: Area[] }) {
  const weeks = areas[0]?.weekly ?? [];
  return (
    <details className="mt-4">
      <summary className={`inline-block min-h-6 cursor-pointer text-body-sm font-semibold ${focus}`}>표로 보기</summary>
      {/* 주가 많으면(180일=26주) 이 영역 안에서만 가로로 움직인다. 최신 브라우저는 넘칠 때만 스크롤 영역을 포커스 가능하게 한다 */}
      <div className="mt-2 overflow-x-auto">
        <table className="border-collapse text-body-sm tabular-nums">
          <caption className="sr-only">영역별 주간 커밋 수(왼쪽이 가장 오래된 주, 열 머리글은 주 시작일)</caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className="px-2 py-1 text-left">영역</th>
              {weeks.map((w) => <th key={w.weekStart} scope="col" className="px-2 py-1 text-right">{md(w.weekStart)}</th>)}
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id} className="border-b border-border">
                <th scope="row" className="px-2 py-1 text-left font-normal wrap-anywhere">{a.displayName}</th>
                {a.weekly.map((w) => <td key={w.weekStart} className="px-2 py-1 text-right">{w.commits}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function AreasScreen() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { repoId, days, sort } = parseAreaParams(sp);
  const repos = useAreaRepos();
  const known = repos.status === 'ready' && repos.repos.some((r) => r.id === repoId);
  const areas = useAreas(known ? repoId : null, days);
  const now = useNow();

  if (repos.status === 'loading') {
    return (
      <>
        <Title />
        <p role="status" className="mt-4 text-body-sm text-muted">연결된 레포를 불러오는 중이에요</p>
        <div className="mt-2"><Skeleton rows={3} /></div>
      </>
    );
  }
  if (repos.status === 'error') {
    return (
      <>
        <Title />
        <div role="alert" className={box}>
          <p className="font-semibold">연결된 레포 목록을 읽지 못했어요.</p>
          <p className="mt-1">영역 흐름만 볼 수 없고 내 리뷰 요청은 그대로예요. 잠시 뒤에 다시 시도해 주세요.</p>
          <button type="button" onClick={repos.retry} className={`mt-3 ${btn}`}>다시 시도</button>
        </div>
      </>
    );
  }
  if (repos.repos.length === 0) {
    return (
      <>
        <Title />
        <div className={box}>
          <p>연결된 레포가 없어요. 영역 흐름은 레포를 연결하면 볼 수 있어요.</p>
          <Link to={ROUTES.settings} className={`mt-3 ${linkBtn}`}>설정에서 레포 연결하기</Link>
        </div>
      </>
    );
  }
  const first = repos.repos[0];
  if (repoId === null) return <Navigate to={areasHref({ repoId: first.id, days, sort })} replace />;
  if (!known || areas.error?.code === 'repo_not_found') {
    return (
      <>
        <Title />
        <div className={box}>
          <p>이 레포는 더 이상 연결되어 있지 않아요. 다른 레포의 영역 흐름을 볼 수 있어요.</p>
          <Link to={areasHref({ repoId: first.id })} className={`mt-3 ${linkBtn}`}>
            {first.owner}/{first.name} 영역 흐름 보기
          </Link>
        </div>
      </>
    );
  }

  const go = (p: { repoId?: number; days?: number; sort?: AreaSort }) => navigate(areasHref({ repoId, days, sort, ...p }));
  const { data, canRefresh, refresh } = areas;
  const sorted = data ? sortAreas(data.areas, sort) : [];
  const unreadable = areas.error?.code === 'github_unavailable';

  let body: ReactNode;
  if (!data && areas.status === 'error' && areas.pending) {
    // 다시 시도 중: 알림 대신 진행 상태만(알림은 한 번에 하나)
    body = (
      <div className="mt-4 space-y-2">
        <p role="status" className="text-body-sm text-muted">다시 시도하는 중이에요</p>
        <Skeleton rows={6} />
      </div>
    );
  } else if (!data && areas.status === 'error') {
    body = (
      // 실패할 때마다 새 노드로 마운트해 같은 문구도 다시 알린다
      <div key={areas.failSeq} role="alert" className="mt-4 rounded border border-danger bg-surface-raised p-4 text-body-sm">
        <h2 className="text-title font-semibold">{unreadable ? '이 레포를 읽을 수 없어요' : '영역을 분석하지 못했어요'}</h2>
        <p className="mt-1">영역 흐름만 볼 수 없고 내 리뷰 요청은 그대로예요.</p>
        <p className="mt-1">
          {unreadable && '레포 접근 권한이 바뀌었거나 GitHub에 잠시 닿지 않을 수 있어요. '}
          잠시 뒤에 다시 시도해 주세요. 위에서 다른 레포를 고를 수도 있어요.
        </p>
        <button
          type="button"
          aria-disabled={!canRefresh}
          aria-describedby={canRefresh ? undefined : 'areas-retry-hint'}
          onClick={() => canRefresh && refresh()}
          className={`mt-3 ${btn}`}
        >
          다시 시도
        </button>
        {!canRefresh && <p id="areas-retry-hint" className="mt-1 text-caption text-muted">{REFRESH_HINT}</p>}
      </div>
    );
  } else if (!data) {
    body = (
      <div className="mt-4 space-y-2">
        <p role="status" className="text-body-sm text-muted">최근 {days}일 커밋을 분석하는 중이에요(처음엔 조금 걸려요)</p>
        <Skeleton rows={6} />
      </div>
    );
  } else if (data.areas.length === 0) {
    body = (
      <div className={box}>
        <p>이 레포에서 나눌 영역을 찾지 못했어요. 위에서 다른 레포를 골라 보세요.</p>
      </div>
    );
  } else {
    body = (
      <>
        <p className="mt-4 text-body-sm text-muted">
          1칸 = 커밋 2개예요. 모든 영역이 같은 눈금이고 최대 8칸(16개)까지 그려요. 넘으면 맨 위에 짧은 선을 그어요.
          속이 빈 막대는 아직 끝나지 않은 이번 주예요. 점선은 데이터가 없다는 뜻이에요. 왼쪽이 가장 오래된 주, 오른쪽이 이번 주예요.
        </p>
        {areas.aliasesFailed && (
          <p role="status" className="mt-3 text-body-sm text-muted">붙인 영역 이름을 읽지 못해서 연결 끊김 이름이 빠졌을 수 있어요.</p>
        )}
        <p className="mt-3 text-body-sm">{summarizeAreas(data.areas, data.days, data.analyzedCommits, now)}</p>
        <div className="mt-4">
          <AreaRows
            areas={sorted}
            disconnected={disconnectedAliases(areas.aliases, data.areas)}
            generatedAt={data.generatedAt}
            days={data.days}
            repoId={repoId}
            now={now}
          />
        </div>
        <WeeklyTable areas={sorted} />
        <section aria-labelledby="areas-coupling" className="mt-8 space-y-3">
          <h2 id="areas-coupling" className="text-base font-semibold">함께 바뀐 영역</h2>
          <p className="text-body-sm text-muted">같은 커밋에서 함께 바뀐 횟수가 많은 순서예요.</p>
          <CouplingRanking couplings={data.couplings} areas={data.areas} repoId={repoId} days={data.days} />
        </section>
      </>
    );
  }

  return (
    <>
      <Title />
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field id="areas-repo" label="레포">
          <select id="areas-repo" value={repoId} onChange={(e) => go({ repoId: Number(e.target.value) })} className={selectCls}>
            {repos.repos.map((r) => <option key={r.id} value={r.id}>{r.owner}/{r.name}</option>)}
          </select>
        </Field>
        <Field id="areas-days" label="기간">
          <select id="areas-days" value={days} onChange={(e) => go({ days: Number(e.target.value) })} className={selectCls}>
            {AREA_DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}일</option>)}
          </select>
        </Field>
        <Field id="areas-sort" label="정렬">
          <select id="areas-sort" value={sort} onChange={(e) => go({ sort: e.target.value as AreaSort })} className={selectCls}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <button
          type="button"
          aria-disabled={!canRefresh}
          aria-describedby={canRefresh ? undefined : 'areas-refresh-hint'}
          onClick={() => canRefresh && refresh()}
          className={btn}
        >
          다시 분석하기
        </button>
      </div>
      {!canRefresh && (
        <p id="areas-refresh-hint" className="mt-1 text-caption text-muted">{REFRESH_HINT}</p>
      )}
      <div className="mt-4 space-y-1 rounded border border-border bg-surface-sunken p-3 text-body-sm">
        <p className="font-semibold">활동이에요. 진행률이 아니에요.</p>
        <p>막대는 커밋 수예요. 활동 적음은 커밋이 적다는 뜻이고 일이 끝났다는 뜻은 아니에요.</p>
        {data && (
          <p className="text-muted">{analyzedAgo(data.generatedAt, now)} · 분석한 커밋 {data.analyzedCommits}개</p>
        )}
      </div>
      {data && (
        <div className="mt-3 space-y-3">
          <AreaNotices data={data} stale={areas.stale} now={now} onExtend={() => go({ days: 90 })} />
        </div>
      )}
      {body}
    </>
  );
}
