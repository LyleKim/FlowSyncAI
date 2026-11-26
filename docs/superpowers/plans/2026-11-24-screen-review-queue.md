# 내 리뷰 요청 화면 (`/me`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 첫 화면 `/me`에 리뷰 요청 큐(대기 시간 순 PR 카드, 그룹, draft 토글, 동기화 상태, 빈·오류·일부 실패 상태, 탭 복귀 갱신, 키보드 조작, 320px 리플로)를 구현한다.

**Architecture:** 데이터는 `services/reviewQueueApi.ts`(계약 §1·§2) → `hooks/useReviewQueue.ts`(마지막 성공 데이터 유지, 폴링·탭 복귀) → `useFrozenQueue`(포커스·호버 중 행 이동 보류) → `components/queue/*` 표현 컴포넌트 → `screens/MyReviewsScreen.tsx` 조립. 큐 표시 문구·판정은 `lib/reviewQueue.ts`의 순수 함수에 모아 테스트한다. 시각 값은 토큰 이름(`bg-surface`, `text-muted`, `border-border` 등)으로만 참조한다(Impeccable 단계에서 확정).

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind 4, Vitest 5 + jsdom + testing-library(기반 계획 Task 1이 설치), react-router v7. 새 의존성 없음.

**Spec:** `docs/ux/00-context.md`(확정 결정 1~40), `docs/ux/04-information-architecture.md`, `docs/ux/05-user-journeys.md`, `docs/ux/06-wireframes.md`(§3, 프레임 2~6), `docs/ux/07-fortify-include-review.md`, `docs/ux/wireframes/index.html`(`scr-queue*` 프레임), `docs/superpowers/plans/2026-11-24-api-contract.md`(§1 큐, §2 동기화 실행, §4.1 영역 목록), `docs/superpowers/plans/2026-11-24-frontend-foundation.md`(라우터·훅·컴포넌트 Interfaces). 프로젝트 규칙: `CLAUDE.md`.

**선행 조건:** 기반 계획 Task 1~12 완료(특히 `renderWithRouter`, `lib/storage`, `usePrSyncContext`(`syncNow(repoId?)`)/`SyncStatusLine`/`SyncStatusInfo`, **`types/repoSync.ts`·`lib/repoCopy.ts`(기반 T7 소유)**, `useToasts`, `ROUTES`, `useReviewBadge` 자리표시, `MyReviewsScreen` 셸), screen-settings T1(`useMyLogin`/`useMyTeams`), screen-area-flow T1(`types/areas.ts`·`services/areasApi.ts`의 `fetchAreas`). 실제 화면 동작 확인은 백엔드 큐 계획 완료 후. 단위 테스트는 `fetch`/모듈 모킹이라 백엔드 없이 진행 가능. 다른 계획에서 정의된 이름·시그니처는 재정의하지 않고 import만 한다.

## Global Constraints

- 제품 코드는 `frontend/`만 수정. `backend/`, 다른 화면 계획(영역 흐름·전체 작업·설정)이 소유한 파일은 아래 Task가 명시한 것 외에는 건드리지 않는다.
- 명령은 저장소 루트에서 실행: `npm test`(`vitest run`), `npm run lint`(`tsc --noEmit`), `npm run build`. 단일 파일은 `npx vitest run <경로>`. 테스트는 소스 옆 `*.test.ts(x)`.
- 라우트: `/me`. 화면명·내비 라벨 **내 리뷰 요청**. 그룹명: **리뷰 대기 / 작성자 응답 대기 / 정리됨 · 7일 동안 보관**(결정 16: 옛 라벨 "내가 리뷰함"은 쓰지 않는다). 용어: **지금 가져오기**, **N분 전 가져옴**(`SyncStatusLine`이 소유). "동기화"·"감시"·영어 병기 `( … )`·이모지 금지(07 §5 #46). 문장은 해요체, 오류·빈 상태는 "무슨 일 / 영향 / 지금 할 일"(07 §3.2~3.3).
- 동기화 상태·신선도 표시는 큐 제목 줄 **한 곳**(`SyncStatusLine`)에만(결정 24). 신선도는 마지막 **성공** 시각 기준(계약 §7-1). 레포별 상세 안내(어느 레포가 왜)는 제목 줄 바로 아래 배너로만 두고 별도 신선도 표시기를 만들지 않는다.
- 계약 보증 준수: 큐 숫자 = 화면에 보이는 행 수(숨긴 draft는 개수로 따로 표시), `truncated`면 "일부만 가져왔어요", 실패한 레포의 행은 직전 데이터 유지 + "확인 안 됨", `group`/`closedReason`은 서버 값을 그대로 쓴다(재판정 금지), 경과 시간은 `requestedAt`으로 프런트가 계산.
- GET은 일반 `fetch`(조건부 헤더를 직접 다루지 않는다: `Cache-Control: private, must-revalidate`이므로 브라우저가 ETag/304를 처리). POST는 `postJson()`만.
- 대기 시간은 숫자·굵기로만 표현. 빨강·불꽃·경고 아이콘·깜박임 금지(조작적 압박 거부). "리뷰 없이 머지됨"은 중립 배지.
- 새 코드에서 `<div onClick>`/`<span onClick>` 금지, 아이콘 전용 버튼 `aria-label`, 호버 전용 컨트롤 금지, 상호작용 요소 24×24px 이상, `outline-none`은 대체 포커스 링과 함께만, `animate-pulse|ping|bounce` 금지, 12px 미만 글자 금지, 고정 폭(`w-64` 등)은 `md:` 이상에서만, 긴 제목·레포명은 `min-w-0 break-words`.
- localStorage는 `lib/storage.ts`로만. 사용자 입력 URL이 아닌 서버 응답의 `url`도 `https?:`일 때만 링크로 렌더.
- 레포 상태 타입은 기반 `types/repoSync.ts`의 `RepoSyncState`/`RepoError`만 쓴다(`QueueRepoStatus`·`QueueRepoError`를 새로 정의하지 않는다). 레포 오류 문구·재시도 판정은 기반 `lib/repoCopy.ts`의 `describeRepoError`·`formatClock`을 쓴다. 레포별 재시도는 `usePrSyncContext().syncNow(repoId)`뿐이며 이 계획에 별도 sync API 함수를 만들지 않는다. 내 로그인·팀은 `useMyLogin()`/`useMyTeams()`로 읽는다(`getMyLogin` 직접 호출 금지).
- 테스트용 `fetch` 라우팅 헬퍼는 `frontend/src/test/routeFetch.ts`(screen-settings T2 소유)를 재사용한다. 이 계획의 `fixtures/reviewQueue.ts`와 이름이 겹치지 않으며, 이 계획이 먼저 필요하면 같은 시그니처로 만들고 소유권은 설정 계획에 둔다. 단순한 `vi.stubGlobal('fetch')` 직접 사용도 허용.
- 커밋 메시지는 한국어 `type: 요약` + 시스템이 지정한 Co-Authored-By 줄.

## Review Focus

1. **로그인 전환 중 늦게 온 응답**: 로그인 A로 요청한 응답이 로그인 B로 바꾼 뒤 도착해도 B 화면에 A의 큐가 나타나지 않는다(남의 큐를 내 것으로 믿는 사고, 07 F6). (Task 3)
2. **읽는 중 목록이 움직임**: 행에 포커스·호버가 있는 동안 폴링·탭 복귀 결과가 행을 옮기거나 지우지 않고 "업데이트 N건 · 반영하기"로 쌓인다. 반영으로 포커스 행이 사라지면 다음 행(없으면 그룹 제목)으로 포커스가 가고 `body`로 떨어지지 않는다. (Task 4, 8)
3. **없음과 못 가져옴의 혼동**: 레포 0개 / 로그인 의심 0건 / 진짜 0건 / 서버 연결 실패 / 일부 레포 실패 / 전체 실패가 서로 다른 문구·행동이고, 실패 시 이전 목록은 유지되며 `role="alert"`는 같은 오류에 1개뿐이다. (Task 6, 7, 8)
4. **긴 문자열과 많은 항목**: 공백 없는 긴 PR 제목·레포명·로그인, 대기 200건, `truncated: true`에서 320px 가로 스크롤이 없고, 한 번에 렌더는 50건 + "더 보기"이며 요약 숫자는 전체 대기 수와 같다. (Task 5, 6, 9)
5. **이상한 값**: 미래 `requestedAt`(기기 시계 오차)은 음수 없이 "방금", 파싱 불가 시각은 "NaN" 대신 "알 수 없음", `size`가 `null`이면 "변경 규모 알 수 없음"(0으로 위장 금지), `url`이 `javascript:`면 링크를 만들지 않는다. (Task 2, 5)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `frontend/src/types/reviewQueue.ts` | 계약 §1 응답 타입 |
| `frontend/src/test/fixtures/reviewQueue.ts` | `makeQueueItem/makeRepo/makeQueue` 테스트 픽스처 |
| `frontend/src/services/reviewQueueApi.ts` | 큐 GET(동기화 POST는 기반 `usePrSync`가 소유) |
| `frontend/src/lib/reviewQueue.ts` | 표시 문구·그룹 분리·집계 순수 함수 |
| `frontend/src/lib/queueDiff.ts` | 큐 두 스냅샷 비교, 변경 안내 문구, 포커스 후보 |
| `frontend/src/hooks/{useReviewQueue,useTabReturn,useNow,useFrozenQueue,useHold}.ts`, `hooks/ReviewQueueContext.tsx`, `hooks/useReviewBadge.ts`(기반 자리표시 교체) | 데이터·갱신 시점·행 이동 보류, 앱 전역 큐 상태(사이드바 배지와 화면이 한 인스턴스 공유) |
| `frontend/src/components/queue/*.tsx` | `PrQueueRow, PrCompactRow, QueueGroupSection, QueueSummary, RepoFailureBanner, QueueNotice, EmptyQueueAreaSummary` |
| `frontend/src/screens/MyReviewsScreen.tsx` | 조립(기반 Task 12의 셸을 대체) |

---

### Task 1: 타입 · 픽스처 · `reviewQueueApi`

**Files:**
- Create: `frontend/src/types/reviewQueue.ts`, `frontend/src/test/fixtures/reviewQueue.ts`, `frontend/src/services/reviewQueueApi.ts`, `frontend/src/services/reviewQueueApi.test.ts`

**Interfaces:**
- Produces (`types/reviewQueue.ts`, 계약 §1 필드명 그대로):
  - `type QueueGroupKey = 'waiting' | 'awaiting_author' | 'closed'`
  - (레포 상태는 기반 `types/repoSync.ts`의 `RepoSyncState`를 그대로 쓴다 — 재정의 금지)
  - `interface ReviewQueueItem { id: string; repoId: number; repo: string; number: number; title: string; url: string; author: string; isDraft: boolean; prState: 'open'|'merged'|'closed'; group: QueueGroupKey; requestKind: 'direct'|'team'; viaTeam: string | null; requestedAt: string; requestedAtSource: 'event'|'pr_created'; reRequested: boolean; myReview: { state: 'APPROVED'|'CHANGES_REQUESTED'|'COMMENTED'|'DISMISSED'; submittedAt: string } | null; size: { additions: number; deletions: number; changedFiles: number } | null; closedAt: string | null; mergedAt: string | null; closedReason: 'merged'|'closed'|'request_withdrawn'|null; mergedWithoutMyReview: boolean; updatedAt: string }` (`size`의 `null` 허용은 06 "알 수 없음" 대응, 계약은 객체)
  - `interface ReviewQueueResponse { login: string; knownLogin: boolean; repos: RepoSyncState[]; counts: { waiting: number; awaitingAuthor: number; closed: number }; items: ReviewQueueItem[] }`
- Produces (`reviewQueueApi.ts`):
  - `class QueueFetchError extends Error { kind: 'login_required'|'server'|'network'; status?: number }`
  - `fetchReviewQueue(p: { login: string; teams?: string[]; closedWithinDays?: number }, signal?: AbortSignal): Promise<ReviewQueueResponse>` — 기본 `closedWithinDays=7`
- Produces (픽스처): `makeQueueItem(over?: Partial<ReviewQueueItem>): ReviewQueueItem`, `makeRepo(over?: Partial<RepoSyncState>): RepoSyncState`, `makeQueue(over?: Partial<ReviewQueueResponse>): ReviewQueueResponse`(`counts`를 `items`에서 계산해 항상 일치). 기본 항목은 계약 §1 예시(#58) 값.
- Consumes: `RepoSyncState`(기반 `types/repoSync.ts`). `teams`는 호출자(`ReviewQueueProvider`)가 `useMyTeams().teams`(settings T1)로 넘긴다.

- [ ] **Step 1: 실패 테스트** `reviewQueueApi.test.ts`(`vi.stubGlobal('fetch')`): (a) URL이 정확히 `/api/v1/integrations/review-queue/?login=octocat&closedWithinDays=7`, `teams:['Acme/Web','acme/api']`이면 `&teams=acme%2Fweb,acme%2Fapi`(소문자·정렬 불변); (b) 로그인 `'a b&c'`는 인코딩됨; (c) 400 → `kind:'login_required'`, 500/502 → `'server'`(`status` 보존), `fetch` reject → `'network'`, `AbortError`는 그대로 던짐; (d) JSON 본문이 객체가 아니거나 `items`가 배열이 아니면 `kind:'server'`.
- [ ] **Step 2:** `npx vitest run frontend/src/services/reviewQueueApi.test.ts` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 내 팀 저장·정규화는 settings T1이 소유하므로 이 Task는 `lib/storage.ts`를 건드리지 않는다.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 리뷰 요청 큐 타입·API 클라이언트·테스트 픽스처 추가`

### Task 2: `lib/reviewQueue.ts` 순수 로직

**Files:** Create: `frontend/src/lib/reviewQueue.ts`, `frontend/src/lib/reviewQueue.test.ts`

**Interfaces:**
- Consumes: Task 1 타입, `SyncStatusInfo`(`services/syncStatus.ts`), `RepoSyncState`(`types/repoSync.ts`) — 모두 foundation Task 7이 export.
- Produces:
  - `const WAITING_RENDER_CAP = 50`
  - `waitLabel(requestedAt: string, source: ReviewQueueItem['requestedAtSource'], now: Date): string` — `event`: "방금 요청됨" / "요청 후 N분" / "요청 후 N시간" / "요청 후 N일"; `pr_created`: "방금 올라옴" / "올라온 지 N분|시간|일". 1분 미만·미래는 "방금…", 파싱 불가는 "대기 시간을 알 수 없어요". 경계: 60분→"1시간", 24시간→"1일".
  - `waitBasisLabel(source): string` — "리뷰 요청 기준" | "PR 생성 기준"
  - `formatChangeSize(size: ReviewQueueItem['size']): string` — "+120 −14 · 파일 6개", `null`이면 "변경 규모 알 수 없음"; `changeSizeSpoken(size): string` — "추가 120줄, 삭제 14줄, 파일 6개"
  - `myReviewLabel(r: ReviewQueueItem['myReview'], now: Date): string | null` — "내 최신 리뷰: 승인함 · 어제" 형식(상태: 승인함/변경 요청함/코멘트 남김/무효화됨; 시각은 `N분 전|N시간 전|어제|N일 전`), 없으면 `null`
  - `closedBadge(i: Pick<ReviewQueueItem,'closedReason'|'mergedWithoutMyReview'>): string` — 머지됨 / 리뷰 없이 머지됨 / 닫힘 / 리뷰 요청이 취소됨
  - `splitQueue(items: ReviewQueueItem[], showDrafts: boolean): { waiting: ReviewQueueItem[]; awaitingAuthor: ReviewQueueItem[]; closed: ReviewQueueItem[]; draftCount: number; hiddenDrafts: number }` — draft 숨김은 `waiting`·`awaiting_author`에만 적용, `waiting`은 `requestedAt` 오름차순으로 재정렬(안정), `draftCount`는 숨김 여부와 무관한 전체 draft 수
  - `summarizeWaiting(waiting: ReviewQueueItem[], now: Date): { count: number; oldestLabel: string | null }` — `oldestLabel`은 "N일|N시간|N분"
  - `aggregateSyncStatus(repos: RepoSyncState[], syncing: boolean): SyncStatusInfo` — `lastSuccessAt`=성공 시각이 있는 레포 중 **가장 오래된 것**(없으면 `null`), `error`=레포가 1개 이상이고 **전부** 실패일 때만 우선순위 `auth > rate_limit > not_found > upstream > unknown`의 첫 오류(`resetAt`은 rate_limit 중 가장 늦은 값), 일부만 실패면 `null`, `truncated`=하나라도 true
  - (레포 오류 문구 `describeRepoError`·`RepoErrorView`·`formatClock`은 이 파일에 두지 않는다 — 기반 Task 7의 `lib/repoCopy.ts`를 import)

- [ ] **Step 1: 실패 테스트**: `waitLabel`(미래 시각·59초→"방금 요청됨", 59분/60분/23시간/24시간/4일 경계, `'not-a-date'`→"대기 시간을 알 수 없어요", `pr_created` 문구); `formatChangeSize(null)`; `splitQueue`(섞인 순서의 waiting이 정렬됨, `showDrafts=false`면 draft가 waiting·awaiting에서 빠지고 `hiddenDrafts`/`draftCount` 정확, closed의 항목은 영향 없음, 빈 배열); `summarizeWaiting([])`→`{count:0, oldestLabel:null}`; `aggregateSyncStatus`: 전부 성공, 일부 실패(`error:null`), 전부 실패(rate_limit 우선순위·`resetAt`), 레포 0개(`lastSuccessAt:null`), 한 레포는 성공 없음+다른 레포 성공(성공 있는 것의 오래된 쪽); `closedBadge` 4종 + `mergedWithoutMyReview`.
- [ ] **Step 2:** `npx vitest run frontend/src/lib/reviewQueue.test.ts` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 시각 비교는 모두 `now` 인자 기준(`Date.now()` 직접 호출 금지).
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 리뷰 요청 큐 표시·집계 순수 함수 추가`

### Task 3: `useReviewQueue` · `useTabReturn` · `useNow`

**Files:** Create: `frontend/src/hooks/useReviewQueue.ts`, `useTabReturn.ts`, `useNow.ts`, `ReviewQueueContext.tsx` 및 각 `*.test.ts(x)`. Modify: `frontend/src/hooks/useReviewBadge.ts`(기반 자리표시 → 아래 구현), `frontend/src/App.tsx`(`PrSyncProvider`와 `AppShell` 사이에 `<ReviewQueueProvider>` 한 줄 추가)

**Interfaces:**
- Consumes: `fetchReviewQueue`, `QueueFetchError`(Task 1), `usePrSyncContext().syncNow(repoId?: number): Promise<void>`(기반 Task 7; 인자 없으면 전체, 있으면 그 레포만), `TASKS_POLL_INTERVAL_MS`(`services/taskSync.ts`), `useMyLogin`/`useMyTeams`(settings T1), `splitQueue`(Task 2).
- Produces:
  - `interface ReviewQueueState { data: ReviewQueueResponse | null; loadState: 'idle'|'loading'|'ready'|'error'; loadError: QueueFetchError | null; refreshError: QueueFetchError | null; refreshing: boolean; retryingRepoId: number | null; refresh(): Promise<void>; reload(): Promise<void>; retryRepo(repoId: number): Promise<void> }`
  - `useReviewQueue(login: string | null, teams?: string[]): ReviewQueueState` — `login`이 `null`이면 `idle`(요청 없음). `refresh` = `syncNow()` 후 GET(`syncNow`가 reject해도 GET은 진행), `reload` = GET만(폴링·재시도), 동시 호출은 진행 중 promise 공유. `retryRepo(id)` = `syncNow(id)` 후 GET.
  - `ReviewQueueProvider({children})`/`useReviewQueueContext(): ReviewQueueState & { login: string | null }` — `useMyLogin().login`·`useMyTeams().teams`로 `useReviewQueue`를 **앱에 하나만** 만들고(마운트 시 `reload()` 1회, 로그인이 바뀌면 자동 재요청) `/me` 화면과 사이드바 배지가 공유한다.
  - `useReviewBadge(): number | undefined` — 로그인이 없거나 `data`가 없으면 `undefined`, 아니면 `splitQueue(data.items, false).waiting.length`(숨긴 초안 제외, 기본 화면의 "리뷰 대기 N건"과 같은 수)이고 0이면 `undefined`(결정 39: 0이면 숨김). 실패 시 **`data`는 유지**하고 첫 로드면 `loadError`, 이후면 `refreshError`에 기록(성공하면 둘 다 `null`). 폴링은 `TASKS_POLL_INTERVAL_MS`마다 `reload`(문서가 숨김이면 건너뜀).
  - `useTabReturn(onReturn: () => void, minGapMs?: number /* 기본 30_000 */): void` — `visibilitychange`(→visible)와 `online`에서 호출, 직전 호출 후 `minGapMs` 안이면 생략.
  - `useNow(intervalMs?: number /* 기본 60_000 */): Date`

- [ ] **Step 1: 실패 테스트**(`vi.mock('../services/reviewQueueApi')`, `vi.mock('./PrSyncContext')`, `vi.useFakeTimers({ shouldAdvanceTime: true })`): (a) 첫 로드 성공 `loading→ready`; (b) 첫 로드 실패 → `loadState:'error'`, `data:null`; (c) 성공 후 `refresh()` 실패 → `data` 그대로·`refreshError` 설정·`refreshing:false`, 다음 성공에서 `refreshError:null`; (d) `refresh()`가 `syncNow`를 GET보다 먼저 호출하고, `syncNow` reject에도 GET 호출됨; (e) `refresh()` 동시 2회 → `syncNow` 1회·GET 1회; (f) **로그인 `a`로 요청 중 `b`로 바뀌면 `a`의 늦은 응답이 `data`에 반영되지 않음**(`AbortSignal`도 전달됨); (g) `login=null`이면 fetch 0회; (h) 3분 경과 시 `reload` 1회, `document.hidden=true`면 0회; (i) `retryRepo(2)`가 `syncNow(2)` 후 GET, 그동안 `retryingRepoId===2`; (j) `useReviewBadge`: 로그인 없음→`undefined`, 대기 3건(초안 1건 포함)→`2`, 대기 0→`undefined`, 로그인 `a`→`b` 변경 시 `a`의 숫자가 남지 않음, `ReviewQueueProvider` 하나에서 `fetchReviewQueue`가 마운트당 1회(화면과 배지가 각각 요청하지 않음); `useTabReturn`: visible 전환 1회 호출, hidden 전환 0회, 29초 뒤 재전환 0회·31초 뒤 1회, `online` 이벤트 동일 규칙, 언마운트 후 리스너 제거.
- [ ] **Step 2:** `npx vitest run frontend/src/hooks/useReviewQueue.test.tsx frontend/src/hooks/useTabReturn.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 이전 요청은 `AbortController`로 취소하고 응답 반영 직전에 "현재 로그인과 같은 요청인지"를 한 번 더 확인한다.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: useReviewQueue 훅(마지막 성공 데이터 유지·탭 복귀 갱신) 추가`

### Task 4: 읽는 중 행 이동 보류 (`useHold` · `useFrozenQueue` · `queueDiff`)

**Files:** Create: `frontend/src/lib/queueDiff.ts`, `frontend/src/hooks/useHold.ts`, `frontend/src/hooks/useFrozenQueue.ts` 및 각 `*.test.ts(x)`

**Interfaces:**
- Consumes: Task 1 타입.
- Produces:
  - `diffQueue(before: ReviewQueueItem[], after: ReviewQueueItem[]): { addedWaiting: number; movedToAwaiting: number; movedToClosed: number; removed: number; changedIds: string[] }` — `changedIds` = 추가·삭제·`group` 변경된 id(제목·시각만 바뀐 것은 제외)
  - `describeQueueDiff(d: ReturnType<typeof diffQueue>): string | null` — 변화 없으면 `null`, 있으면 한 문장으로 묶음: "새 리뷰 요청 2건, 작성자 응답 대기로 1건 이동, 정리됨 1건"
  - `nextFocusId(orderedIdsBefore: string[], removedId: string, idsAfter: string[]): string | null` — 제거된 행 **뒤쪽** 첫 생존 id, 없으면 앞쪽 가장 가까운 생존 id, 없으면 `null`
  - `useHold(): { held: boolean; holdProps: { onFocusCapture; onBlurCapture; onPointerEnter; onPointerLeave } }` — 포커스가 컨테이너 안에 있거나 마우스(`pointerType==='mouse'`)가 올라가 있는 동안 `held`; 포커스가 컨테이너 밖으로 가면 해제
  - `useFrozenQueue(live: ReviewQueueResponse | null, held: boolean): { shown: ReviewQueueResponse | null; pendingCount: number; applyNow(): void }` — `held`가 아니면 `shown=live`. `held`인 동안 `items`만 직전 스냅샷에 고정하고 `repos` 등 나머지는 `live`를 따른다(신선도·오류가 낡지 않게). 첫 데이터는 즉시 반영. `held`가 풀리면 자동 반영. `pendingCount = diffQueue(shown.items, live.items).changedIds.length`.

- [ ] **Step 1: 실패 테스트**: `diffQueue`(waiting→awaiting_author 이동, 새 행, 사라진 행, 제목만 변경은 changed 아님); `describeQueueDiff` 문구 3종과 `null`; `nextFocusId`(중간·마지막·유일 행 제거); `useHold`(focus/blur/pointerenter/leave, 컨테이너 내부 포커스 이동은 해제 아님, `pointerType:'touch'`는 무시); `useFrozenQueue`: held 중 `live` 교체 → `shown.items` 불변·`pendingCount` 증가·`shown.repos`는 최신; `applyNow()` → 반영·`pendingCount 0`; held 해제 → 자동 반영; held 중 `live`가 원래 상태로 돌아오면 `pendingCount 0`.
- [ ] **Step 2:** `npx vitest run frontend/src/lib/queueDiff.test.ts frontend/src/hooks/useHold.test.tsx frontend/src/hooks/useFrozenQueue.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 시그니처.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 포커스·호버 중 큐 행 이동을 보류하는 훅 추가`

### Task 5: 행 컴포넌트 `PrQueueRow` · `PrCompactRow`

**Files:** Create: `frontend/src/components/queue/PrQueueRow.tsx`, `PrCompactRow.tsx`, `PrQueueRow.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `waitLabel, waitBasisLabel, formatChangeSize, changeSizeSpoken, myReviewLabel, closedBadge`, 기반 `lib/repoCopy.ts`의 `formatClock`.
- Produces:
  - `<PrQueueRow item: ReviewQueueItem; now: Date; unverifiedSince?: string | null | undefined />` — `<li data-row-id={item.id}>`. `unverifiedSince`가 `undefined`가 아니면(해당 레포 확인 실패) 배지 "확인 안 됨 · HH:MM 기준"(`null`이면 "확인 안 됨"). 구성(DOM 순서=시각 순서): ① 대기 열: `<strong>{waitLabel}</strong>` + `<span>{waitBasisLabel}</span>` + `reRequested`면 배지 "다시 요청됨" ② 본문: `<h3>{title}</h3>`, 메타 목록(`레포 #번호`, `작성자 {author}`, 변경 규모, `requestKind==='team'`이면 "팀 요청 · {viaTeam}", `myReviewLabel`이 있으면 해당 문구, `isDraft`면 배지 "초안") ③ 행동: `<a href target="_blank" rel="noopener noreferrer">GitHub에서 리뷰</a>`, `aria-label="{repo} #{number} GitHub에서 리뷰 (새 탭에서 열려요)"`. +/− 는 시각 텍스트와 `sr-only` 문장(`changeSizeSpoken`)을 함께 둔다.
  - `<PrCompactRow item: ReviewQueueItem; now: Date; unverifiedSince?: string | null />` — `awaiting_author`(우측에 `myReviewLabel`)와 `closed`(우측에 `closedBadge` 배지) 공용. 제목 자체가 같은 규칙의 GitHub 링크.
  - 링크는 `/^https?:\/\//i`일 때만 만들고 아니면 제목만 텍스트로 + "링크를 열 수 없어요".

- [ ] **Step 1: 실패 테스트**: (a) 계약 §1 예시 항목 → "요청 후 4일"(고정 `now`), "리뷰 요청 기준", `#58`, "작성자 jun-ho", "+120 −14 · 파일 6개"가 보이고 sr 문장이 접근성 트리에 있음; (b) `reRequested`+`myReview` → "다시 요청됨"과 "내 최신 리뷰: 변경 요청함"; (c) `requestKind:'team'`·`viaTeam:'acme/web'` → "팀 요청 · acme/web", `direct`면 없음; (d) `requestedAtSource:'pr_created'` → "올라온 지 N일"+"PR 생성 기준"; (e) `size:null` → "변경 규모 알 수 없음"(0 아님); (f) 링크 `getByRole('link',{name:/#58 GitHub에서 리뷰/})`의 `href`·`target`·`rel`, `url:'javascript:alert(1)'`이면 링크 없음; (g) `unverifiedSince` 지정 시 "확인 안 됨 · HH:MM 기준"; (h) 80자 공백 없는 제목·레포명에서 제목 요소 클래스에 `break-words`·`min-w-0`; (i) `closed`+`mergedWithoutMyReview` → "리뷰 없이 머지됨"; (j) 모든 상호작용 요소가 `<a>` 하나뿐이고 `div`/`span` onClick 없음.
- [ ] **Step 2:** `npx vitest run frontend/src/components/queue/PrQueueRow.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 구조. 스타일은 토큰 유틸리티만, 대기 열은 굵기만(색 강조 없음). `lg:` 이상에서 3열 그리드, 그 아래는 세로 쌓기(대기 열이 제목 위, 행동 링크는 전체 너비 가능).
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 리뷰 요청 큐 행 컴포넌트 추가`

### Task 6: `QueueGroupSection` · `QueueSummary` · `RepoFailureBanner`

**Files:** Create: `frontend/src/components/queue/QueueGroupSection.tsx`, `QueueSummary.tsx`, `RepoFailureBanner.tsx`, 각 `*.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `WAITING_RENDER_CAP`, 기반 `lib/repoCopy.ts`의 `describeRepoError(repo, err, lastSuccessAt, now)`·`formatClock`, 기반 `ROUTES`.
- Produces:
  - `<QueueGroupSection<T extends { id: string }> id: string; title: string; hint?: string; items: T[]; defaultOpen: boolean; renderItem: (item: T) => ReactNode; cap?: number /* 기본 WAITING_RENDER_CAP */ />` — `<section>` 안 `<h2><button aria-expanded aria-controls>{title} {items.length}건{hint ? ` · ${hint}` : ''}</button></h2>`, 본문 `<ul id hidden={!open}>`. `items.length > cap`이면 앞 `cap`개만 렌더하고 버튼 "더 보기 (N건 더)". 누르면 전체가 렌더되고 **새로 보이게 된 첫 행의 링크로 포커스**. `h2`는 `tabIndex={-1}`·`data-group-heading`(포커스 폴백 대상).
  - `<QueueSummary waitingCount: number; oldestLabel: string | null; awaitingCount: number; draftCount: number; showDrafts: boolean; onShowDraftsChange(v: boolean): void; partial: boolean; truncated: boolean />` — 한 줄 요약 "리뷰 대기 {n}건" + `oldestLabel`이 있으면 " · 가장 오래 {oldestLabel}", `partial`이면 "(확인된 레포 기준)", `truncated`면 "(일부만 가져옴)"; 작성자 응답 대기 건수; `draftCount>0`이면 체크박스 `<label>초안 {draftCount}건 보기</label>`이고 `!showDrafts`일 때 "초안 {draftCount}건은 숨겨져 있어요" 텍스트.
  - `<RepoFailureBanner repos: RepoSyncState[]; allFailed: boolean; retryingRepoId: number | null; onRetry(repoId: number): void; now?: Date />` — 실패 레포(`lastError!==null`)가 없으면 `null`. 레포별로 `describeRepoError`의 `title`·`body`·"{HH:MM} 기준"(레포의 `lastSuccessAt`), 재시도 버튼 `"이 레포만 다시 시도"`(`canRetry`일 때만 렌더), `retryDisabledReason`이 있으면 `aria-disabled="true"`+그 텍스트 연결(`aria-describedby`)·클릭 무시, `canRetry`가 아니면 버튼 없음, `adminCopy`가 있으면 "관리자에게 보낼 내용 복사" 버튼(`navigator.clipboard.writeText`, 실패하면 텍스트를 `<textarea readonly>`로 펼침). **`role="alert"`는 `allFailed===false`(일부만 실패)일 때만** 루트에 부여하고, `allFailed`이면 `role="group"`(전체 실패 알림은 `SyncStatusLine`이 소유, 이중 낭독 방지). 같은 입력으로 리렌더해도 DOM 노드가 유지된다.

- [ ] **Step 1: 실패 테스트**: Group: (a) 헤더가 `button`, `aria-expanded`/`aria-controls`가 본문 id와 일치하고 Enter/Space로 토글, 닫힌 본문은 `hidden`; (b) 120건 중 50건만 렌더·"더 보기 (70건 더)", 클릭 후 120건·`document.activeElement`가 51번째 행 링크; (c) 헤더 건수가 전체 `items.length`; (d) 0건이면 섹션 제거가 아니라 호출자가 안 그리도록 `null`(컴포넌트는 0건이면 `null` 반환). Summary: (e) 문구 조합(partial/truncated), (f) 체크박스 토글이 `onShowDraftsChange` 호출·키보드 Space, (g) `draftCount===0`이면 체크박스 없음. Banner: (h) 실패 없음 → 아무것도 렌더 안 됨; (i) `rate_limit`+`resetAt` → 버튼 `aria-disabled="true"`, 클릭해도 `onRetry` 미호출, "HH:MM부터 가능" 텍스트; (j) `auth` → 재시도 버튼 없음·복사 버튼 있음, 클립보드 거부 시 텍스트 노출; (k) 일부 실패 → `role="alert"` 1개, 전체 실패 → `alert` 0개·`group`; (l) 같은 `repos`로 3회 리렌더해도 `alert` 1개; (m) 성공 레포 정보는 배너에 없음; (n) `retryingRepoId`인 레포 버튼이 `aria-disabled`+"다시 확인하는 중".
- [ ] **Step 2:** `npx vitest run frontend/src/components/queue` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 아이콘 없이 텍스트로 상태 전달.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 큐 그룹·요약·레포 실패 배너 컴포넌트 추가`

### Task 7: 빈·로딩·오류 안내 `QueueNotice` · `EmptyQueueAreaSummary`

**Files:** Create: `frontend/src/components/queue/QueueNotice.tsx`, `EmptyQueueAreaSummary.tsx`, 각 `*.test.tsx`

**Interfaces:**
- Consumes: 기반 `lib/repoCopy.ts`의 `formatClock`, `ROUTES`, `Link`(react-router), screen-area-flow T1의 `fetchAreas(repoId, days)`·`Area`(`services/areasApi.ts`, `types/areas.ts`).
- Produces:
  - (영역 요약용 별도 API 클라이언트는 만들지 않는다 — `fetchAreas(repoId, 30)`의 `areas[].{id, displayName, lastChangeAt, reviewWaiting}`만 읽는다.)
  - `type QueueNoticeKind = 'loading' | 'server_error' | 'no_repos' | 'login_unknown' | 'no_waiting'`
  - `<QueueNotice kind; login: string; repoCount?: number; lastSuccessAt?: string | null; onRetry?: () => void; children?: ReactNode />` — 문구(07 §3.2~3.3): `loading` "리뷰 요청을 확인하는 중이에요", 10초 넘으면 "계속 확인하는 중이에요. 다른 화면으로 가도 돼요"(`aria-busy="true"`, 스켈레톤 3줄은 장식·`aria-hidden`, 모션 없음); `server_error`(`role="alert"`) "서버에 연결할 수 없어요 / 이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요. 지금은 리뷰 요청을 보여드릴 수 없어요." + [다시 시도]; `no_repos` "아직 리뷰 요청을 가져올 레포가 없어요" + 링크 [레포 연결](`ROUTES.settings`); `login_unknown` "레포 {repoCount}개에서 “{login}”에게 온 리뷰 요청을 찾지 못했어요. 정말 없는 걸 수도 있고, 로그인이 다른 이름일 수도 있어요." + 링크 [로그인 확인](`ROUTES.settings`); `no_waiting` "지금 리뷰 대기 PR이 없어요" + (`lastSuccessAt`이 있으면 "{HH:MM}에 가져왔어요") + 링크 [영역 흐름 보기](`ROUTES.areas`) + `children`(영역 요약 슬롯). 축하 연출 없음.
  - `<EmptyQueueAreaSummary repoId: number; repoName: string />` — 마운트 시 `fetchAreas(repoId, 30)`. 제목 `h2` "다른 영역은 지금 이래요" 아래 한 줄 "{repoName} 기준이에요"(결정 39: 여러 레포여도 첫 레포만 보여 주므로 레포 이름을 밝힌다), `lastChangeAt` 내림차순 상위 3개를 목록으로: 영역명(링크 `ROUTES.area(id)`), 마지막 변경 날짜, `prCount>0`이면 "리뷰 대기 {n}건", 아니면 "리뷰 대기 없음". 하단 링크 "영역 흐름 전체 보기". 영역 0개면 `null`, 실패면 "영역 흐름을 불러오지 못했어요" 한 줄 + 같은 링크(큐 자체를 막지 않음). 로딩 중 `aria-busy`.

- [ ] **Step 1: 실패 테스트**: `QueueNotice`: 5종 각 문구와 링크 `href`(`/settings`, `/areas`), `server_error`의 `alert`와 재시도 클릭, `loading` 10초 전후 문구 전환(`vi.useFakeTimers`), `no_waiting`에 "완료"·"축하" 단어 없음, `login_unknown`과 `no_waiting`이 서로 다른 문구. `EmptyQueueAreaSummary`(`vi.mock('../../services/areasApi')`): `fetchAreas(1, 30)`로 호출, "acme/api 기준이에요" 문구, 4개 영역 중 최근 변경 상위 3개만, 링크가 `/areas/<id>`, 실패 시 큐 안내는 유지되고 대체 문장 노출, 0개면 렌더 없음.
- [ ] **Step 2:** `npx vitest run frontend/src/components/queue/QueueNotice.test.tsx frontend/src/components/queue/EmptyQueueAreaSummary.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 영역 요약에 차트는 만들지 않는다(영역 흐름 화면 계획 소유; 06 "같은 표 재사용"은 그 계획 완료 후 `EmptyQueueAreaSummary` 내부만 교체).
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 큐 빈·로딩·오류 안내와 영역 요약 추가`

### Task 8: `MyReviewsScreen` 조립

**Files:**
- Modify: `frontend/src/screens/MyReviewsScreen.tsx`, `frontend/src/screens/MyReviewsScreen.test.tsx`(기반 Task 12의 테스트가 큐 fetch 모듈을 모킹하도록 setup만 수정; 기존 단언은 유지)
- Create: `frontend/src/screens/MyReviewsScreen.queue.test.tsx`

**Interfaces:**
- Consumes: Task 1~7 전부(`useReviewQueueContext`는 Task 3), 기반의 `MyLoginForm`, `SyncStatusLine`, `usePrSyncContext`, `useToasts().notify`, `ROUTES`.
- Produces: `MyReviewsScreen(): JSX.Element` (props 없음, 라우트 `/me`).

조립 규칙:
- 로그인(`useReviewQueueContext().login`) 없음 → 기반 Task 12의 첫 실행 `MyLoginForm`만(큐 제목 줄·요청 없음; settings T7의 `FirstRunGate`가 먼저 가로채면 도달하지 않는 방어 분기). 저장되면 즉시 큐로 전환. 이 화면은 `useReviewQueue`를 직접 만들지 않고 앱 전역 Provider의 상태를 쓴다(사이드바 배지와 한 인스턴스).
- 제목 줄(DOM 순서): `h1` "내 리뷰 요청" → "{login}의 큐" → `SyncStatusLine status={aggregateSyncStatus(data?.repos ?? [], syncing)} onRefresh={refresh}`(`syncing = refreshing || usePrSyncContext().status.syncing`, `now` 전달). 이 줄이 `/me`의 유일한 신선도 표시기.
- `data`(= `useFrozenQueue(live, useHold().held).shown`)가 `repos`에서 `allFailed`를 계산해 `RepoFailureBanner` 렌더, `refreshError`가 있으면 그 아래에 `role="alert"` 한 줄 "서버에 연결할 수 없어요 · 마지막으로 가져온 시각 {HH:MM}. 아래는 그 시각 기준이에요."(목록 유지).
- 상태 분기: 

| 조건 | 본문 |
|---|---|
| `loadState==='loading'` | `QueueNotice loading` |
| `loadState==='error'` | `QueueNotice server_error`(onRetry=`reload`) |
| `repos.length===0` | `no_repos` |
| 전체 항목 0 && `!knownLogin` | `login_unknown` |
| 대기 0 | `no_waiting` + `EmptyQueueAreaSummary`(`repoId`·`repoName` = `repos` 중 `lastSuccessAt`이 있는 첫 레포, 없으면 영역 요약 생략) 아래에 나머지 그룹 |
| 그 외 | `QueueSummary` + 그룹 3개 |

- 그룹(`QueueGroupSection`): 리뷰 대기(열림, `PrQueueRow`), 작성자 응답 대기(접힘, `PrCompactRow`), 정리됨(접힘, hint "7일 동안 보관", `PrCompactRow`). 요약 숫자는 `splitQueue(shown.items, showDrafts)` 결과(R17). 행의 `unverifiedSince`는 해당 `repoId`가 `lastError!==null`일 때 그 레포의 `lastSuccessAt`.
- `useHold().holdProps`는 그룹들을 감싸는 컨테이너 하나에 건다. `pendingCount>0`이면 목록 위에 버튼 "업데이트 {n}건 · 반영하기"(`applyNow`). "지금 가져오기"로 시작한 갱신은 완료 즉시 `applyNow()`. 반영 직전 포커스가 있던 행 id를 기억해 반영 뒤 `document.activeElement===document.body`이면 `nextFocusId` 행의 링크(없으면 `[data-group-heading]`)로 포커스.
- 변경 안내: 반영 시 `describeQueueDiff(...)`가 문자열이면 `notify(문구,'info')` 1회(포커스 이동 없음, 변화 없으면 호출 안 함).
- 갱신 시점: 마운트 직후 `refresh()` 1회(Provider의 마운트 `reload()`와 별개로 서버 동기화까지 요청), `useTabReturn(() => refresh())`.

- [ ] **Step 1: 실패 테스트** `MyReviewsScreen.queue.test.tsx`(`vi.mock`으로 `reviewQueueApi`·`areasApi`·`PrSyncContext`·`useToasts`, `ReviewQueueProvider`로 감쌈, `renderWithRouter(<MyReviewsScreen/>, {route:'/me'})`, 저장소에 로그인 `octocat`): (a) 로그인 없음 → 안내 폼만, `fetchReviewQueue` 0회; (b) 정상(대기 2·작성자 응답 대기 1·정리됨 1) → `h1` 1개, "octocat의 큐", "리뷰 대기 2건", 그룹 헤더 3개, 작성자 응답 대기·정리됨은 `aria-expanded="false"`; (c) 대기 행이 `requestedAt` 오름차순; (d) draft 1건 포함 → 기본 숨김, "초안 1건 보기" 체크 시 행 추가·요약 숫자 증가, 해제 시 복귀; (e) 팀 요청 행에 "팀 요청 · …"; (f) `SyncStatusLine`이 정확히 1개(`getAllByText(/가져옴/)` 중복 없음)이고 레포 1개만 실패 시 "N분 전 가져옴"이 **성공한 레포 중 가장 오래된 시각** 기준; (g) 일부 실패 → `alert` 1개, 실패 레포 행에 "확인 안 됨", 성공 레포 행은 정상; 전체 실패(rate_limit) → `alert` 1개, "지금 가져오기" `aria-disabled`; (h) 대기 0 → "지금 리뷰 대기 PR이 없어요"+영역 요약 3줄+"{레포} 기준이에요"+[영역 흐름 보기] 링크, 작성자 응답 대기 건수는 유지; 전체 0+`knownLogin:false` → "로그인이 다른 이름일 수도" 문구; 레포 0개 → "레포 연결"; (i) 첫 로드 실패 → "서버에 연결할 수 없어요"+[다시 시도]가 `reload` 호출; (j) 갱신 실패(`refreshError`) → 이전 목록 그대로·`alert` 1개·"지금 가져오기" 다시 활성; (k) 행의 링크에 포커스를 둔 채 다음 `live`가 그 행을 `awaiting_author`로 옮겨도 DOM 불변·"업데이트 1건 · 반영하기" 노출, 버튼 Enter → 반영·포커스가 다음 행 링크(`body` 아님)·`notify` 1회 "작성자 응답 대기로 1건 이동"; (l) "지금 가져오기" 클릭은 보류 없이 즉시 반영; (m) 탭 복귀(`visibilitychange`) 시 `refresh` 호출, 3분 폴링은 `reload`; (n) 키보드만으로: Tab으로 지금 가져오기 → 초안 체크박스 → 그룹 헤더 Enter 토글 → 행 링크 도달(`user.tab()` 순서 단언, 순서=DOM 순서=시각 순서); (o) 로그인 `a`→`b` 저장 후 `a`의 큐가 보이지 않음; (p) 대기 3건 응답에서 `AppShell` 사이드바의 "내 리뷰 요청" 항목에 배지 "3"(`aria-label` "리뷰 대기 3건"), 대기 0이면 배지 없음, 초안 토글을 켜도 배지 숫자는 불변; (q) 화면 텍스트에 "동기화"·"감시" 없음, `h1`/`main` 중복 없음(`main`은 AppShell 소유).
- [ ] **Step 2:** `npx vitest run frontend/src/screens` → FAIL
- [ ] **Step 3: 구현** 위 규칙. 조립 로직이 길어지면 본문 분기만 `components/queue/QueueBody.tsx`로 분리해도 된다(화면 파일 150줄 이하 권장).
- [ ] **Step 4:** `npm test` / `npm run lint` / `npm run build` PASS (기반 Task 12 테스트 포함 전체 통과)
- [ ] **Step 5: 커밋** `feat: 내 리뷰 요청 화면 조립(큐·상태·탭 복귀·행 이동 보류)`

### Task 9: 구조 가드 · 320px 리플로 · 최종 검증

**Files:** Create: `frontend/src/components/queue/queue.guard.test.ts`

**Interfaces:** Consumes: 앞 Task 전부. Produces: 없음.

- [ ] **Step 1: 실패 테스트(가드)**: `components/queue/*.tsx`(테스트 제외)·`screens/MyReviewsScreen.tsx`를 읽어 0건 단언: (a) `/<(div|span)\b[^>]*\sonClick=/`; (b) `animate-(pulse|ping|bounce)`; (c) 접두 없는 고정 폭 `(?<![:\w-])(w|min-w)-(\[\d+px\]|64|72|80|96)\b`; (d) `text-\[(9|10|10\.5|11)px\]`; (e) `동기화|감시|Accept|🔥|🎉`와 영어 병기 `\([A-Za-z ]+\)`; (f) `outline-none`이 `focus-visible`·`ring` 없이 쓰인 줄; (g) `localStorage|sessionStorage`; (h) `fetch\([^)]*method:\s*'POST'`. 그리고 `PrQueueRow.tsx`에 `break-words`와 `min-w-0`가 있음을 단언.
- [ ] **Step 2:** `npx vitest run frontend/src/components/queue/queue.guard.test.ts` → 위반이 있으면 FAIL(없으면 PASS, 그대로 두고 Step 3 건너뜀)
- [ ] **Step 3: 구현** 위반 수정만.
- [ ] **Step 4: 최종 검증** `npm run lint`, `npm test`, `npm run build` 모두 PASS. 수동(백엔드 큐 계획 완료 후, `docker compose up` + `npm run dev`, 저장소에 `flowsync:myLogin` 설정): (i) `/me`가 첫 화면; (ii) 브라우저 폭 320px에서 콘솔 `document.documentElement.scrollWidth <= window.innerWidth`가 `true`(정상·일부 실패·빈 큐·긴 제목 항목 각각), 400% 확대 동일; (iii) 키보드만으로 지금 가져오기·초안 토글·그룹 열기·행 링크·더 보기 도달, 포커스 링 보임; (iv) 탭을 숨겼다 돌아오면 네트워크 탭에 `sync-prs` POST 후 `review-queue` GET 1회씩, 30초 안 재전환은 없음; (v) 서버를 끄면 이전 목록이 남고 안내가 1회만 나옴. 백엔드가 없으면 (ii)~(v)는 "미검증"으로 보고한다.
- [ ] **Step 5: 커밋** `test: 내 리뷰 요청 화면 구조 가드 추가`

---

## 07 §5 체크리스트 → 태스크 매핑 (이 화면)

| 07 §5 번호 | 담당 |
|---|---|
| 1~3, 8 (조용한 실패 금지·성공 시각 기준·부분 실패) | Task 2(`aggregateSyncStatus`), 6, 8 |
| 4, 5 (절단 안내, 숫자=목록, 숨긴 항목 개수) | Task 2, 6, 8 |
| 6, 7 (원인별 문구·재시도 없음/비활성) | Task 2(`describeRepoError`), 6 |
| 9, 11 (0건 구분, "{login}의 큐") | Task 7, 8 |
| 13 (낙관적 갱신 롤백) | 이 화면에는 서버 쓰기가 없다. 동등 요건("갱신 실패 시 화면을 되돌리고 알림 1회")은 Task 3(c), 8(j). 작업 mutation 롤백은 기반 Task 6 소유 |
| 17, 18 (행 이동 보류, 포커스 폴백) | Task 4, 8 |
| 21, 22, 30, 33 (키보드 완결, `div onClick` 0, 호버 전용 없음) | Task 5, 6, 8(n), 9 |
| 40, 41 (320px, 타깃 크기) | Task 5, 9 |
| 결정 39 사이드바 대기 배지 | Task 3(`useReviewBadge`, `ReviewQueueProvider`), Task 8(q) |
| 42 (낭독 규칙) | Task 6(l), 8(f)(g)(k) |
| 44, 45 (+/− 낭독, 제목 말줄임 금지) | Task 5 |
| 47~49 (용어·문구) | Global Constraints, Task 7, 9 |

**이 계획에서 하지 않는 것:** 정렬(크기·영역)·영역 필터·영역 칩·행 펼침 상세(`include=areas`가 필요하고 사용자 목록에 없음), 오프라인 배너·쓰기 컨트롤 비활성(07 #14~15, `online` 이벤트 재조회만 Task 3에 포함), 로그인 후보 대조(설정·첫 실행 계획), 색·타이포 값(Impeccable), 색 대비·글자 크기 실측(07 #34, #35).

## Self-Review

- **스펙 커버리지**: 큐 목록·대기 시간 순(T2 `splitQueue`, T8 c), 카드 정보 5종(T5), draft 숨김·토글(T2, T6, T8 d), 정리됨 7일(T1 기본값, T8 그룹), 동기화 표시 한 곳·성공 기준·일부 실패·잘림(T2, T6, T8 f·g), 빈 큐 영역 요약(T7, T8 h), 로딩·오류·일부 실패(T7, T6, T8), 탭 복귀(T3, T8 m), 수동 확인(T8 l), 키보드(T6, T8 n), 롤백 동등 요건(T3 c, T8 j), 320px(T5, T9), 07 체크리스트(위 표).
- **타입 일관성**: `QueueGroupKey`(타입)와 `QueueGroupSection`(컴포넌트)을 분리해 충돌 방지. `ReviewQueueState.reload/refresh/retryRepo`가 T3 정의와 T8 사용처에서 동일. `unverifiedSince`는 T5 정의·T8 사용 동일. `SyncStatusInfo`·`usePrSyncContext().syncNow()`는 기반 정의를 변경 없이 사용.
- **비례**: 코드 본문 없이 시그니처·단언 위주.

## 태스크 의존 그래프

```
(기반 계획 Task 1~12 완료)
        │
        ▼
   T1(타입·API·픽스처)
     ├─► T2(lib/reviewQueue) ─┬─► T5(행)
     │                        ├─► T6(그룹·요약·배너)
     │                        └─► T7(안내·영역 요약)
     ├─► T3(useReviewQueue·useTabReturn)
     └─► T4(useHold·useFrozenQueue·queueDiff)
T3, T4, T5, T6, T7 ─► T8(MyReviewsScreen 조립) ─► T9(가드·320px·최종 검증)
(T3은 settings T1, T7은 area-flow T1에도 의존)
```

**병렬 가능 묶음** (서로 다른 파일만 만진다):
- 묶음 A: T1 단독
- 묶음 B(T1 후): T2, T3, T4 병렬
- 묶음 C(T2 후): T5, T6, T7 병렬(T3·T4와도 동시 진행 가능)
- 묶음 D: T8 단독(모든 선행 후)
- 묶음 E: T9 단독

## 사용자 결정이 필요한 질문

모두 확정됨(결정 39). 남은 미결 질문 없음.

- 카드에는 **작성자**를 표시한다("요청자"는 계약에 없고 만들지 않는다).
- 신선도·"지금 가져오기"는 제목 줄 한 곳의 한 줄 요약(`SyncStatusLine`)이고, 레포별 실패 상세(`RepoFailureBanner`)는 **실패가 있을 때만 제목 줄 바로 아래**에 펼친다.
- 빈 큐의 영역 요약은 **성공 이력이 있는 첫 레포만**, 레포 이름을 함께 표시한다(Task 7·8).
- 사이드바에 실제 대기 건수 배지(0이면 숨김)를 넣는다(Task 3·8).
