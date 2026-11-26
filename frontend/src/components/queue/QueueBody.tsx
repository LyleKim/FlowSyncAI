import { Fragment, type ReactNode } from 'react';
import type { ReviewQueueItem, ReviewQueueResponse } from '../../types/reviewQueue';
import { splitQueue, summarizeWaiting } from '../../lib/reviewQueue';
import { PrQueueRow } from './PrQueueRow';
import { PrCompactRow } from './PrCompactRow';
import { QueueGroupSection } from './QueueGroupSection';
import { QueueSummary } from './QueueSummary';
import { QueueNotice } from './QueueNotice';
import { EmptyQueueAreaSummary } from './EmptyQueueAreaSummary';

interface Props {
  data: ReviewQueueResponse;
  login: string;
  now: Date;
  showDrafts: boolean;
  onShowDraftsChange: (v: boolean) => void;
  lastSuccessAt: string | null;
  truncated: boolean;
  /** 그룹 목록(행 이동 보류 컨테이너 안에 들어갈 부분)을 감싸는 함수 */
  wrapGroups: (groups: ReactNode) => ReactNode;
}

/** 큐 데이터가 있을 때의 본문 분기(레포 0 / 로그인 의심 / 대기 0 / 정상). */
export function QueueBody({ data, login, now, showDrafts, onShowDraftsChange, lastSuccessAt, truncated, wrapGroups }: Props) {
  const { repos, items, knownLogin } = data;
  if (repos.length === 0) return <QueueNotice kind="no_repos" login={login} />;
  if (items.length === 0 && !knownLogin) return <QueueNotice kind="login_unknown" login={login} repoCount={repos.length} />;

  const split = splitQueue(items, showDrafts);
  const failed = new Map(repos.filter((r) => r.lastError !== null).map((r) => [r.repoId, r.lastSuccessAt]));
  const since = (i: ReviewQueueItem) => (failed.has(i.repoId) ? (failed.get(i.repoId) ?? null) : undefined);
  const row = (Row: typeof PrQueueRow) => (i: ReviewQueueItem) => (
    <Fragment key={i.id}>
      <Row item={i} now={now} unverifiedSince={since(i)} />
    </Fragment>
  );
  const groups = wrapGroups(
    <>
      <QueueGroupSection id="q-waiting" title="리뷰 대기" items={split.waiting} defaultOpen renderItem={row(PrQueueRow)} />
      <QueueGroupSection id="q-awaiting" title="작성자 응답 대기" items={split.awaitingAuthor} defaultOpen={false} renderItem={row(PrCompactRow)} />
      <QueueGroupSection id="q-closed" title="정리됨" hint="7일 동안 보관" items={split.closed} defaultOpen={false} renderItem={row(PrCompactRow)} />
    </>,
  );

  // 숨긴 초안만 대기 중이면 초안 토글이 필요하므로 빈 안내 대신 요약을 보인다
  if (split.waiting.length === 0 && split.hiddenDrafts === 0) {
    const areaRepo = repos.find((r) => r.lastSuccessAt);
    return (
      <>
        <QueueNotice kind="no_waiting" login={login} lastSuccessAt={lastSuccessAt}>
          {areaRepo && <EmptyQueueAreaSummary repoId={areaRepo.repoId} repoName={areaRepo.repo} />}
        </QueueNotice>
        {groups}
      </>
    );
  }

  const w = summarizeWaiting(split.waiting, now);
  return (
    <>
      <QueueSummary
        waitingCount={w.count}
        oldestLabel={w.oldestLabel}
        awaitingCount={split.awaitingAuthor.length}
        draftCount={split.draftCount}
        showDrafts={showDrafts}
        onShowDraftsChange={onShowDraftsChange}
        partial={failed.size > 0 && failed.size < repos.length}
        truncated={truncated}
      />
      {groups}
    </>
  );
}
