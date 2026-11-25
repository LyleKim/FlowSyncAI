import { useEffect, useLayoutEffect, useRef, useState, type FC, type ReactNode, type RefObject } from 'react';
import { useReviewQueueContext } from '../hooks/ReviewQueueContext';
import { usePrSyncContext } from '../hooks/PrSyncContext';
import { useToasts } from '../hooks/useToasts';
import { useNow } from '../hooks/useNow';
import { useHold } from '../hooks/useHold';
import { useFrozenQueue } from '../hooks/useFrozenQueue';
import { useTabReturn } from '../hooks/useTabReturn';
import { aggregateSyncStatus } from '../lib/reviewQueue';
import { describeQueueDiff, diffQueue, nextFocusId } from '../lib/queueDiff';
import { formatClock } from '../lib/repoCopy';
import MyLoginForm from '../components/settings/MyLoginForm';
import SyncStatusLine from '../components/common/SyncStatusLine';
import { RepoFailureBanner } from '../components/queue/RepoFailureBanner';
import { QueueNotice } from '../components/queue/QueueNotice';
import { QueueBody } from '../components/queue/QueueBody';

const btn =
  'mb-3 min-h-6 rounded border border-border px-2 text-sm focus-visible:outline-2 focus-visible:outline-focus-ring';

// 펼친 그룹에서 지금 보이는 행 id(DOM 순서)
const rowEls = (box: HTMLElement | null, sel: string) => Array.from(box?.querySelectorAll<HTMLElement>(sel) ?? []);
const visibleRowIds = (box: HTMLElement | null) =>
  rowEls(box, 'ul:not([hidden]) > [data-row-id]').map((e) => e.dataset.rowId!);

// key prop을 받으려면 FC로 선언해야 한다(이 저장소에는 @types/react가 없어 일반 함수는 TS2322)
const Queue: FC<{ login: string; h1: RefObject<HTMLHeadingElement | null> }> = ({ login, h1 }) => {
  const { data: live, loadState, refreshError, refreshing, retryingRepoId, refresh, reload, retryRepo } =
    useReviewQueueContext();
  const { status } = usePrSyncContext();
  const { notify } = useToasts();
  const now = useNow();
  const { held, holdProps, release } = useHold();
  const { shown, pendingCount, applyNow } = useFrozenQueue(live, held);
  const [showDrafts, setShowDrafts] = useState(false);
  const [applyTick, setApplyTick] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const lastRow = useRef<string | null>(null);
  const restore = useRef<{ id: string | null; before: string[] } | null>(null);

  const repos = shown?.repos ?? [];
  const sync = aggregateSyncStatus(repos, refreshing || status.syncing);
  const allFailed = repos.length > 0 && repos.every((r) => r.lastError !== null);
  const clock = sync.lastSuccessAt ? formatClock(sync.lastSuccessAt) : '';

  const apply = () => {
    if (!live || !shown || pendingCount === 0) return;
    notify(describeQueueDiff(diffQueue(shown.items, live.items)) ?? `업데이트 ${pendingCount}건을 반영했어요`, 'info');
    restore.current = { id: lastRow.current, before: visibleRowIds(box.current) };
    applyNow();
  };
  // "지금 가져오기"로 시작한 갱신은 새 데이터가 렌더된 뒤 바로 반영. 첫 로드는 Provider 몫(R9: 마운트 refresh 없음)
  useEffect(() => {
    if (applyTick) apply();
  }, [applyTick]);
  const onRefresh = () => void refresh().then(() => setApplyTick((t) => t + 1));
  useTabReturn(() => void refresh());

  // 반영·재시도로 포커스된 요소가 사라졌으면 다음 행 → 그룹 제목 → h1 순으로 옮긴다.
  // 목록 밖으로 나가면 blur 없이 포커스가 빠진 것이라 보류도 푼다.
  useLayoutEffect(() => {
    const r = restore.current;
    if (!r) return;
    restore.current = null;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const after = visibleRowIds(box.current);
    const id = r.id && (after.includes(r.id) ? r.id : nextFocusId(r.before, r.id, after));
    const row = id ? rowEls(box.current, '[data-row-id]').find((e) => e.dataset.rowId === id) : undefined;
    const target = row?.querySelector<HTMLElement>('a, button') ?? box.current?.querySelector<HTMLElement>('[data-group-heading]');
    if (target) return target.focus();
    release();
    h1.current?.focus();
  });

  const wrapGroups = (groups: ReactNode) => (
    <div
      ref={box}
      {...holdProps}
      onFocusCapture={(e) => {
        holdProps.onFocusCapture();
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row-id]');
        if (row) lastRow.current = row.dataset.rowId!;
      }}
    >
      {pendingCount > 0 && (
        <button type="button" className={btn} onClick={apply}>
          업데이트 {pendingCount}건 · 반영하기
        </button>
      )}
      {groups}
    </div>
  );

  return (
    <>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="min-w-0 break-words text-sm">{login}의 큐</p>
        <SyncStatusLine status={sync} onRefresh={onRefresh} now={now} />
      </div>
      <RepoFailureBanner
        repos={repos}
        allFailed={allFailed}
        retryingRepoId={retryingRepoId}
        onRetry={(id) => void retryRepo(id)}
        now={now}
      />
      {refreshError && shown && (
        <p role="alert" className="mb-4 text-sm">
          {clock
            ? `서버에 연결할 수 없어요 · 마지막으로 가져온 시각 ${clock}. 아래는 그 시각 기준이에요.`
            : '서버에 연결할 수 없어요. 아래는 마지막으로 가져온 목록이에요.'}
        </p>
      )}
      {shown ? (
        <QueueBody
          data={shown}
          login={login}
          now={now}
          showDrafts={showDrafts}
          onShowDraftsChange={setShowDrafts}
          lastSuccessAt={sync.lastSuccessAt}
          truncated={sync.truncated}
          wrapGroups={wrapGroups}
        />
      ) : loadState === 'error' ? (
        <QueueNotice
          kind="server_error"
          login={login}
          onRetry={() => {
            restore.current = { id: null, before: [] };
            void reload();
          }}
        />
      ) : (
        <QueueNotice kind="loading" login={login} />
      )}
    </>
  );
};

export default function MyReviewsScreen() {
  const { login } = useReviewQueueContext();
  const h1 = useRef<HTMLHeadingElement>(null);
  return (
    <>
      <h1 ref={h1} tabIndex={-1} className="text-xl font-bold">
        내 리뷰 요청
      </h1>
      {login ? (
        // 로그인마다 보류·초안 토글 상태를 새로 시작해 이전 로그인의 행이 남지 않게 한다
        <Queue key={login} login={login} h1={h1} />
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">내 GitHub 로그인을 알려 주면 나에게 요청된 리뷰를 모아 보여 줘요.</p>
          <MyLoginForm variant="first-run" onSaved={() => {}} />
        </div>
      )}
    </>
  );
}
