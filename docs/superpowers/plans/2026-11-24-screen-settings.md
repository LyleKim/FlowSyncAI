# 첫 설정(J1)과 설정 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 GitHub 로그인·내 팀·연결된 레포·영역 이름 별칭·테마를 한 설정 화면에서 다루고, 첫 실행/합류자/설정 미완료 사용자를 같은 입구(`/me`)에서 갈라 첫 가져오기 결과까지 데려간다.

**Architecture:** 기반 계획(`frontend-foundation`)이 만든 `lib/storage`·`useTheme`·`useUndo`·`usePrSyncContext`·`SyncStatusLine`·`ROUTES`·설정 화면 골격 위에, 계약 계획(`api-contract`)의 §3 연결된 레포, §5 영역 별칭, §1 `knownLogin`을 소비하는 얇은 서비스(`services/connectedReposApi.ts`, `services/areaAliasesApi.ts`)와 화면 조각(`components/settings/*`, `components/firstrun/*`)을 추가한다. 순수 문구·판정 로직은 `lib/repoCopy.ts` 한 곳에 모아 단위 테스트한다. 시각 값은 토큰 이름으로만 참조하고 `dark:` 쌍은 쓰지 않는다.

**Tech Stack:** React 19, TypeScript, react-router v7, Tailwind 4(토큰 유틸리티), Vitest + jsdom + testing-library(기반 Task 1이 설치).

**Spec:** `docs/ux/00-context.md`(확정 결정 1~40, 특히 1·7·11·17·18·20·24·31), `docs/ux/04-information-architecture.md`(§4 첫 화면 규칙), `docs/ux/05-user-journeys.md`(J1, J4, §5 S-A·S-B·S-H), `docs/ux/06-wireframes.md`(§2 첫 설정, §7 설정), `docs/ux/07-fortify-include-review.md`(R20~R26, §3.2~3.4 문구, §5 체크리스트), `docs/ux/wireframes/index.html`(`#scr-setup`, `#scr-settings`), `docs/superpowers/plans/2026-11-24-api-contract.md`(§1, §2, §3, §5), `docs/superpowers/plans/2026-11-24-frontend-foundation.md`(Task 2·3·7·8·10·12).

## Global Constraints

- **선행 조건:** 기반 계획 Task 1~10, 12가 먼저 끝나 있어야 한다(레포 상태 타입 `types/repoSync.ts`와 오류 문구 `lib/repoCopy.ts`는 기반 Task 7 소유이고, 영역 읽기 API `services/areasApi.ts`·`types/areas.ts`는 screen-area-flow Task 1 소유 — Task 6이 이를 소비한다). 이 계획은 기반이 만든 이름·시그니처를 **그대로 소비**하고 재정의하지 않는다(소비 목록은 각 태스크 Interfaces). 기반 파일을 고치는 곳은 "추가만"이며 Task 1·4·7·8의 Files에 명시한다.
- 수정 범위는 `frontend/` 안만. `backend/` 수정 금지. POST는 `postJson()`만(`fetch(..., {method:'POST'})` 직접 호출 금지). PATCH·DELETE는 일반 `fetch`.
- localStorage는 `lib/storage.ts`를 통해서만. 접근 실패에도 예외 없이 동작.
- 레포는 팀 공용, 로그인은 개인(결정 11). `githubLogin`은 폐기 예정: **요청에 싣지 않는다**(응답에서 읽는 것은 후보 칩 용도로만 허용).
- 삭제·연결 해제·이름 지우기는 확인 대화상자 없이 **10초 되돌리기**(결정 17, `useUndo.schedule`). **설정에서의 로그인 변경도 즉시 저장 + 10초 되돌리기**(결정 40; 첫 실행 흐름은 이전 값이 없으므로 예외, Task 4). 이 계획은 `Dialog`를 쓰지 않는다.
- 동기화 상태 표시(`SyncStatusLine`)는 `/me` 제목 줄 한 곳에만(결정 24). 설정에는 "지금 가져오기" **버튼**과 레포별 상태 문구만 둔다.
- 용어: **연결된 레포**, **지금 가져오기**, "N분 전 가져옴", **영역 이름**, **내 팀**. UI 문자열에 "감시", "동기화", "Accept", 영어 병기 `( … )`, 이모지 금지(07 §5 #46). 문장형은 해요체, 오류·빈 상태는 "무슨 일 / 영향 / 지금 할 일"(07 §3.2).
- 새 컴포넌트: `<div onClick>` 금지, 모든 입력 `<label for/id>`, 오류는 `aria-invalid`+`aria-describedby`, 아이콘 전용 버튼 `aria-label`, 비활성 사유가 있는 버튼은 `disabled` 대신 `aria-disabled`+사유 텍스트 연결(07 R27), 상호작용 요소 최소 24×24px, `animate-pulse|ping|bounce` 금지, 320px에서 가로 스크롤 없음(표는 `md` 미만에서 행 카드).
- 색·간격은 토큰 유틸리티만(기반 Task 3의 `--surface`, `--surface-raised`, `--surface-sunken`, `--text`, `--text-muted`, `--border`, `--border-strong`, `--accent`, `--accent-contrast`, `--focus-ring`, `--danger`, `--success`, `--warning` 매핑). 원색 팔레트 클래스(`slate-*` 등)와 `dark:` 변형 금지.
- 새 의존성·외부 CDN 금지. 커밋 메시지는 한국어 `type: 요약` + 시스템이 지정한 Co-Authored-By 줄.
- 단일 실행: `npx vitest run <경로>`. 전체: `npm test`, `npm run lint`, `npm run build`(저장소 루트).

## Review Focus

1. **오타 로그인이 실존 타인과 일치 / 팀이 본 적 없는 이름 / 아직 한 번도 가져오지 않은 서버**: `knownLogin:false`가 "첫 가져오기 전이라 아무도 모름"과 구별돼야 한다(오경보 금지). 첫 실행에서는 확인을 한 번만 묻고 막지 않는다(설정에서는 즉시 저장 + 10초 되돌리기, 결정 40). 확인에 못 걸리는 "실존 타인 일치"는 저장 직후 결과 화면의 이름 재확인 문구와 되돌리기로 방어한다. (Task 4, 7)
2. **합류자가 같은 레포 URL을 다시 추가(409+`existing`)**: 오류 표시도 중복 행도 없이 "이미 연결된 레포예요"로 이어진다. 잘못된 URL(400 `invalid_url`)·네트워크 실패는 입력값을 지우지 않는다. (Task 5)
3. **연결 해제 되돌리기 경계**: 10초 안에 폴링/재조회가 같은 레포를 다시 내려줘도 되살아나지 않고, 되돌리기 후엔 DELETE가 나가지 않으며, 마지막 레포를 해제해도 빈 상태 문구로 자연스럽게 바뀐다. 연타로 DELETE 2회 금지. (Task 5)
4. **영역 이름 동시 편집·끊긴 별칭**: PATCH 409 때 내가 쓴 값이 지워지지 않고 서버 최신값과 함께 보인다. 존재하지 않는 경로에 붙은 별칭은 "연결 끊김" 텍스트로 남고, 영역 목록 조회가 502여도 이미 붙은 이름은 편집·삭제할 수 있다. 빈 이름·81자는 저장되지 않는다. (Task 6)
5. **저장소 차단·서버 꺼짐 상태의 첫 실행**: localStorage가 throw해도 로그인 입력→가져오기까지 세션 안에서 끝까지 간다. 서버 연결 실패(E1)면 레포 개수 안내를 생략하고 재시도를 준다. 중간에 다른 화면으로 가도 재진입이 깨지지 않는다. (Task 7)

---

### Task 1: 내 팀 저장, 저장소 변경 구독, `useMyLogin`/`useMyTeams`

**Files:**
- Modify: `frontend/src/lib/storage.ts`(추가만 + `normalizeLogin` 보강), `frontend/src/lib/storage.test.ts`
- Create: `frontend/src/hooks/useMyLogin.ts`, `frontend/src/hooks/useMyLogin.test.tsx`

**Interfaces:**
- Consumes(기반 Task 2): `STORAGE_KEYS`, `readStorage`, `writeStorage`, `removeStorage`, `normalizeLogin`, `getMyLogin`, `setMyLogin`.
- Produces (`lib/storage.ts`에 추가; screen-review-queue T1이 먼저 임시 `STORAGE_KEYS.myTeams`/`getMyTeams()`를 넣었다면 그 정의를 아래 것으로 **교체**하고 중복 정의하지 않는다):
  - `STORAGE_KEYS.myTeams = 'flowsync:myTeams'`, `const MAX_TEAMS = 10`
  - `normalizeTeam(raw: string): string` — 앞뒤 공백·선행 `@` 제거, 소문자화, `/^[a-z\d][a-z\d-]{0,38}\/[a-z\d][a-z\d_-]{0,99}$/` 불일치면 `''`
  - `parseTeams(raw: string): { teams: string[]; invalid: string[] }` — 쉼표·줄바꿈·공백으로 분리, 중복 제거, 무효 토큰은 원문 그대로 `invalid`
  - `getMyTeams(): string[]`, `setMyTeams(teams: string[]): void`(쉼표로 이어 저장, 빈 배열이면 `removeStorage`)
  - `onStorageChange(listener: () => void): () => void` — `writeStorage`/`removeStorage` 성공·폴백 모두에서 호출, `window`의 `storage` 이벤트도 전달
  - `normalizeLogin` 보강(07 R23): 앞뒤 하이픈이면 `''`
- Produces (`hooks/useMyLogin.ts`): `useMyLogin(): { login: string | null; save(raw: string): string | null; clear(): void }`, `useMyTeams(): { teams: string[]; save(raw: string): { ok: true; teams: string[] } | { ok: false; invalid: string[]; tooMany: boolean } }`. 둘 다 `useSyncExternalStore(onStorageChange, …)` 기반이라 다른 화면에서 저장하면 즉시 리렌더된다. **이후 모든 화면은 `getMyLogin()` 직접 호출 대신 `useMyLogin()`을 쓴다.**

- [ ] **Step 1: 실패 테스트** `storage.test.ts`에 추가: `normalizeLogin('octocat-')===''`, `normalizeLogin('-a')===''`, `normalizeLogin('a')==='a'`, 39자 통과·40자 `''`; `normalizeTeam('@Acme/Core-Team')==='acme/core-team'`, `normalizeTeam('acme')===''`, `normalizeTeam('a b/c')===''`; `parseTeams('acme/a, acme/a\nacme/b zzz')`는 `{teams:['acme/a','acme/b'], invalid:['zzz']}`; `setMyTeams([])` 후 `getMyTeams()`는 `[]`; 저장소가 throw해도 `setMyTeams(['acme/a'])` 후 `getMyTeams()`가 `['acme/a']`(세션 폴백); `onStorageChange` 리스너가 `writeStorage` 후 1회 호출되고 반환 함수로 해제된다. `useMyLogin.test.tsx`: 초기 `login===null`; `save('@Octocat ')`→`'octocat'` 반환·리렌더로 `login==='octocat'`; `save('a b')`→`null`·`login` 불변; 컴포넌트 밖에서 `writeStorage(STORAGE_KEYS.myLogin,'x')` 후 `login==='x'`; `clear()`→`null`; `useMyTeams().save('acme/a, bad')`→`{ok:false, invalid:['bad'], tooMany:false}`이고 저장 안 됨, 11개 입력→`tooMany:true`.
- [ ] **Step 2:** `npx vitest run frontend/src/lib/storage.test.ts frontend/src/hooks/useMyLogin.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 리스너 집합은 모듈 로컬. `useMyLogin().save`는 `setMyLogin`을 호출하고, `clear`는 `removeStorage(STORAGE_KEYS.myLogin)`.
- [ ] **Step 4:** 위 명령 PASS, `npm test`(기반 테스트 회귀 없음), `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 내 팀 저장과 로그인 변경 구독 훅 추가`

### Task 2: 연결된 레포·로그인 확인 API 클라이언트

**Files:**
- Create: `frontend/src/services/connectedReposApi.ts`, `frontend/src/services/connectedReposApi.test.ts`, `frontend/src/test/routeFetch.ts`(**테스트 `fetch` 라우팅 헬퍼의 소유자는 이 계획** — 다른 화면 계획은 새 헬퍼를 만들지 않고 이 파일을 재사용)
- (레포 동기화 호출 `syncRepo`는 만들지 않는다 — 레포별 재시도는 기반 `usePrSyncContext().syncNow(repoId)`가 소유)

**Interfaces:**
- Consumes: `postJson`(`services/apiClient.ts`), `removeWatchedRepo(id)`(`integrationsApi.ts`, 연결 해제는 이것을 그대로 쓴다), `WatchedRepo`(`types/index.ts`), `RepoError`·`RepoSyncState`(`types/repoSync.ts`, 기반 Task 7 소유).
- Produces:
  - (`RepoErrorKind`·`RepoError`·`RepoSyncState`는 기반 `types/repoSync.ts`에서 import — 재정의 금지)
  - `interface ConnectedRepo extends WatchedRepo { lastAttemptAt: string|null; lastSuccessAt: string|null; lastError: RepoError|null; truncated: boolean }`
  - `class ApiError extends Error { status: number; code?: string; body?: unknown }`
  - `listConnectedRepos(): Promise<ConnectedRepo[]>` — `GET /api/v1/integrations/watched-repos/`, 필드가 없는 구버전 응답은 `null/false`로 채운다
  - `connectRepo(url: string): Promise<{ repo: ConnectedRepo; alreadyConnected: boolean }>` — `postJson`, 본문 `{ url }`만. 201→`false`, **409이고 `existing`이 있으면 `{repo: existing, alreadyConnected: true}`**, 그 외 오류는 `ApiError`(서버 `error` 문장을 `message`로)
  - `interface QueueProbe { login: string; knownLogin: boolean; repos: RepoSyncState[]; counts: { waiting: number; awaitingAuthor: number; closed: number } }`
  - `probeReviewQueue(login: string, teams?: string[], signal?: AbortSignal): Promise<QueueProbe | null>` — `GET review-queue/?login=&teams=`, 실패·비200은 `null`(예외 없음)
  - 테스트 헬퍼 `routeFetch(routes: Record<string, (req: { url: string; method: string; body: unknown }) => { status?: number; json?: unknown }>): { calls: Array<{ url: string; method: string; body: unknown }> }` — 키 `"GET /api/v1/…"`, `vi.stubGlobal('fetch')`로 설치, 일치 없으면 500.

- [ ] **Step 1: 실패 테스트**: (a) `connectRepo`가 201이면 `alreadyConnected:false`, 요청 본문에 `githubLogin` 키가 **없음**; (b) 409+`{code:'already_connected', existing:{id:1,…}}`→`{alreadyConnected:true, repo.id===1}`; (c) 400 `{code:'invalid_url', error:'GitHub 레포 URL이 아니에요'}`→`ApiError{status:400, code:'invalid_url', message:'GitHub 레포 URL이 아니에요'}`; (d) `listConnectedRepos`가 `lastSuccessAt` 없는 구형 객체에도 `lastError===null`·`truncated===false`; (e) (삭제됨: 레포별 동기화 POST 단언은 기반 `usePrSync.test.tsx`가 소유); (f) `probeReviewQueue('octocat',['acme/core'])` URL에 `login=octocat&teams=acme%2Fcore`, 500·네트워크 reject→`null`, `signal` abort→`null`.
- [ ] **Step 2:** `npx vitest run frontend/src/services/connectedReposApi.test.ts` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 기존 `integrationsApi.ts`는 수정하지 않는다(다른 화면 계획과 충돌 방지).
- [ ] **Step 4:** 위 명령·`npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 연결된 레포·로그인 확인 API 클라이언트 추가`

### Task 3: 레포 상태 문구 로직 — **기반 Task 7로 이관됨(2차 조정)**

`lib/repoCopy.ts`(`formatClock`, `formatFetched`, `RepoErrorView`, `describeRepoError`)와 `types/repoSync.ts`는 screen-review-queue와 공유하는 단일 정의로 **기반 계획 Task 7이 소유한다**(아래 시그니처와 테스트가 그쪽으로 옮겨졌다). 이 Task에서 할 일은 없고, Task 4·5·7은 `frontend/src/lib/repoCopy.ts`를 import만 한다. 아래는 소비하는 계약의 사본이다.

**Interfaces:**
- Consumes: `RepoError`(Task 2).
- Produces:
  - `formatClock(iso: string): string` — 로컬 24시간 `HH:mm`
  - `formatFetched(iso: string | null, now?: Date): string` — `null`→"아직 가져온 적 없어요", 1분 미만 "방금 가져옴", 이후 "N분 전 가져옴"/"N시간 전 가져옴"/"N일 전 가져옴", 미래 시각은 "방금 가져옴"(07 F11)
  - `interface RepoErrorView { title: string; body: string; canRetry: boolean; retryDisabledReason?: string; adminCopy?: string; canDisconnect: boolean }`
  - `describeRepoError(repo: string, err: RepoError, lastSuccessAt: string | null, now?: Date): RepoErrorView` — 문구는 07 §3.2:
    - `auth`: 제목 "서버의 GitHub 토큰이 거부됐어요", 본문 "이 문제는 앱에서 해결할 수 없어요. 아래 내용을 서버 관리자에게 전달해 주세요.", `canRetry:false`, `adminCopy` = "FlowSyncAI 서버의 GITHUB_TOKEN을 GitHub가 거부했어요(레포: {repo}). 토큰이 만료·폐기되지 않았는지 확인하고 서버 .env의 GITHUB_TOKEN을 다시 설정해 주세요."
    - `rate_limit`: 제목 "GitHub 호출 한도에 도달했어요", 본문 "{HH:mm} 이후 다시 가져올 수 있어요. 그때까지 목록은 {HH:mm} 기준이에요."(성공 이력 없으면 뒷문장 "아직 가져온 적이 없어요."), `resetAt`이 미래면 `retryDisabledReason` "{HH:mm}부터 가능"
    - `not_found`: 제목 "{repo} 레포를 읽을 수 없어요", 본문 "레포가 없어졌거나 서버 토큰에 읽기 권한이 없을 수 있어요.", `canRetry:true`, `adminCopy`(auth와 같은 형식, 레포 접근 권한 문장), `canDisconnect:true`
    - `upstream`: 제목 "GitHub가 응답하지 않았어요", 본문 "잠시 뒤에 다시 시도해 주세요. 목록은 {HH:mm} 기준이에요."
    - `unknown`: 제목 "{repo}를 가져오지 못했어요", 본문 upstream과 같은 형식. 모든 종류 `canDisconnect`는 `not_found`·`unknown`만 true.

- (테스트·구현·커밋은 기반 Task 7에서 수행. 이 계획의 Task 5·7 테스트가 `describeRepoError`의 `canRetry`/`retryDisabledReason`/`adminCopy` 소비를 검증한다.)

### Task 4: 내 로그인 폼(오타 안전장치)과 내 팀 입력

**Files:**
- Modify: `frontend/src/components/settings/MyLoginForm.tsx`(기반 Task 12 산출물), `frontend/src/screens/SettingsScreen.test.tsx`(로그인 오류 문구 단언만 갱신)
- Create: `frontend/src/components/settings/MyTeamsField.tsx`, `frontend/src/components/settings/MyLoginForm.test.tsx`, `frontend/src/components/settings/MyTeamsField.test.tsx`

**Interfaces:**
- Consumes: `useMyLogin`, `useMyTeams`, `normalizeLogin`(Task 1), `probeReviewQueue`(Task 2), `routeFetch`, `useUndo().schedule`(기반 Task 8).
- Produces: 기반 시그니처에 **선택 prop 추가만**: `<MyLoginForm initial?: string onSaved: (login: string) => void variant?: 'first-run' | 'settings'; candidates?: string[]; teams?: string[] />`(기본 `'settings'`). `<MyTeamsField />`(props 없음, `useMyTeams` 사용).
- 동작 계약(문구는 07 초안·와이어프레임 그대로):
  - 라벨 "내 GitHub 로그인", 힌트 "github.com/ 뒤에 오는 이름이에요.", 입력 중 미리보기 "{normalized} 으로 확인해요 (대소문자는 구분하지 않아요)"(`aria-describedby`로 연결, 기반 계획의 "…으로 저장돼요" 문구를 대체). 주 버튼: `first-run`은 "저장하고 내 리뷰 요청 보기", `settings`는 "저장". 무효 입력은 `aria-invalid`+인라인 "영문·숫자·하이픈만 쓸 수 있어요 (최대 39자)", **입력값 유지**.
  - 후보 칩 그룹(`role="group"`, 라벨 "팀에서 찾은 로그인"): `candidates`가 비면 영역 자체를 렌더하지 않는다. 칩 클릭은 입력을 채울 뿐 저장하지 않는다.
  - **설정 변형(`variant='settings'`, 결정 40): 즉시 저장 + 10초 되돌리기.** 유효한 입력이면 확인 단계 없이 `save`하고 `useUndo().schedule({ label: "내 로그인을 {새}로 바꿨어요", hide: 저장 적용(이미 저장됨), restore: 이전 로그인 복원(이전이 없으면 `clear`), commit: no-op `{ok:true}`, windowMs: 10_000 })`로 "되돌리기" 알림을 띄운다(이전 값과 같으면 알림 없음). 저장 뒤 백그라운드로 `probeReviewQueue`(3초 제한)를 호출해 아래 "본 적 없는 이름" 조건이면 되돌리기 알림 옆 `role="status"` 한 줄 "“{입력}”은 이 팀에서 본 적 없는 이름이에요. 철자를 확인해 주세요."만 덧붙인다(저장은 막지 않는다).
  - 안전장치(07 R25/F6, **첫 실행 변형 전용**): 제출 시 유효한 입력이 (1) `candidates`에 대소문자 무시로 있으면 즉시 저장, (2) 아니면 `probeReviewQueue(login, teams)`를 3초 제한으로 호출해 **`probe.repos.some(r => r.lastSuccessAt)`이고 `knownLogin===false`일 때만** 확인 단계로 간다: "“{입력}”은 이 팀에서 본 적 없는 이름이에요. 맞나요?" + 보조 "철자와 대문자는 상관없어요." + [맞아요](저장) [수정](입력으로 복귀·포커스). (3) 프로브 `null`·성공 이력 없는 서버·`knownLogin===true`면 확인 없이 저장. 확인 단계는 `role="alertdialog"`가 아니라 폼 아래 인라인 `role="status"` 영역.
  - `MyTeamsField`: 라벨 "내 팀 (선택)", 힌트 "팀에게 요청된 리뷰도 내 리뷰 요청에 보여요. 예: acme/backend, acme/core. 서버가 팀 멤버십을 알지 못해서 직접 알려 주셔야 해요. 이 브라우저에만 저장돼요.", 저장 시 무효 토큰은 인라인 "‘{토큰}’은 org/팀이름 형식이 아니에요"(전체 저장 안 함, 입력 유지), 11개 이상 "팀은 10개까지 넣을 수 있어요", 성공은 `role="status"` "내 팀 N개를 저장했어요"(0개면 "내 팀을 비웠어요").

- [ ] **Step 1: 실패 테스트** `MyLoginForm.test.tsx`(`routeFetch`로 review-queue 스텁): (a) `'@Octocat '` 입력 시 미리보기 "octocat 으로 확인해요"; (b) 후보에 `Octocat`이 있으면 칩 클릭→입력에 채워지고 아직 저장 안 됨, 제출 시 프로브 요청 0회·`onSaved('octocat')`; (c) `'a b'`·`'octocat-'` 제출→`aria-invalid="true"`·오류 문구·`onSaved` 미호출·입력 유지; (d0) `variant="settings"`에서 `'minji'` 저장 → 확인 단계 없이 즉시 저장·`onSaved`·"되돌리기" 알림, 되돌리기 클릭 → 이전 로그인 복원(이전이 없었으면 비움)·10초 경과 후에도 새 값으로 되돌아가지 않음, 같은 값 재저장은 알림 없음, 프로브가 `knownLogin:false`+성공 이력이면 저장은 유지된 채 "본 적 없는 이름" 한 줄; (d) 첫 실행 변형에서 후보 없음+프로브 `{knownLogin:false, repos:[{lastSuccessAt:'…'}]}`→확인 문구가 나오고 [맞아요] 전에는 저장소가 비어 있음, [맞아요]→저장·`onSaved`, [수정]→입력으로 포커스; (e) 프로브 `{knownLogin:false, repos:[{lastSuccessAt:null}]}`(아직 가져온 적 없는 서버)→확인 없이 저장(오경보 없음); (f) 프로브 500/네트워크 실패/3초 초과(fake timers)→확인 없이 저장; (g) `knownLogin:true`→확인 없이 저장; (h) `candidates=[]`면 "팀에서 찾은 로그인" 텍스트가 DOM에 없음; (i) 저장소가 throw하는 환경에서도 저장 후 `onSaved` 호출. `MyTeamsField.test.tsx`: `'acme/Core, acme/api'`→저장 `['acme/core','acme/api']`·상태 문구; `'acme'`→인라인 오류·저장 안 됨·입력 유지; 빈 입력 저장→`getMyTeams()` `[]`·"내 팀을 비웠어요"; 11개→"10개까지".
- [ ] **Step 2:** `npx vitest run frontend/src/components/settings/MyLoginForm.test.tsx frontend/src/components/settings/MyTeamsField.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 제출 중에는 버튼 `aria-disabled`+"확인하는 중…". `SettingsScreen.test.tsx`의 기존 오류 문구 단언을 새 문구로 갱신.
- [ ] **Step 4:** 위 명령 + `npx vitest run frontend/src/screens` + `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 로그인 입력 안전장치와 내 팀 입력 추가`

### Task 5: 연결된 레포 섹션 (WatchedReposPanel 이관 완결)

**Files:**
- Create: `frontend/src/components/settings/ConnectRepoForm.tsx`, `frontend/src/components/settings/ConnectedRepoRow.tsx`, `frontend/src/components/settings/ConnectedReposSection.test.tsx`
- Modify: `frontend/src/components/settings/ConnectedReposSection.tsx`(기반 Task 12 산출물)
- Verify-only: `frontend/src/components/common/WatchedReposPanel.tsx`는 기반 Task 12에서 삭제돼 있어야 한다(없으면 이 태스크에서 삭제).

**Interfaces:**
- Consumes: `listConnectedRepos`, `connectRepo`, `ApiError`, `ConnectedRepo`(Task 2); `describeRepoError`, `formatFetched`(기반 Task 7의 `lib/repoCopy.ts`); `removeWatchedRepo`(기존); `useUndo().schedule`(기반 Task 8); `usePrSyncContext().syncNow(repoId?)`(기반 Task 7, 행 "다시 시도"는 `syncNow(repo.id)`); `useToasts().notify`.
- Produces: `<ConnectRepoForm onConnected: (repo: ConnectedRepo, alreadyConnected: boolean) => void autoFocus?: boolean />`(첫 실행 흐름이 재사용), `<ConnectedRepoRow repo: ConnectedRepo now?: Date onRetry: (id) => void onDisconnect: (repo) => void retrying: boolean />`, `ConnectedReposSection()`(props 없음).
- 이관 체크(옛 패널의 모든 기능이 새 섹션에 있어야 삭제 가능): URL 추가, 목록, 해제, "지금 가져오기", 오류 목록, 서버 토큰 미설정 안내(옛 `GITHUB_TOKEN` 정규식 힌트는 `auth`의 `adminCopy`로 대체).
- 동작 계약: 섹션 제목 "연결된 레포" + 우측 버튼 "지금 가져오기"(`syncNow`, 레포 0개면 렌더 안 함), 부연 "팀이 함께 쓰는 목록이에요. 여기서 가져온 리뷰 요청이 각자의 “내 리뷰 요청”이 돼요." 행: 이름(`owner/name`), `formatFetched(lastSuccessAt)`, 상태 배지 텍스트 "정상"/"실패"(`lastError`가 있으면 실패, 색 단독 금지), 실패면 `describeRepoError` 제목·본문, `truncated`면 "일부만 가져왔어요". 행 버튼: "다시 시도"(`canRetry`; 사유가 있으면 `aria-disabled`+사유 텍스트, 클릭 무시), "관리자에게 보낼 내용 복사"(`adminCopy`가 있을 때; `navigator.clipboard.writeText` 성공 시 `role="status"` "복사했어요", 실패·미지원이면 같은 내용을 읽기 전용 입력에 펼쳐 선택), "연결 해제"(`aria-label="{repo} 연결 해제"`). 추가 폼: 라벨 "레포 추가", placeholder "github.com/owner/name", 버튼 "추가"(진행 중 "추가하는 중…"). 빈 상태: "아직 리뷰 요청을 가져올 레포가 없어요" / "레포를 연결하면 내게 온 리뷰 요청이 여기에 모여요." 쿼리 `?focus=repos`이면 마운트 시 추가 입력에 포커스·스크롤. 로드 실패: "서버에 연결할 수 없어요" + "이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요." + [다시 시도].

- [ ] **Step 1: 실패 테스트**(`routeFetch`, fake timers, `renderWithRouter`): (a) 빈 목록→빈 상태 문구와 "지금 가져오기" 버튼 없음, `/settings?focus=repos`로 열면 추가 입력이 `document.activeElement`; (b) 정상+실패 2행→"정상"/"실패" 텍스트, 실패 행에 사유 본문, `truncated` 문구; (c) `auth` 실패 행에 "다시 시도" 없음·복사 버튼 있음, 클립보드 reject면 읽기 전용 입력에 `adminCopy` 노출; (d) `rate_limit`+미래 `resetAt`→"다시 시도"가 `aria-disabled="true"`·사유 텍스트 존재·클릭해도 `syncNow` 미호출; (e) 추가 201→행 추가·입력 비움·`syncNow` 1회; (f) 추가 409+`existing`→행 중복 없음·"이미 연결된 레포예요" `role="status"`·오류 알림 없음; (g) 400 `invalid_url`→서버 문장이 인라인 `aria-invalid`로, 입력값 유지; 네트워크 실패→"저장하지 못했어요 / 입력한 내용은 그대로 두었어요. 잠시 후 다시 시도해 주세요."; (h) 연결 해제→행 즉시 사라짐, 알림에 "acme/api 연결을 해제했어요 · 팀 모두에게 적용돼요"와 "되돌리기", 9.9초엔 DELETE 0회·10초에 정확히 1회; (i) 되돌리기→행 복귀·DELETE 0회; (j) 대기 중 `listConnectedRepos`가 같은 레포를 다시 내려줘도(재조회 트리거) 행이 숨김 유지; (k) 해제 DELETE 실패→행 복귀+`role="alert"`; (l) 마지막 레포 해제→빈 상태 문구; (m) 행 "다시 시도"→`syncNow(id)` 1회(모킹한 `PrSyncContext`)·연타해도 1회·끝나면 목록 재조회; (n) DOM에 "감시"·"동기화" 없음, `WatchedReposPanel` import 없음.
- [ ] **Step 2:** `npx vitest run frontend/src/components/settings/ConnectedReposSection.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 숨김 id 집합(`Set<string|number>`)을 컴포넌트 state로 두고 `useUndo.schedule({ label, hide, restore, commit })`의 `commit`은 `removeWatchedRepo(id)`를 `{ok}`로 감싼다. 해제 직후 `onCreated` 계열 전역 새로고침은 호출하지 않는다.
- [ ] **Step 4:** 위 명령·`npm run lint`·`npm run build` PASS
- [ ] **Step 5: 커밋** `feat: 연결된 레포 섹션(상태·409 합류·10초 되돌리기)`

### Task 6: 영역 이름 별칭 편집 (서버 저장, 연결 끊김, 충돌)

**Files:**
- Create: `frontend/src/services/areaAliasesApi.ts`, `frontend/src/services/areaAliasesApi.test.ts`, `frontend/src/components/settings/AreaNamesSection.tsx`, `frontend/src/components/settings/AreaNamesSection.test.tsx`

**Interfaces:**
- Consumes: `ApiError`, `listConnectedRepos`, `ConnectedRepo`(Task 2), `postJson`, `useUndo`, **`fetchAreas`·`fetchAreaAliases`·`AreasApiError`(`services/areasApi.ts`, screen-area-flow Task 1 소유 — 읽기는 여기서 재사용하고 이 계획에 영역/별칭 GET 클라이언트를 따로 만들지 않는다)**.
- Produces:
  - `AreaAlias`는 **정의하지 않고** `frontend/src/types/areas.ts`(screen-area-flow T1 소유, 필드 `id, repoId, pathPrefix, displayName, status, createdAt, updatedAt`)에서 import한다. 이 계획이 먼저 실행되면 그 파일에 같은 형태로 타입만 만들고 영역 흐름 T1이 재사용한다.
  - `class AliasConflictError extends ApiError { current?: AreaAlias; existing?: AreaAlias }`
  - `createAreaAlias(repoId, pathPrefix: string, displayName: string): Promise<AreaAlias>`(409 `alias_exists`→`AliasConflictError.existing`, 400 `invalid_name`→`ApiError`), `updateAreaAlias(repoId, id: number, displayName: string, expectedUpdatedAt?: string): Promise<AreaAlias>`(409 `conflict`→`AliasConflictError.current`), `deleteAreaAlias(repoId, id: number): Promise<void>`
  - `<AreaNamesSection />`(props 없음)
- 동작 계약: 제목 "영역 이름", 부연 "폴더 이름 대신 팀이 부르는 이름을 붙여요. 팀 전체에 공유돼요." 레포가 2개 이상이면 `<select>`(라벨 "레포")로 선택, 0개면 "연결된 레포가 있으면 영역 이름을 붙일 수 있어요". 표(`md` 미만은 행 카드): 열 "원래 경로 / 표시 이름 / 상태". 행 = 영역 경로(`fetchAreas(repoId, 30)`의 `areas[].pathPrefix`) ∪ 별칭(`fetchAreaAliases`, 경로 접두사 기준 합집합). 표시 이름 입력은 `aria-label="{경로} 표시 이름"`, 행별 "저장" 버튼(값이 바뀌고 1~80자일 때만 활성, 아니면 `aria-disabled`+"이름은 1~80자로 써 주세요"). 별칭 있음→`updateAreaAlias(…, alias.updatedAt)`, 없음→`createAreaAlias`. 상태 텍스트: "연결됨" / "연결 끊김"(경로가 현재 영역에 없음) / "확인하지 못함"(`unknown` 또는 영역 목록 조회 실패). 끊긴 행 부가 문구 "팀이 붙인 이름 · 가리키던 경로 {경로}가 코드에서 보이지 않아요". "이름 지우기"(별칭이 있을 때)는 `useUndo.schedule`(commit=`deleteAreaAlias`, 라벨 "‘{이름}’ 이름을 지웠어요 · 팀 모두에게 적용돼요")이며 끊긴 행은 창이 열린 동안 행째 숨김. 영역 목록 조회 실패 시 상단 "영역 목록을 읽지 못했어요. 이미 붙인 이름만 보여드려요."로 저하(별칭 편집·삭제는 계속 가능). 충돌(409): 입력값을 유지한 채 행 아래에 "다른 사람이 방금 이름을 바꿨어요 / 지금 이름은 “{current}”예요. 내가 쓴 “{mine}”은 그대로 남겨 두었어요." + [내 이름으로 저장](`expectedUpdatedAt=current.updatedAt`로 재시도) [그대로 두기](서버 값 채택). 저장 실패(네트워크): 행 인라인 `role="alert"` "저장하지 못했어요 / 입력한 내용은 그대로 두었어요. 잠시 후 다시 시도해 주세요." 성공은 `role="status"` "저장했어요". 하단 "이름을 비우면 원래 경로 이름으로 돌아가요. 합치기는 아직 지원하지 않아요."

- [ ] **Step 1: 실패 테스트** `areaAliasesApi.test.ts`: `updateAreaAlias`가 본문에 `expectedUpdatedAt`을 싣고, 409 `conflict`+`current`→`AliasConflictError.current`; `createAreaAlias` 409 `alias_exists`→`.existing`; 본문에 `githubLogin`류 없음. (영역·별칭 GET 단언은 area-flow `areasApi.test.ts`가 소유) `AreaNamesSection.test.tsx`(`vi.mock('../../services/areasApi')`): (a) 영역 2개+별칭 1개→행 2개, 별칭 행 입력값=표시 이름·"연결됨"; (b) 별칭 경로가 영역에 없음→"연결 끊김" 텍스트와 안내 문구, 색 단독 아님; (c) 새 이름 입력→"저장"이 POST(`pathPrefix`,`displayName`)·"저장했어요"; (d) 빈 문자열·81자→저장 버튼 `aria-disabled`·요청 0회; (e) PATCH 409→입력값 "결제 흐름" 유지·충돌 문구에 서버 이름 표시, [내 이름으로 저장]→`expectedUpdatedAt`이 서버 최신 `updatedAt`인 PATCH 1회, [그대로 두기]→입력이 서버 값으로; (f) POST 409 `alias_exists`도 같은 충돌 UI; (g) "이름 지우기"→10초 뒤 DELETE 1회, 되돌리기→DELETE 0회, 끊긴 행은 창 동안 사라졌다 복귀; (h) `fetchAreas`가 502(`AreasApiError`)로 reject→저하 안내 문구가 나오고 별칭 행은 편집·삭제 가능; (i) 레포 2개일 때 `<select>` 변경이 해당 레포의 별칭을 다시 조회; (j) 네트워크 실패→행 인라인 오류·입력 유지; (k) 모든 입력에 접근 가능한 이름이 있음(`getAllByRole('textbox')` 전부 `name` 비어 있지 않음).
- [ ] **Step 2:** `npx vitest run frontend/src/services/areaAliasesApi.test.ts frontend/src/components/settings/AreaNamesSection.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 행 키는 `pathPrefix`. PATCH·DELETE는 일반 `fetch`, POST만 `postJson`. 영역 목록은 느릴 수 있으므로 섹션이 화면에 나타난 뒤 비동기 로드("영역을 불러오는 중…").
- [ ] **Step 4:** 위 명령·`npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 영역 이름 별칭 편집(충돌·연결 끊김·되돌리기)`

### Task 7: 첫 실행 흐름 (첫 사람 / 합류자 / 첫 가져오기 결과)

**Files:**
- Create: `frontend/src/components/firstrun/FirstRunGate.tsx`, `FirstRunFlow.tsx`, `FirstSyncProgress.tsx`, `FirstSyncResult.tsx`, 각 `*.test.tsx`
- Modify: `frontend/src/routes.tsx`(`/me` 요소를 `<FirstRunGate><MyReviewsScreen/></FirstRunGate>`로 감쌈, 추가만), `frontend/src/components/layout/AppShell.tsx`(로그인 없음+`/me`일 때 `nav` 미렌더, 추가만), `frontend/src/components/layout/AppShell.test.tsx`(해당 케이스 추가)

**Interfaces:**
- Consumes: `useMyLogin`, `useMyTeams`(Task 1), `MyLoginForm`(Task 4), `ConnectRepoForm`(Task 5), `listConnectedRepos`, `probeReviewQueue`, `QueueProbe`, `ConnectedRepo`(Task 2), `describeRepoError`, `formatFetched`(기반 Task 7의 `lib/repoCopy.ts`), `usePrSyncContext(): { status: SyncStatusInfo; syncNow(): Promise<void> }`(기반 Task 7), `ROUTES`.
- Produces: `<FirstRunGate children />`(마운트 시점의 `login===null`이면 `FirstRunFlow`, 끝나면 `children`; 이미 로그인이 있으면 처음부터 `children`), `<FirstRunFlow onFinished: () => void />`, `<FirstSyncProgress repos: ConnectedRepo[] running: boolean elapsedMs: number />`, `<FirstSyncResult login: string repos: ConnectedRepo[] probe: QueueProbe | null onChangeLogin: () => void onRetry: () => void onFinish: () => void />`.
- 단계(`'login' → 'repo'(레포 0개일 때만) → 'sync' → 'result'`)와 분기(04 §4, 05 J1):
  - **첫 사람(J1-a)**: 레포 0개 → 로그인 → 레포 추가 → 가져오기. **합류자(J1-b)**: 레포 ≥1 → 로그인 입력 화면 상단에 "팀이 이미 레포 N개를 연결해 두었어요 / 로그인만 입력하면 바로 시작할 수 있어요. 레포를 따로 추가하지 않아도 돼요." 콜아웃 → 로그인 → 곧바로 가져오기. **레포 목록 로드 실패(E1)**: 콜아웃 생략, 로그인은 그대로 입력 가능, 가져오기 단계에서 "서버에 연결할 수 없어요 / 이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요. 지금은 리뷰 요청을 보여드릴 수 없어요." + [다시 시도].
  - 로그인 단계 화면: `h1` "누구의 리뷰 요청을 보여드릴까요?", 본문 "GitHub 로그인을 입력하면, 연결된 레포에서 그 계정에게 온 리뷰 요청을 모아 보여드려요. 입력한 로그인은 이 브라우저에만 저장돼요.", `MyLoginForm variant="first-run"`, 보조 "나중에 설정에서 바꿀 수 있어요."(건너뛰기 버튼 없음). 후보 칩 `candidates` = 연결된 레포 응답의 비어 있지 않은 `githubLogin` 고유값(없으면 칩 영역 없음). 레포 단계: `h1` "리뷰 요청을 가져올 레포를 연결해 주세요", `ConnectRepoForm autoFocus`, 409는 성공으로 취급.
  - 가져오기 단계: `FirstSyncProgress` — `role="status"` "레포 N개에서 리뷰 요청을 확인하는 중이에요", 레포별 행 "확인하는 중…"(스피너 단독 금지, 텍스트 필수), 10초(`elapsedMs`≥10000) 넘으면 "계속 확인 중이에요. 다른 화면으로 가도 돼요." `syncNow()` 호출 후 `status.syncing`이 false가 될 때까지(이미 진행 중인 가져오기가 있어도 그것이 끝날 때까지) 기다린 뒤 `listConnectedRepos()`와 `probeReviewQueue(login, teams)`로 결과를 모은다.
  - 결과 단계(`FirstSyncResult`): 레포별 행(성공 "확인했어요" / 실패 `describeRepoError` 제목+본문+조건부 "다시 시도"), 요약: 대기 N건>0이면 "레포 N개에서 리뷰 대기 M건을 찾았어요", 0건+`knownLogin:true`면 "지금 리뷰 대기 PR이 없어요", 0건+`knownLogin:false`면 E5 "레포 N개에서 “{login}”에게 온 리뷰 요청을 찾지 못했어요. 정말 없는 걸 수도 있고, 로그인이 다른 이름일 수도 있어요." + [로그인 확인](→로그인 단계, 입력값 유지), 프로브 `null`이면 건수 요약 없이 레포별 결과만. **모든 결과에 이름 재확인 한 줄**: "{login}의 큐예요. 내 계정이 아니라면 [로그인 바꾸기]"(07 F6 보완). 전 레포 실패면 [다시 시도], 주 버튼 "내 리뷰 요청 보기"(항상 활성, 실패여도 막지 않음)→`onFinished`.
  - 각 단계 전환 시 새 단계의 `h1`로 포커스(`tabIndex=-1`), 진행·결과 요약은 `role="status"`, 오류는 `role="alert"`.

- [ ] **Step 1: 실패 테스트**(`routeFetch`, 모킹한 `PrSyncContext`, fake timers, `renderWithRouter`): (a) 레포 0개+로그인 없음→`h1` 로그인 질문, 콜아웃 없음, 저장→레포 단계(`h1` "리뷰 요청을 가져올 레포를 연결해 주세요")→URL 제출 201→가져오기→결과 요약 "…리뷰 대기 3건을 찾았어요"→"내 리뷰 요청 보기"→`children` 렌더; (b) 레포 2개(합류자)→콜아웃 "팀이 이미 레포 2개를 연결해 두었어요", 저장 후 **레포 단계 없이** 바로 가져오기(`connectRepo` 호출 0회); (c) 레포 단계에서 409→레포 단계가 성공으로 넘어감·오류 문구 없음; (d) 레포 목록 500→콜아웃 없음·로그인 저장 가능, 가져오기 단계에 E1 문구와 [다시 시도]; (e) `useMyLogin`이 이미 값을 가진 상태로 `/me`→Gate가 `children`을 바로 렌더(`FirstRunFlow` 미마운트); (f) 가져오기가 10초 넘게 걸리면(fake timers) "계속 확인 중이에요. 다른 화면으로 가도 돼요."; `status.syncing`이 true인 동안 결과 단계로 넘어가지 않음; (g) 일부 레포 실패→성공 레포는 "확인했어요"·실패 레포는 사유와 함께, 주 버튼 활성; 전 레포 `auth` 실패→"다시 시도" 없음; (h) 0건+`knownLogin:false`→E5 문구와 [로그인 확인], 클릭 시 로그인 단계로 돌아가 입력값 유지; 0건+`knownLogin:true`→"지금 리뷰 대기 PR이 없어요"; (i) 프로브 실패→건수 줄 없음·예외 없음; (j) 결과 화면 어디서나 "{login}의 큐예요" 재확인 줄과 [로그인 바꾸기]; (k) 단계 전환마다 `document.activeElement`가 새 `h1`; (l) 저장소가 throw하는 환경에서 (a) 전체가 끝까지 진행; (m) `AppShell`: 로그인 없음+`/me`에서 `nav[aria-label="주 메뉴"]` 없음·`main`·`h1` 1개, 로그인 있으면 `nav` 있음, 로그인 없음+`/settings`에서는 `nav` 있음; (n) 화면 문자열에 "감시"·"동기화" 없음.
- [ ] **Step 2:** `npx vitest run frontend/src/components/firstrun frontend/src/components/layout/AppShell.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 단계 상태는 `FirstRunFlow` 로컬 `useReducer`. `FirstRunGate`의 활성 여부는 마운트 시 `useState(() => login === null)`로 한 번만 정하므로 흐름 도중 로그인이 저장돼도 `children`으로 튕기지 않는다. 기반의 `MyReviewsScreen` 내부 "로그인 없음" 분기는 이 Gate 때문에 도달 불가가 되지만 이 태스크에서 건드리지 않는다(리뷰 큐 화면 계획이 화면을 다시 쓸 때 정리).
- [ ] **Step 4:** 위 명령 + `npm test` + `npm run lint` + `npm run build` PASS
- [ ] **Step 5: 커밋** `feat: 첫 실행·합류자 흐름과 첫 가져오기 결과 화면`

### Task 8: 설정 화면 조립 · 테마 · 최종 가드

**Files:**
- Modify: `frontend/src/screens/SettingsScreen.tsx`, `frontend/src/screens/SettingsScreen.test.tsx`
- Create: `frontend/src/components/settings/settingsGuards.test.ts`

**Interfaces:**
- Consumes: `MyLoginForm`, `MyTeamsField`(Task 4), `ConnectedReposSection`(Task 5), `AreaNamesSection`(Task 6), `useMyLogin`(Task 1), `useTheme`(기반 Task 3: `mode`/`setMode`), `usePrSyncContext`(기반 Task 7), `listConnectedRepos`(Task 2).
- Produces: `SettingsScreen` — `h1` "설정", 섹션 `h2`(각 `aria-labelledby`): **나** → **연결된 레포** → **영역 이름** → **화면**(06 §7 순서). 한 열 레이아웃(최대 폭은 토큰 간격 단위, 고정 `w-*` 금지).
  - **나**: 부연 "이 브라우저에만 저장돼요. 다른 기기에서는 다시 입력해야 해요.", `MyLoginForm`(`variant="settings"`, `candidates`는 연결된 레포의 `githubLogin` 고유값, `teams`는 `useMyTeams().teams`), 저장되면 `role="status"` "{login}의 큐로 바꿨어요"와 힌트 "저장하면 바로 다시 가져와요."의 실행(`syncNow()` 1회), 로그인이 있으면 "{login}의 큐"를 상시 표시(07 §5 #11). 같은 섹션 안에 `MyTeamsField`. 로그인 없이 설정에 직접 들어오면 빈 폼과 "로그인을 입력하면 내 리뷰 요청을 볼 수 있어요".
  - **화면**: `role="radiogroup"` 라벨 "화면"의 라디오 3개 "시스템 설정 따르기"/"밝게"/"어둡게"(`useTheme().mode`/`setMode`, 결정 40; 기본 선택은 현재 `mode`, 저장값이 없으면 "시스템 설정 따르기"). 선택 문구 아래 한 줄 "지금은 {밝게|어둡게}로 보이고 있어요"(`dark` 해석 결과).
- 최종 가드 `settingsGuards.test.ts`: 이 계획이 만든·고친 파일 목록(`components/settings/*`, `components/firstrun/*`, `services/connectedReposApi.ts`, `services/areaAliasesApi.ts`, `lib/repoCopy.ts`, `screens/SettingsScreen.tsx`)의 비테스트 소스에서 0건: 원색 팔레트 클래스(`/\b(slate|gray|zinc|neutral|red|green|amber|emerald|blue|indigo|violet)-\d{2,3}\b/`), `dark:` 변형, `localStorage|sessionStorage`, `githubLogin`을 요청 본문에 싣는 코드(`/githubLogin\s*:/` 중 읽기 전용 타입 선언 제외), `/감시|동기화|Accept|\([A-Za-z ]+\)|WatchedReposPanel|formatLastSynced/`, `animate-(pulse|ping|bounce)`, `/<(div|span)\b[^>]*\sonClick=/`.

- [ ] **Step 1: 실패 테스트** `SettingsScreen.test.tsx`: (a) 4개 `h2`가 "나 / 연결된 레포 / 영역 이름 / 화면" 순서, `h1` 1개, 각 섹션 `aria-labelledby`; (b) 로그인 `'@Octocat '` 저장→저장소 `octocat`·"octocat의 큐"·`syncNow` 1회·상태 문구; (c) 라디오 "어둡게"→`document.documentElement.classList.contains('dark')`·재마운트 후에도 유지, "밝게"→해제, "시스템 설정 따르기"→저장값 `'system'`이고 `matchMedia`가 dark면 `html.dark`·OS 설정 `change` 이벤트에 즉시 반응, 저장값이 없을 때 초기 선택이 "시스템 설정 따르기"; (d) 저장소 throw 환경에서 로그인 저장이 세션 안에서 반영; (e) `/settings`에 `SyncStatusLine`("가져옴"으로 끝나는 상태 줄) 없음, "지금 가져오기" 버튼은 레포 섹션에만 1개; (f) `/settings?focus=repos`→레포 추가 입력에 포커스; (g) 한 섹션(영역 이름)의 조회가 실패해도 다른 섹션은 정상 렌더; (h) 전체 텍스트에 "감시"·"동기화" 없음. 그리고 가드 테스트.
- [ ] **Step 2:** `npx vitest run frontend/src/screens/SettingsScreen.test.tsx frontend/src/components/settings/settingsGuards.test.ts` → FAIL
- [ ] **Step 3: 구현** 조립과 위 계약. 기존 `SettingsScreen`의 인라인 섹션 코드는 해당 컴포넌트 호출로 교체.
- [ ] **Step 4: 최종 검증** `npm run lint`, `npm test`, `npm run build` 전부 PASS. 수동(백엔드 계약 §3·§5 구현 후, `docker compose up` + `npm run dev`): ① 저장소를 비운 브라우저로 `/#/me` 열기→로그인 질문·내비 없음, ② 레포가 이미 있는 서버에서 같은 흐름→콜아웃·레포 단계 생략, ③ 설정에서 레포 추가·409·연결 해제 10초 되돌리기, ④ 영역 이름 저장 후 `영역 흐름` 화면에 이름 반영(두 브라우저로 충돌 재현), ⑤ OS·앱 다크 전환에서 모든 새 요소가 토큰으로 렌더, ⑥ DevTools 320px에서 가로 스크롤 없음, 키보드만으로 전 과정 완료, ⑦ DevTools에서 서버 오프라인/`localStorage` 차단 시 예외 없음.
- [ ] **Step 5: 커밋** `feat: 설정 화면 조립(나·내 팀·연결된 레포·영역 이름·화면)과 가드 테스트`

---

## 소비/생산 메모와 충돌 후보

- **소유 정리(2차 조정):** 레포 오류 문구·타입(`lib/repoCopy.ts`, `types/repoSync.ts`)=기반 T7, 레포별 동기화 호출=기반 `usePrSync.syncNow(repoId)`, 영역·별칭 GET=area-flow T1, 테마 모드=기반 T3. 이 계획은 모두 import만 한다.
- **기반 계획 추가 수정(모두 "추가만")**: `lib/storage.ts`(`myTeams` 키·`onStorageChange`·`normalizeLogin` 하이픈 규칙 보강), `routes.tsx`(`/me`에 Gate), `AppShell.tsx`(로그인 없음 `/me`에서 `nav` 숨김), `MyLoginForm`(선택 prop 3개, 미리보기·오류 문구 교체).
- **다른 화면 계획이 알아야 할 것**: 내 로그인·팀은 `useMyLogin()`/`useMyTeams()`로 읽는다(큐 요청의 `login`, `teams=` 파라미터). 설정의 "레포 연결" 목적지는 `/settings?focus=repos`(HashRouter에서도 동작하도록 해시 앵커 대신 쿼리 사용). 큐 빈 상태의 E5 "로그인 확인" 링크는 `ROUTES.settings`로 보내면 된다.
- **계약 의존**: `knownLogin`(§1), `watched-repos` 신규 필드와 409 `existing`(§3), `area-aliases`(§5), `areas/`(§4.1). 모든 테스트는 `routeFetch` 스텁이라 백엔드 없이 통과하며, 수동 검증만 백엔드 구현이 필요하다.
- **의도적으로 하지 않은 것**: 로그인 변경 확인 대화상자(07 §3.4; 결정 40에 따라 즉시 저장 + 10초 되돌리기), 로그인 후보 전용 엔드포인트(결정 40), 후보 로그인 원래 철자 표시(R24, 저장은 소문자), 후보를 PR 작성자·커밋 작성자까지 넓히기(계약에 후보 엔드포인트 없음), 영역 합치기, 서버 `restore` 엔드포인트 사용(10초 지연 DELETE로 충분), 알림 설정.

## Self-Review

- **스펙 커버리지**: 로그인 입력·정규화·실존 타인 안전장치=T1·T4·T7(재확인 줄), 내 팀(결정 31)=T1·T4·T8, 연결된 레포 추가·해제·합류자 409·되돌리기=T5·T7, 첫 가져오기 진행·결과=T7, 영역 별칭(서버 저장·연결 끊김·충돌)=T6, 테마=T8, WatchedReposPanel 이관과 용어=T5·T8 가드, 첫 실행/합류자/미완료 분기=T7(+기반 `/me` 빈 상태의 `focus=repos` 목적지는 T5), 오류 문구 07 초안=기반 T7(`lib/repoCopy.ts`)·T4·T6·T7.
- **타입 일관성**: `ConnectedRepo`/`RepoError`/`QueueProbe`/`ApiError`(T2)를 T3~T7이 동일 이름으로 소비, `ConnectRepoForm`(T5)을 T7이 재사용, `useMyLogin`/`useMyTeams`(T1)를 T4·T7·T8이 소비. 기반의 `useUndo.schedule`·`usePrSyncContext`·`ROUTES`·`renderWithRouter`는 시그니처 그대로 사용.
- **비례**: 코드 본문 없이 시그니처·문구·단언 위주.

## 태스크 의존 그래프

```
기반 계획 Task 1~10·12 (선행)
        │
        ├─ T1 (storage·훅) ─────────────┬─────────────┐
        ├─ T2 (API 클라이언트) ─┬───────┼─────┐       │
        └─ T3 (기반 T7로 이관, 작업 없음) ┼─┐   │       │
                                │       │ │   │       │
                         T4 (로그인·팀 폼) ◄─(T1,T2)  │
                                │       │ │   │       │
                         T5 (레포 섹션) ◄─(T2, 기반 T7)│
                                │       │ │   │       │
                         T6 (영역 이름) ◄─(T2)        │
                                │       │ │           │
                         T7 (첫 실행) ◄─(T1,T2,T3,T4,T5)
                                │
                  T8 (설정 조립·가드) ◄─(T1,T4,T5,T6)  [T7과 병렬 가능]
```

**병렬 가능 묶음**: A = {T1, T2}(서로 다른 새 파일; T1만 `storage.ts` 수정; T1은 queue·tasks 화면도 쓰므로 가장 먼저) → B = {T4, T5, T6}(T4는 T1·T2, T5는 T2·기반 T7, T6은 T2·area-flow T1에 의존; `SettingsScreen.test.tsx`를 T4만 수정) → C = {T7, T8}(T7은 T4·T5, T8은 T4·T5·T6 필요; 파일 겹침 없음, 단 T8의 최종 가드는 T7 파일도 훑으므로 가드 통과 확인은 C 전부 끝난 뒤).
