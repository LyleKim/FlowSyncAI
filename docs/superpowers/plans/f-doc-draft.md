# 프런트 문서 갱신 초안 (CLAUDE.md · DECISIONS.md)

작성일 2026-11-25, 브랜치 `LyleKim/impl-frontend`.
백엔드 스트림과의 병합 충돌을 피하려고 `CLAUDE.md`와 `docs/DECISIONS.md`는 이 브랜치에서 수정하지 않았습니다. 아래 문장을 나중에 한 번에 적용합니다.
검증 상태는 원장(`.superpowers/sdd/stream.md`) 기준입니다. 실제 백엔드 없이 계약 문서의 fixture/mock으로만 테스트했고, 실서버·브라우저 수동 확인은 하지 않았습니다.

---

## 1. CLAUDE.md 갱신안

### 1-1. "Frontend structure" 절 교체 문안

```markdown
### Frontend structure (`frontend/src/`)
- `main.tsx` — `<HashRouter>`로 `App`을 감싼다(라우터 생성부는 여기 한 곳. 딥링크는 `/#/tasks/abc`라 SPA 폴백 설정이 필요 없다). 테스트는 `MemoryRouter`로 감싼다.
- `App.tsx` — 라우터 없이 Provider만 조립한다: `ToastProvider > TasksProvider(notify) > PrSyncProvider(onCreated=refresh) > ReviewQueueProvider > AppShell > AppRoutes`, 그 밖에 `ToastHost`. 상태·mutation 핸들러는 여기에 두지 않는다(훅으로 이동).
- `routes.tsx` — `ROUTES`/`SCREEN_TITLES`/`titleFor`/`AppRoutes`. 경로: `/`→`/me` 리다이렉트, `/me`(FirstRunGate), `/areas`, `/areas/:areaId`, `/tasks`(+ 자식 `new`, `:id`는 `TasksScreen`의 `<Outlet/>`에 뜨는 `TaskDetailDialog`), `/settings`, 그 외 `NotFoundScreen`. 새 화면은 여기에 추가한다.
- `screens/` — `MyReviewsScreen`, `AreasScreen`, `AreaDetailScreen`, `TasksScreen`, `SettingsScreen`, `NotFoundScreen`. 화면당 `h1` 1개.
- `hooks/` — 데이터·동작은 훅/Context로 둔다.
  - `useTasks`+`TasksContext`: 작업 목록·폴링·모든 mutation. mutation은 throw하지 않고 `MutationResult`(`{ok:true,value}|{ok:false,error}`)를 돌려주며, 낙관적 갱신 실패 시 롤백한다. 같은 `(종류,id)` 진행 중이면 두 번째 호출은 요청 없이 `{ok:false}`. 알림은 `notify`로 1회만 보내고 호출자가 중복 알림을 하지 않도록 `MutationResult.notified`로 표시한다.
  - `usePrSync`+`PrSyncContext`: 감시 레포 PR 동기화 상태. `useReviewQueue`+`ReviewQueueContext`(+`useReviewBadge`, `useFrozenQueue`, `useHold`, `useTabReturn`, `useNow`): 내 리뷰 요청 큐.
  - `useAreas`/`useAreaRepos`/`useAreaDetail`: 영역 흐름. `useMyLogin`/`useMyTeams`: 내 GitHub 로그인·팀(저장소 래퍼 경유). `useTaskView`/`useTaskForm`/`useChecklistGenerator`/`useListFocusFallback`: 전체 작업 화면·상세 대화상자.
  - `useToasts`/`useUndo`: 토스트와 되돌리기. 삭제 대기(10초) 상태는 **Provider 수준 저장소**에 있어 라우트 이동·대화상자→목록 이동에도 유지된다. 컴포넌트 언마운트로는 commit하지 않고, 타임아웃·명시 commit·`pagehide`에서만 commit한다. 목록은 `usePendingIds()`로 삭제 대기 id를 걸러낸다.
  - `useTheme`(저장된 모드를 읽어 `html.dark` 적용), `useRouteAnnouncer`(라우트 변경 시 `document.title`·포커스 이동).
- `services/` — `apiClient.ts`의 `postJson()`이 **POST의 유일한 통로**(`Idempotency-Key` 부착, 다른 곳에서 `fetch(...,{method:'POST'})` 금지). `taskSync.ts`(3분 조건부 폴링, ETag/Last-Modified), `connectedReposApi.ts`(연결된 레포·`probeReviewQueue`), `reviewQueueApi.ts`, `areasApi.ts`, `areaAliasesApi.ts`, `aiApi.ts`(체크리스트 생성), `integrationsApi.ts`(PR 동기화), `syncStatus.ts`.
- `lib/` — 순수 로직: `storage.ts`(**`localStorage`/`sessionStorage` 직접 접근 금지, 이 래퍼만 사용**. `STORAGE_KEYS`, 막힌 환경 폴백, `purgeLegacyKeys`), `taskFilters`/`taskView`/`taskLabels`, `reviewQueue`/`queueDiff`, `areaChart`/`areaRoute`, `repoCopy`, `date`, `avatar`, `abort`.
- `components/` — `common/`(`Dialog`=네이티브 `<dialog>`+`showModal()`, 포털·`inert`·`aria-modal`·포커스 트랩 직접 구현 금지; `PrBadge`, `SyncStatusLine`, `ToastHost`), `layout/`(`AppShell`: 건너뛰기 링크·`nav[aria-label="주 메뉴"]`·`main#main`, `Sidebar` 4항목), `dashboard/`(`TaskBoard`, `TaskList`, `TaskFilterBar`, `TaskStatusControl`, `TaskCollectionStates`), `task/`(`TaskDetailDialog`, `TaskForm`, `TaskSummary`, `ChecklistSection`, `ReviewSection`), `queue/`, `areas/`, `settings/`, `firstrun/`.
- 스타일 — 색·글자 크기 같은 시각 값은 `index.css`의 토큰(`@theme inline`/`@theme`, 라이트·다크 블록)에서 정의하고 소스는 토큰 유틸리티(`bg-surface`, `text-muted` 등)만 쓴다. 새 코드에 `dark:` 변형·slate/blue 팔레트·`animate-pulse|ping|bounce`·이모지 금지. 토큰 이름이 계약이고 값은 현재 임시(`/* TEMP: Impeccable */`)다.
- `types/` — `index.ts`(`Task`/`SubTask`/`RoleReview`), `areas.ts`, `reviewQueue.ts`, `repoSync.ts`. 백엔드 직렬화 필드명(camelCase)과 맞춘다. `hasUnreflectedReview`/`lastReviewAddedAt`은 서버 계산값이라 UI에서 PATCH하지 않는다.
- 가드 테스트(소스를 읽어 규칙 위반 0건을 단언): `lib/removed.test.ts`(분석 탭·활동 피드·오프라인 폴백 흔적 없음), `lib/areaGuards.test.ts`(구 아키텍처 파일·recharts·BrowserRouter·`location.hash`·외부 CDN 없음), `components/queue/queue.guard.test.ts`, `components/settings/settingsGuards.test.ts`, `screens/tasksLayout.guard.test.ts`(고정 폭 레이아웃 금지), `test/tokenClasses.guard.test.ts`, `styles/tokens.test.ts`. 새 화면은 이 규칙을 지켜야 `npm test`를 통과한다.
- 테스트 인프라: `test/setup.ts`(`dialog`·`matchMedia`·`scrollIntoView` 스텁), `test/render.tsx`, `test/routeFetch.ts`(fetch 라우팅 모킹; `afterEach`에서 `vi.unstubAllGlobals`), `test/fixtures/`. `npm test`(vitest), `npm run lint`(tsc), `npm run build`.
```

### 1-2. 현재 사실과 달라진 기존 문장과 정정

| CLAUDE.md의 기존 문장 | 정정 |
|---|---|
| "What this is"/`activities` 항목: "the frontend's activity feed is `localStorage`-only (see `INITIAL_ACTIVITIES` ...)" | 프런트 활동 피드는 폐기됐다(`ActivityFeed`·`INITIAL_ACTIVITIES`·`logActivity` 삭제, `purgeLegacyKeys`가 구 키 정리). 백엔드 `activities` 앱은 여전히 URL에 노출되지 않는다는 문장만 남기고 프런트 언급은 삭제. |
| Commands: "The frontend expects the backend already running on :8000 ... there is no mock/offline mode." | 개발 서버 요구는 그대로. 단 `localStorage` 오프라인 폴백(`tasks` 복원·임시 task id 생성)은 제거됐고, 실패는 `MutationResult`+롤백+토스트로 처리한다. 테스트는 mock fetch를 쓰므로 백엔드 없이 `npm test` 가능. |
| "`App.tsx` — top-level state ... and every resource-mutation handler" | `App.tsx`는 Provider 조립(40줄 미만). 상태·mutation은 `hooks/useTasks`+`TasksContext`로 이동. |
| "`components/dashboard/{TaskBoard,TaskList,AnalyticsView,ActivityFeed}.tsx` — ... `recharts`-based stats, activity log" | `AnalyticsView`·`ActivityFeed` 삭제. `TaskBoard`/`TaskList`는 포털·`<div onClick>`·수동 이동 없이 제어형 목록/보드로 재작성됨. `recharts`는 의존성에서 제거됨(`npm uninstall`). |
| "`components/common/TaskModal.tsx` — task detail/create/edit modal ..." | 상세·생성·수정은 `components/task/TaskDetailDialog`(`/tasks/new`, `/tasks/:id` 라우트)가 담당한다. **`TaskModal.tsx`는 파일이 아직 남아 있으나 어디서도 import하지 않는 죽은 코드**다(F-T16 미실행). 삭제 전까지 "참조 금지". |
| "`components/layout/Sidebar.tsx` — view switcher + per-status counts" | 내비 4항목(내 리뷰 요청·영역 흐름·전체 작업·설정)과 리뷰 대기 배지. 상태별 카운트는 없다. |
| "`services/taskSync.ts` ... from `localStorage`" | 저장소 접근은 `lib/storage` 래퍼 경유. 폴링 계약(3분, 304)은 동일. |
| "`types/index.ts` — ... `Activity` types" | `Activity` 타입 사용처 없음(폐기). |
| "`ai_services` ... frontend then `PUT`s it" | 프런트 호출은 `services/aiApi.ts`+`useChecklistGenerator`. POST는 `postJson`. |

백엔드 URL 표/설계 결정 절은 이 문서(프런트) 범위 밖이라 건드리지 않습니다. 새 백엔드 엔드포인트(영역·연결된 레포·리뷰 큐 등)는 백엔드 스트림 쪽에서 추가합니다.

---

## 2. DECISIONS.md 추가 항목 초안

형식은 기존과 같고(문제/해결/결과, 기존 항목은 덮어쓰지 않고 맨 아래에 추가), 날짜는 작성일 2026-11-25입니다. 아래 "(미검증)"은 실서버·실브라우저에서 확인하지 않았다는 뜻입니다.

```markdown
## 2026-11-25 라우팅(HashRouter)과 네이티브 dialog

문제 : 590줄짜리 App.tsx 한 곳이 화면 전환·상태·mutation을 모두 가지고 있었고, 작업 상세는 1,093줄 모달이라 URL이 없었다. 새로고침·뒤로가기·링크 공유가 안 되고, 직접 만든 모달은 포커스 가둠·Esc·닫은 뒤 포커스 복귀가 불완전했다.

해결 : react-router의 HashRouter로 /me /areas /areas/:areaId /tasks(/new, /:id) /settings 라우트를 만들고(서버 SPA 폴백 설정이 필요 없는 해시 방식), 상세는 /tasks 위의 자식 라우트 대화상자로 연다. 상태·mutation은 useTasks 등 훅과 Context Provider로 옮겨 App.tsx는 Provider 조립만 한다. 대화상자는 직접 구현 대신 네이티브 <dialog>+showModal()을 쓰고(Dialog.tsx), jsdom 테스트에는 얇은 스텁을 쓴다. 라우트 변경 시 제목·포커스를 갱신한다.

결과 : 주요 화면과 작업 상세가 URL을 가진다. 단위/통합 테스트(MemoryRouter)는 통과. (미검증) 실제 브라우저에서 해시 딥링크 새로고침, Tab 순환 가둠, Esc, ::backdrop 클릭 동작은 스텁이 흉내 내지 못해 이벤트 핸들러 수준으로만 확인했다.

## 2026-11-25 삭제 되돌리기: Provider 수준 10초 지연 삭제와 pagehide commit

문제 : 삭제를 즉시 서버에 보내면 실수를 되돌릴 수 없다. 되돌리기 상태를 컴포넌트에 두면 상세 대화상자에서 삭제 후 목록으로 이동하는 순간(언마운트) 대기가 사라지거나 즉시 commit되고, 폴링이 같은 작업을 다시 내려주면 지운 항목이 되살아나 보였다.

해결 : 삭제 대기 상태를 ToastProvider(Provider 수준)에 둔다. schedule({hide, restore, commit})은 즉시 숨기고 10초 뒤 commit한다. 컴포넌트 언마운트에서는 commit하지 않고, 타임아웃·명시 commit·pagehide(탭 닫기/이동)에서만 commit한다. 목록은 usePendingIds()로 대기 중 id를 걸러 폴링 결과에도 숨긴다.

결과 : 라우트·대화상자 이동에도 되돌리기 창이 유지되고(테스트로 확인), pagehide 시 대기 항목이 commit된다. Provider 언마운트 후에는 commit하지 않는다. (미검증) pagehide 중 요청이 실제로 서버에 도달하는지(브라우저가 요청을 중단할 수 있음)는 실서버에서 확인하지 못했다.

## 2026-11-25 전체 작업 화면: TaskBoard/TaskList 재작성과 PR 수동 이동 제거

문제 : 보드/목록이 포털 카드와 <div onClick>, 호버 전용 노출, 이모지·색 그림자에 의존해 키보드로 쓸 수 없었다. PR에서 동기화된 작업은 상태가 PR 상태를 따라가는데 수동으로 옮길 수 있어 서버 값과 어긋났다.

해결 : 필터는 순수 모듈(lib/taskFilters, lib/taskView)로 빼고 목록/보드는 props로 제어되는 컴포넌트로 다시 썼다. 행/카드는 <Link>/<button>이며 data-row-id를 가진다. 보기·검색·상태·출처 필터는 URL 파라미터로 유지하고, 상태 필터는 목록에만 적용되며 보드는 항상 4열을 보여준다. PR 작업(isPrTask)에는 상태 변경 컨트롤을 렌더하지 않는다. 삭제는 위의 되돌리기를 쓰고, 삭제·닫기 후 포커스는 useListFocusFallback으로 이웃 행/제목으로 옮긴다. 320px 가로 스크롤을 막기 위해 고정 넓은 폭 클래스를 금지하는 가드 테스트(tasksLayout.guard)를 추가했다.

결과 : 관련 컴포넌트·화면 테스트와 가드 통과. (미검증) 320/200%/400% 실측과 서버 중지 시 오류 화면의 브라우저 확인은 백엔드 대기로 하지 않았다. 알려진 이슈: TaskDetailDialog 테스트 (a)가 전체 스위트를 부하 상태로 돌릴 때 3회 중 2회가량 간헐 실패한다(단독 실행 시 원인은 미규명, 수정 에이전트가 중단되어 미해결).

## 2026-11-25 영역 흐름 화면: 같은 눈금의 작은 다중 차트와 순위 목록, recharts 제거

문제 : 구 아키텍처 화면은 레포 URL을 직접 입력해야 했고, 색에 의존한 누적 막대 차트와 원형 그래프가 영역 간 비교와 색각 접근성을 해쳤다.

해결 : /areas(개요)와 /areas/:areaId(상세)로 나눴다. 개요는 영역마다 같은 눈금의 주간 막대 작은 다중 차트(WeeklyBars)를 표 형태로 두고, 이번 주(진행 중)는 속 빈 막대, 활동 없음은 0 바닥선과 점선, 추세는 글자로도 표시한다. 함께 바뀐 영역은 그래프 대신 순위 목록(CouplingRanking)이다. 상세에는 대기 PR 표와 함께 바뀐 영역 목록을 둔다. 레포는 연결된 레포 id 기반이고 선택값은 URL(?repo=&days=&sort=)에 둔다. 구 ArchitectureView/architecture/*/architectureApi와 recharts 의존성을 삭제하고, 이를 되살리지 못하게 areaGuards 가드를 추가했다.

결과 : 컴포넌트·훅·순수 로직·가드 테스트 통과, recharts는 package.json에서 제거됨. 백엔드 영역 API와의 계약 차이를 읽기 전용으로 확인해 기록했다: 서버가 coupling 상위 10쌍·authors 상위 5명으로 잘라 UI의 '상위 10쌍만' 안내가 뜰 수 없다, 상세 응답에 generatedAt이 없어 현재 주는 클라이언트 시각으로 판단한다, GET에 ETag/304가 없다(계약은 ETag). (미검증) 실제 서버 응답으로 렌더, 그레이스케일/320px/키보드 수동 점검은 하지 못했다.

## 2026-11-25 설정 화면과 첫 실행(first-run)

문제 : 감시 레포·내 GitHub 로그인·팀·영역 이름을 한 곳에서 설정할 수 없었고, 로그인이 없으면 내 리뷰 큐가 무엇을 보여줄지 알 수 없었다. 설정이 저장되지 않는 환경(저장소 차단)도 고려되지 않았다.

해결 : /settings에 내 로그인(MyLoginForm)·내 팀(MyTeamsField)·연결된 레포(ConnectedReposSection)·영역 이름 별칭(AreaNamesSection)·테마를 둔다. 로그인은 lib/storage 래퍼(useMyLogin/useMyTeams)로 저장하고, 변경은 같은 탭·다른 탭 모두에 전파한다. /me는 FirstRunGate가 로그인·레포 연결 여부로 첫 실행 흐름(FirstRunFlow, 진행·결과 화면)을 보여준다. 저장소를 못 쓰면 AppShell이 알림 배너를 띄운다. 레포 연결 해제는 되돌리기로 감싼다. 설정 화면에는 SyncStatusLine을 두지 않는다(상태 줄은 큐/작업 화면 소유).

결과 : 컴포넌트·가드(settingsGuards) 테스트 통과. 백엔드와의 계약 차이는 원장에 기록(예: 별칭 PATCH가 expectedUpdatedAt을 검증보다 먼저 검사, updatedAt 초 단위라 같은 초의 편집은 충돌로 안 잡힘). (미검증) 실서버로 레포 연결·해제·별칭 CRUD와 first-run 전체 흐름은 확인하지 못했다.

## 2026-11-25 리뷰 큐 UI: 읽는 동안 목록을 멈춘다(hold)

문제 : 폴링/새로고침 결과가 들어와 행이 갑자기 사라지거나 순서가 바뀌면, 사용자가 읽거나 누르려던 PR을 놓친다.

해결 : useReviewQueue가 가져온 큐를 useFrozenQueue/useHold로 사용자가 읽는 동안(포커스·호버 중) 반영을 미루고, 변경은 queueDiff 요약(예: "N건 새로 들어왔어요")으로만 알린다. 새 비대기 행처럼 요약이 불가능한 경우는 개수 문구로 대체한다. 탭에 돌아오면(useTabReturn) 갱신한다. 배지는 대기 PR 수에서 draft를 제외하고, Provider가 없으면(useReviewBadge) undefined를 돌려 테스트·다른 화면이 깨지지 않게 했다.

결과 : 훅·컴포넌트·큐 가드 테스트 통과. 알려진 한계: 포커스된 행이 사라질 때 hold가 풀리지 않을 수 있다(원장 기록). (미검증) 실서버 큐 응답으로 확인하지 못했다. 서버 차이: 로그인은 GitHub 저장 철자로 와서 대소문자가 다를 수 있다, closedAt은 머지된 PR에서도 채워져 closedReason/mergedAt을 써야 한다.

## 2026-11-25 알림은 한 번만: MutationResult.notified와 role=alert 단일 규칙

문제 : mutation 훅이 실패를 토스트로 알리는데 호출한 화면도 같은 실패를 또 알리면 같은 오류가 두 번 나왔다. 큐 화면은 전체 실패 시 배너와 상태 줄이 둘 다 role=alert를 달아 스크린리더가 같은 내용을 두 번 읽을 수 있었다.

해결 : useTasks의 실패 결과에 notified를 달아(훅이 이미 notify했는지) 호출자가 notified면 추가 알림을 하지 않게 한다. 큐 화면에서는 SyncStatusLine만 role=alert를 소유하고 전체 실패 배너는 role=group으로 둔다. 통합 테스트로 전체 실패와 부분 실패 모두 role=alert가 정확히 하나임을 단언한다. MyLoginForm의 되돌리기 토스트가 안내의 단일 출처다.

결과 : 관련 테스트 통과. (미검증) 실제 스크린리더 낭독 확인은 하지 않았다.

## 2026-11-25 토큰만으로 스타일링하고 가드 테스트로 지킨다

문제 : 임의 팔레트 클래스(존재하지 않는 slate-850 등)·dark: 쌍·이모지·애니메이션이 화면마다 퍼져 일관성이 깨졌고, 정의되지 않은 토큰 클래스는 오류 없이 무시되어 테스트로도 안 걸렸다(실제로 bg-surface-muted, text-text-muted가 발견됨).

해결 : 색·글자 크기는 index.css의 이름 있는 토큰(라이트·다크 블록, @theme)만 쓰고, 소스는 토큰 유틸리티만 쓴다. 규칙은 소스를 읽는 가드 테스트(tokens.test, tokenClasses.guard, removed, areaGuards, queue/settings/tasksLayout 가드)로 강제한다. 토큰 이름이 계약이고 값 교체(F-T17)는 이름을 바꾸지 않는다.

결과 : 위 가드 통과. 토큰 클래스 가드(tokenClasses.guard)가 있어 새 코드의 미정의 토큰 클래스는 잡힌다.

## 2026-11-25 이번 프런트 작업에서 하지 않았거나 확인하지 못한 것

- F-T16(TaskModal 삭제·통합 가드 guards.test·문서 갱신)은 실행하지 않았다. components/common/TaskModal.tsx가 남아 있고 어디에도 연결되지 않은 죽은 코드이며(dark: 변형 포함), F-T16의 통합 가드(예: TaskModal 참조 0건, 금지 문자열, fetch POST 직접 호출 금지 등)는 실행하지 않았다. 문서 갱신은 이 파일로 대체한다(적용 보류).
- F-T17(시각 토큰 실제 값·Pretendard 폰트 적용, 사용자 렌더 확인 게이트)은 실행하지 않았다. index.css에는 /* TEMP: Impeccable */ 임시 값이 그대로 있고 @font-face·frontend/public/fonts·tokenValues.test.ts는 없다.
- 전체 스위트 상태(원장, W5 게이트): 한 번은 623개 통과, 두 번은 TaskDetailDialog 테스트 (a)의 간헐 실패. lint·build는 통과. 이후 W6/W7 변경(S-T7 등)을 포함한 최종 게이트는 이 초안 작성 시점에 별도로 실행하지 않았다.
- 실제 백엔드 대상 수동 검증(브라우저 키보드·확대·320px·서버 중지 등)은 모두 미검증(백엔드 대기)이다.
```
