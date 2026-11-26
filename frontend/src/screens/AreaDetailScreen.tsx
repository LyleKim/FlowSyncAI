import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ROUTES } from '../routes';
import { useAreaDetail } from '../hooks/useAreaDetail';
import { useAreas } from '../hooks/useAreas';
import { useNow } from '../hooks/useNow';
import { areaHref, areasHref, parseAreaParams } from '../lib/areaRoute';
import { isReviewWaitingNoActivity, relativeDay, trendLabel } from '../lib/areaChart';
import { formatDate } from '../lib/date';
import { WeeklyBars } from '../components/areas/WeeklyBars';
import { WaitingPrTable } from '../components/areas/WaitingPrTable';
import type { AreaDetail } from '../types/areas';
import { FolderDescriptionNote } from '../components/areas/FolderDescriptionNote';

const focus = 'focus-visible:outline-2 focus-visible:outline-focus-ring';
const linkCls = `inline-flex min-h-6 items-center underline underline-offset-2 wrap-anywhere ${focus}`;
const btn = `min-h-9 rounded border border-border bg-surface-raised px-3 text-body-sm font-semibold ${focus}`;
const box = 'mt-4 rounded border border-border bg-surface-raised p-4 text-body-sm';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Skeleton({ rows }: { rows: number }) {
  // 정적 자리표시(애니메이션 없음)
  return (
    <div aria-hidden="true" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-10 rounded bg-surface-sunken" />)}
    </div>
  );
}

const firstLine = (s: string) => s.split('\n', 1)[0];

function Body({ d, repoId, days, names, now }: {
  d: AreaDetail; repoId: number; days: number; names: Map<string, string>; now: Date;
}) {
  const idle = d.weekly.every((w) => !(w.commits > 0));
  const coupled = [...d.coupledWith].sort((a, b) => b.count - a.count);
  const prs = d.waitingPullRequests;
  return (
    <>
      <p className="mt-1 text-body-sm text-muted wrap-anywhere">
        원래 경로 {d.pathPrefix} · 파일 {d.fileCount}개 · {trendLabel(d.trend)} · 마지막 변경 {relativeDay(d.lastChangeAt, now, days)}
      </p>
      {isReviewWaitingNoActivity(d) && (
        <p className="mt-1 text-body-sm font-semibold">
          <span aria-hidden="true">◆ </span>리뷰 대기 중, 활동 없음
        </p>
      )}
      <Link to={ROUTES.settings} className={`mt-2 text-body-sm ${linkCls}`}>이름 바꾸기</Link>
      {/* 특수 영역(@docs 등)은 폴더가 아니라 설명이 없다 */}
      {!d.pathPrefix.startsWith('@') && (
        <section aria-labelledby="area-role" className="mt-4 space-y-1">
          <h2 id="area-role" className="text-body-sm font-semibold">이 폴더의 역할</h2>
          {d.description ? (
            <FolderDescriptionNote d={d.description} />
          ) : (
            <p className="text-body-sm text-muted">아직 설명이 없어요. 영역 흐름의 전체 레포 분석에서 AI로 만들거나 직접 쓸 수 있어요.</p>
          )}
        </section>
      )}

      {/* 좁은 폭에서는 보조 열이 아래로 내려온다(사람 → 결합 → 경로) */}
      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <Section id="area-weekly" title="주간 활동(커밋)">
            {idle && <p className="text-body-sm">최근 {days}일 동안 이 영역에 커밋이 없어요</p>}
            {/* 26주(180일)는 이 영역 안에서만 가로로 움직인다 */}
            <div className="max-w-full overflow-x-auto">
              {/* 상세 응답엔 generatedAt이 없어 이번 주 판정은 현재 시각 기준 */}
              <WeeklyBars weekly={d.weekly} generatedAt={now.toISOString()} days={days} variant="detail" />
            </div>
          </Section>
          <Section id="area-waiting" title={`리뷰 대기 PR ${prs.length}건`}>
            {prs.length === 0 ? (
              <p className="text-body-sm">지금 리뷰 대기 PR이 없어요. 영역이 사라진 게 아니에요.</p>
            ) : (
              <WaitingPrTable repoId={repoId} areaId={d.id} prs={prs} now={now} />
            )}
          </Section>
          <Section id="area-commits" title="최근 커밋">
            {d.recentCommits.length === 0 ? (
              <p className="text-body-sm text-muted">보여 줄 커밋이 없어요.</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border text-body-sm">
                {d.recentCommits.map((c) => (
                  <li key={c.sha7} className="py-2">
                    <p className="wrap-anywhere">{firstLine(c.message)}</p>
                    <p className="text-caption text-muted wrap-anywhere">
                      {c.author} · {formatDate(c.date)} · <code>{c.sha7}</code>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <aside aria-label="영역 보조 정보" className="min-w-0 space-y-8 text-body-sm">
          <Section id="area-people" title="최근 변경한 사람">
            <p className="text-muted">물어볼 사람을 찾는 용도예요. 순위나 평가가 아니에요.</p>
            {d.authors.length === 0 ? (
              <p className="text-muted">최근 변경한 사람이 없어요.</p>
            ) : (
              <ul className="space-y-1">
                {d.authors.map((a) => <li key={a} className="wrap-anywhere">{a}</li>)}
              </ul>
            )}
          </Section>
          <Section id="area-coupled" title="함께 바뀐 영역">
            {coupled.length === 0 ? (
              <p className="text-muted">같은 커밋에서 함께 바뀐 영역이 없어요.</p>
            ) : (
              <ul className="space-y-1">
                {coupled.map((c) => (
                  <li key={c.areaId} className="flex flex-wrap gap-x-2">
                    <Link to={areaHref(c.areaId, { repoId, days })} className={linkCls}>{names.get(c.areaId) ?? c.areaId}</Link>
                    <span className="text-muted">커밋 {c.count}개</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section id="area-paths" title="포함된 경로(일부)">
            <ul className="space-y-1">
              {d.samplePaths.map((p) => <li key={p} className="wrap-anywhere"><code>{p}</code></li>)}
            </ul>
          </Section>
        </aside>
      </div>
    </>
  );
}

export default function AreaDetailScreen() {
  const { areaId = '' } = useParams();
  const [sp] = useSearchParams();
  const { repoId, days } = parseAreaParams(sp);
  const detail = useAreaDetail(repoId, areaId, days);
  // 함께 바뀐 영역의 이름 조회용. 실패해도 상세는 그대로 보여 준다
  const list = useAreas(repoId, days);
  const now = useNow();
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const [retrying, setRetrying] = useState(false);

  // 다른 영역으로 옮기면 "다시 시도 중" 표시를 지운다
  useEffect(() => setRetrying(false), [repoId, areaId, days]);

  const gone = detail.status === 'gone';
  useEffect(() => {
    // 사라진 영역: 안내 제목을 바로 읽도록 포커스를 옮긴다
    if (gone) h1Ref.current?.focus();
  }, [gone]);

  const back = repoId === null ? ROUTES.areas : areasHref({ repoId, days });
  const backLink = (
    <Link to={back} className={`text-body-sm ${linkCls}`}>
      <span aria-hidden="true">← </span>영역 흐름
    </Link>
  );
  const names = new Map((list.data?.areas ?? []).map((a) => [a.id, a.displayName]));
  const title = (text: string) => (
    <h1 ref={h1Ref} tabIndex={-1} className={`mt-2 text-xl font-bold wrap-anywhere ${focus}`}>{text}</h1>
  );
  const toOverview = (msg: string) => (
    <>
      {backLink}
      {title('영역 상세')}
      <div className={box}>
        <p>{msg}</p>
        <Link to={ROUTES.areas} className={`mt-3 ${linkCls}`}>영역 흐름 개요로 가기</Link>
      </div>
    </>
  );

  if (repoId === null) {
    return toOverview('어느 레포의 영역인지 알 수 없어요. 주소에 레포 정보가 빠졌거나 잘못됐어요. 영역 흐름 개요에서 다시 골라 주세요.');
  }
  if (detail.error?.code === 'repo_not_found') {
    return toOverview('이 레포는 더 이상 연결되어 있지 않아요. 영역 흐름 개요에서 다른 레포를 골라 주세요.');
  }
  if (gone) {
    return (
      <>
        {backLink}
        {title('이 영역은 더 이상 코드에서 보이지 않아요')}
        <div className={box}>
          <p>폴더가 옮겨졌거나 나뉘었을 수 있어요. 영역 흐름에서 지금 있는 영역을 다시 골라 주세요.</p>
          <Link to={back} className={`mt-3 ${linkCls}`}>영역 흐름으로 돌아가기</Link>
        </div>
      </>
    );
  }
  const pendingName = names.get(areaId) ?? areaId;
  if (detail.status === 'error') {
    return (
      <>
        {backLink}
        {title(pendingName)}
        {/* 오류일 때만 마운트: 다시 시도 → 로딩 → 재실패마다 새 노드라 다시 알린다 */}
        <div role="alert" className="mt-4 rounded border border-danger bg-surface-raised p-4 text-body-sm">
          <p className="font-semibold">이 영역을 불러오지 못했어요.</p>
          <p className="mt-1">영역 상세만 볼 수 없고 내 리뷰 요청은 그대로예요. 잠시 뒤에 다시 시도해 주세요.</p>
          <button
            type="button"
            onClick={() => {
              setRetrying(true);
              detail.retry();
            }}
            className={`mt-3 ${btn}`}
          >
            다시 시도
          </button>
        </div>
      </>
    );
  }
  if (!detail.data) {
    return (
      <>
        {backLink}
        {title(pendingName)}
        <p role="status" className="mt-4 text-body-sm text-muted">
          {retrying ? '다시 시도하는 중이에요' : '영역을 불러오는 중이에요'}
        </p>
        <div className="mt-2"><Skeleton rows={6} /></div>
      </>
    );
  }
  return (
    <>
      {backLink}
      {title(detail.data.displayName)}
      <Body d={detail.data} repoId={repoId} days={days} names={names} now={now} />
    </>
  );
}
