# Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API 계약에 의존하지 않는 프런트 기반(토큰 골격, 라우터, App 분해, localStorage 래퍼, 접근 가능한 작업 상세 대화상자, 되돌리기/동기화 상태 공용 컴포넌트, 폐기물 제거)을 깔아 이후 Impeccable 시각 디자인과 백엔드 큐 작업이 얹힐 자리를 만든다.

**Architecture:** `App.tsx`(590줄)를 "Provider 조립 + Routes"로 줄이고, 상태·mutation은 `hooks/`(Context 제공), 화면은 `screens/`, 순수 로직은 `lib/`, HTTP는 `services/`로 나눈다. `TaskModal`(1,093줄)은 URL을 가진 `/tasks/:id` 대화상자(`components/task/*`)로 쪼개고 체크리스트·역할 검토는 접힘 보조 영역으로 강등한다. 색·타이포의 실제 값은 임시값이고 구조(토큰 이름, `dark` variant)만 확정한다.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind 4(`@tailwindcss/vite`), Vitest 5 (+ 추가: `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `react-router` v7).

**Spec:** `docs/ux/00-context.md`(확정 결정 1~40), `docs/ux/01-strategy.md`, `docs/ux/02-data-feasibility.md`, `docs/ux/03-current-ui-inventory.md`, `docs/ux/04-information-architecture.md`, `docs/ux/05-user-journeys.md`, `docs/ux/06-wireframes.md`, `docs/ux/07-fortify-include-review.md`, `docs/ux/08-research-github-review-requests.md`, `docs/ux/09-orca-hedr-extension-research.md`. 프로젝트 규칙: `CLAUDE.md`.

## 실제 테스트 인프라 (조사 결과)

- 루트에 `package.json`/`vite.config.ts`/`tsconfig.json`이 있고 `frontend/`에는 `src/`만 있다. **모든 명령은 저장소 루트에서 실행.** `npm test` = `vitest run`, `npm run lint` = `tsc --noEmit`, `npm run build` = `vite build`.
- 기존 테스트 3개(모두 순수 TS): `frontend/src/services/integrationsApi.test.ts`, `architectureApi.test.ts`, `frontend/src/components/dashboard/architecture/utils.test.ts`. `vite.config.ts`에 `test` 설정이 없어 기본 node 환경이다. jsdom·testing-library는 **설치되어 있지 않다**(Task 1이 추가).
- 단일 파일 실행: `npx vitest run frontend/src/lib/storage.test.ts`. 테스트는 소스 옆 `*.test.ts(x)`에 둔다(기존 관례).
- Vite 프록시는 `/api` → `http://127.0.0.1:8000` 하나뿐이다. 라우터는 **HashRouter**(결정 27)라 실제 주소는 `/#/me`, `/#/tasks/<id>` 형태이고 경로가 `#` 뒤에 있어 `/api` 프록시와 겹치지 않는다(라우트 경로 자체도 `/api`로 시작하지 않는다).

## Global Constraints

- 제품 코드 수정은 `frontend/`, 루트 `index.html`, `vite.config.ts`, `package.json`만. **`backend/` 수정 금지.** API 계약·큐 백엔드는 별도 계획(`2026-11-24-api-contract.md`, `2026-11-24-backend-review-queue.md`)이 소유하며 이 계획은 건드리지 않는다.
- POST는 `frontend/src/services/apiClient.ts`의 `postJson()`만 쓴다(`fetch(..., {method:'POST'})` 직접 호출 금지). `hasUnreflectedReview`/`lastReviewAddedAt`은 읽기 전용(PATCH 금지). 새 리소스 mutation은 리소스별 엔드포인트를 쓰고 Task PATCH로 묶지 않는다(CLAUDE.md).
- 라우트(확정, 04 사이트맵): `/`→`/me` 리다이렉트, `/me` 내 리뷰 요청, `/areas`, `/areas/:areaId` 영역 흐름, `/tasks`, `/tasks/new`, `/tasks/:id` 전체 작업, `/settings` 설정. 첫 화면은 항상 `/me`(마지막 화면 복원 안 함). 위 경로는 라우터 내부 경로이고 브라우저 주소는 HashRouter 때문에 `/#` 접두(`/#/me`)다. 라우터 생성부는 `main.tsx`의 `<HashRouter>` 한 곳뿐이며 나중에 `BrowserRouter`로 바꿀 때 이 한 줄만 바뀌도록 `window.location.hash`·`#` 앵커 직접 사용을 금지한다.
- 내비 라벨 4개 그대로: **내 리뷰 요청 / 영역 흐름 / 전체 작업 / 설정**. 상태 라벨: **할 일 / 진행 중 / 리뷰 중 / 완료**. 용어: "감시 레포"→**연결된 레포**, "동기화"→**지금 가져오기**, "Accept"→**확인함**, RoleReview→**역할 검토**, "카테고리"→**분류**, "칸반"→**보드**, "작업 생성자"→**담당자**, "체크리스트 AI 생성"→**체크리스트 제안받기**. 영어 병기 `( … )`, 이모지, 가짜 버전 문구 금지(07 §5 #46).
- 문장형 UI 문구는 해요체이며 오류·빈 상태는 "무슨 일 / 영향 / 지금 할 일"을 담는다(07 §3.2).
- localStorage는 `frontend/src/lib/storage.ts`를 통해서만 접근한다. 접근 실패(throw)에도 앱이 예외 없이 동작해야 한다(결정 20, 07 §5 #12).
- 삭제·연결 해제는 확인 대화상자가 아니라 **10초 되돌리기**(결정 17). 칸반 드래그 도입 금지, 상태 변경은 `<select>`/버튼(결정 19). PR 항목(`isPrTask(t)`, 즉 API 계약 §6의 `kind==='pr'`)은 수동 상태 이동 컨트롤을 숨긴다(결정 12). `sourceUrl` 유무로 PR 여부를 판정하지 않는다.
- 동기화 상태 표시는 "내 리뷰 요청" 화면 제목 줄 **한 곳**에만(결정 24).
- 새로 쓰는 코드에서 `<div onClick>`/`<span onClick>` 금지, 아이콘 전용 버튼은 `aria-label` 필수, 호버에서만 보이는 컨트롤 금지, 상호작용 요소 최소 24×24px, `outline-none`은 대체 포커스 링과 함께만, `animate-pulse|ping|bounce` 금지, 좁은 폭(320px) 대응 레이아웃(고정 폭 `w-64` 같은 것은 `md:` 이상에서만).
- 새 의존성은 위 Tech Stack의 것만. 외부 CDN·웹폰트 추가 금지(결정 20).
- 이 계획에서 `dark:` 쌍 485곳의 일괄 토큰 치환, 색·타이포 최종 값, 칸반 4열 재설계는 하지 않는다(Impeccable 단계). 새로 만드는 컴포넌트만 토큰 유틸리티(`bg-surface` 등)를 쓴다.
- 커밋 메시지는 한국어 `type: 요약`(저장소 관례) + 시스템이 지정한 Co-Authored-By 줄.

## Review Focus

1. localStorage가 throw하거나(`SecurityError`/quota) 값이 깨져 있을 때(`darkMode`=`"{"`, 옛 `tasks` JSON) 앱이 예외 없이 기본값으로 뜨고, "저장되지 않아요" 안내가 나온다. (Task 2, 10)
2. 존재하지 않는 딥링크(`/#/tasks/없는id`, `/#/areas/한글%20이름`, `/#/zzz`)와 "열어 둔 작업이 폴링으로 사라진 경우"에서 빈 화면·예외 없이 안내 + 목록으로 이동하고 포커스가 `main`/`h1`로 간다. (Task 10, 13)
3. mutation이 네트워크 오류·non-2xx로 실패하면 화면이 원래 값으로 롤백되고 오류 알림이 한 번 나온다(`console.error` 단독 처리 금지). 연타로 같은 요청이 두 번 나가지 않는다. (Task 6)
4. 폴링 갱신이 도착해도 사용자가 입력 중인 폼·역할 검토·체크리스트 초안이 지워지지 않는다(현재 `TaskModal` 리셋 effect의 결함). (Task 13, 15)
5. 되돌리기 경계: 10초 안에 두 번째 삭제, 창이 열린 동안 폴링이 서버에 아직 있는 작업을 다시 가져옴, 페이지 이동/언마운트, 실패 시 복원. 삭제가 조용히 유실되거나 유령 항목이 되살아나지 않는다. (Task 8, 11)

---

### Task 1: 테스트 인프라 (jsdom + testing-library)

**Files:**
- Modify: `package.json`(devDependencies), `vite.config.ts`(`test` 블록)
- Create: `frontend/src/test/setup.ts`, `frontend/src/test/render.tsx`, `frontend/src/test/dialogStub.ts`, `frontend/src/test/infra.test.tsx`

**Interfaces:**
- Produces: `renderWithRouter(ui: ReactElement, opts?: { route?: string }): RenderResult & { user: UserEvent }` (**테스트 전용으로 `MemoryRouter`를 쓴다** — 앱 실제 라우터는 `main.tsx`의 `HashRouter`(결정 27)이고, 테스트는 URL 해시 전역 상태를 공유하지 않도록 `MemoryRouter`를 쓰는 것이 의도다. 라우트 정의(`routes.tsx`)는 둘에 공통이므로 컴포넌트는 라우터 종류에 의존하지 않는다) — 이후 모든 컴포넌트 테스트가 사용. `dialogStub.ts`: jsdom에 없는 `HTMLDialogElement.prototype.showModal/show/close`를 얇게 채운다(`open` 속성 토글, `showModal` 시 직전 `document.activeElement` 저장·`close` 시 복귀, `close()` 시 `close` 이벤트 발행, `returnValue`). 포커스 트랩·`Esc` 처리·백드롭은 브라우저 네이티브 동작이라 스텁이 흉내 내지 않는다. `setup.ts`가 import한다. `vitest` 설정: `environment: 'jsdom'`, `setupFiles: ['frontend/src/test/setup.ts']`, `include: ['frontend/src/**/*.test.{ts,tsx}']`.

- [ ] **Step 1: 실패 테스트** `infra.test.tsx`: `renderWithRouter(<h1>안녕</h1>)` 후 `expect(screen.getByRole('heading', {name:'안녕'})).toBeInTheDocument()`; 스텁 검증: `document.createElement('dialog')`에 `showModal()` → `open===true`, `close()` → `open===false`이고 `close` 이벤트 1회, 열기 전 포커스 요소로 복귀.
- [ ] **Step 2: 실행** `npx vitest run frontend/src/test/infra.test.tsx` → FAIL(`document is not defined` 또는 모듈 없음).
- [ ] **Step 3: 설치** `npm i -D jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom` 및 `npm i react-router@7`. `vite.config.ts`는 `defineConfig`를 `vitest/config`에서 import하고 `test` 블록 추가(기존 server/proxy/alias 그대로). `setup.ts`는 `@testing-library/jest-dom/vitest` import + `dialogStub` import + `afterEach(cleanup)`. `render.tsx`에 `renderWithRouter` 구현.
- [ ] **Step 4: 실행** `npm test` → 새 테스트 + **기존 테스트 3개 파일 모두 PASS**(jsdom 전환 회귀 확인; 실패 시 해당 파일 상단에 `// @vitest-environment node` 추가). `npm run lint` PASS.
- [ ] **Step 5: 커밋** `test: jsdom·testing-library 테스트 인프라 추가`

### Task 2: localStorage 래퍼와 "나" 로그인 저장

**Files:**
- Create: `frontend/src/lib/storage.ts`, `frontend/src/lib/storage.test.ts`
- Modify: `frontend/src/services/taskSync.ts`. (`components/dashboard/ArchitectureView.tsx`·`architecture/utils.ts`의 직접 `localStorage`/`REPO_URL_KEY`는 **수정하지 않는다** — 그 파일들은 screen-area-flow T7이 삭제한다.)

**Interfaces:**
- Produces (`lib/storage.ts`):
  - `STORAGE_KEYS = { theme: 'darkMode', myLogin: 'flowsync:myLogin', tasksEtag: 'tasks-etag', tasksLastModified: 'tasks-last-modified', archRepoUrl: 'architecture:lastRepoUrl' } as const`; `type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]`
  - `readStorage(key: StorageKey): string | null`, `writeStorage(key: StorageKey, value: string): boolean`(실패 시 모듈 내 `Map` 폴백에 저장하고 `false`), `removeStorage(key: StorageKey): void`, `isStorageAvailable(): boolean`
  - `normalizeLogin(raw: string): string`: 앞뒤 공백·선행 `@`·`https://github.com/` 접두·후행 `/` 제거, 소문자화, GitHub 로그인 규칙(`/^[a-z\d](?:[a-z\d-]{0,38})$/`)에 안 맞으면 `''`
  - `getMyLogin(): string | null`, `setMyLogin(raw: string): string | null`(정규화 후 저장, 무효면 `null`), `purgeLegacyKeys(): void`(`tasks`, `activities` 삭제)

- [ ] **Step 1: 실패 테스트** `storage.test.ts`: (a) `vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('x','SecurityError')})` 이어도 `readStorage(...)`가 `null`, `writeStorage`가 예외 없이 `false`지만 같은 세션에서 `readStorage`가 방금 쓴 값을 돌려줌; (b) `normalizeLogin('@Octocat ') === 'octocat'`, `normalizeLogin('github.com/OCTOCAT')`·`'https://github.com/OCTOCAT/'` === `'octocat'`, `normalizeLogin('a b')`·`'-x'`·`''` === `''`; (c) `setMyLogin('  ')` → `null`이고 저장 안 됨; (d) `purgeLegacyKeys()`가 `tasks`/`activities`만 지움; (e) 깨진 값은 그대로 문자열로 반환(파싱은 호출자 책임).
- [ ] **Step 2:** `npx vitest run frontend/src/lib/storage.test.ts` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 모든 접근을 try/catch로 감싼다. `taskSync.ts`는 키·접근을 래퍼로 교체하고 **`localStorage.setItem('tasks', …)`(오프라인 폴백용 캐시 저장)를 삭제**한다(`fetchTasksFromServer` 반환 계약은 유지). `STORAGE_KEYS.archRepoUrl`은 정의만 두고(screen-area-flow T7이 사용처를 삭제한 뒤에도 `storage.test.ts` 호환용으로 유지) `ArchitectureView`/`utils.ts`는 건드리지 않는다.
- [ ] **Step 4:** `npm test` PASS, `npm run lint` PASS
- [ ] **Step 5: 커밋** `refactor: localStorage 접근을 래퍼로 통일하고 나의 GitHub 로그인 저장 추가`

### Task 3: 디자인 토큰 골격 · 다크 variant · 무효 클래스 정리

**Files:**
- Modify: `frontend/src/index.css`, `index.html`(`lang="ko"`, 제목 "FlowSyncAI", `<meta name="color-scheme" content="light dark">`, FOUC 방지 인라인 스크립트), `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/dashboard/TaskBoard.tsx`, `frontend/src/components/common/TaskModal.tsx`(무효 클래스 18곳 삭제만)
- Create: `frontend/src/hooks/useTheme.ts`, `frontend/src/hooks/useTheme.test.tsx`, `frontend/src/styles/tokens.test.ts`

**Interfaces:**
- Produces: `type ThemeMode = 'system' | 'light' | 'dark'`, `useTheme(): { mode: ThemeMode; dark: boolean; setMode(m: ThemeMode): void; setDark(v: boolean): void }`(결정 40). 저장값(`STORAGE_KEYS.theme`, 키 이름 `darkMode` 유지): `'system'`·없음 → 모드 `system`(`matchMedia('(prefers-color-scheme: dark)')`를 따르고 OS 설정 변경 `change` 이벤트에도 즉시 반영), 구버전 값 `'true'` → `dark`, `'false'` → `light`(새로 저장할 때도 이 두 값과 `'system'`만 쓴다). `dark`는 모드를 해석한 결과이며 `html.dark` 클래스 토글과 저장은 `setMode`가 한다. `setDark(v)`는 `setMode(v ? 'dark' : 'light')`의 별칭(기존 소비자 호환). 단일 진실은 `html.dark` 클래스(루트 div의 중복 `dark` 클래스는 Task 10에서 제거).
- Produces (CSS 토큰 이름, 값은 `/* TEMP: Impeccable */` 임시값): 런타임 변수 `--surface, --surface-raised, --surface-sunken, --text, --text-muted, --border, --border-strong, --accent, --accent-contrast, --focus-ring, --danger, --success, --warning, --status-todo, --status-inprogress, --status-review, --status-done, --priority-low, --priority-medium, --priority-high, --priority-urgent`를 `:root`와 `.dark` 양쪽에 정의하고, `@theme inline`으로 `--color-<이름>: var(--<이름>)` 매핑(→ `bg-surface`, `text-muted`, `border-border` 등 사용 가능). 타입 스케일 6단계 `--text-caption(12px) --text-body-sm(14px) --text-body(16px) --text-title(20px) --text-heading(24px) --text-display(30px)`, 모서리 `--radius-sm(4px) --radius-md(8px)`, 간격 기준 4px, 그림자는 `--shadow-overlay` 1종. `@custom-variant dark (&:where(.dark, .dark *));`.

- [ ] **Step 1: 실패 테스트** `tokens.test.ts`: `index.css`를 `fs.readFileSync`로 읽어 (a) `@custom-variant dark` 줄 존재, (b) 위 변수명 21개가 `:root` 블록과 `.dark` 블록에 각각 존재, (c) `@media (prefers-reduced-motion: reduce)` 블록 존재를 단언. `useTheme.test.tsx`: 저장값 `'true'`면 `dark` true·`html.dark` 부착·`mode==='dark'`, `setDark(false)` 시 클래스 제거·저장, 저장소 throw여도 예외 없음, 저장값 없고 `matchMedia`가 dark면 `mode==='system'`·`dark` true, `system` 모드에서 `matchMedia`의 `change` 이벤트(light→dark)가 `html.dark`를 즉시 바꿈, `setMode('light')` 뒤에는 OS 변경이 무시됨, `setMode('system')`은 `'system'`을 저장.
- [ ] **Step 2:** `npx vitest run frontend/src/styles frontend/src/hooks/useTheme.test.tsx` → FAIL
- [ ] **Step 3: 구현** CSS·훅. `index.css` 끝에 reduced-motion 전역 규칙(`animation-duration/iteration/transition` 최소화). 무효 클래스는 03 §2.2 표대로 **삭제**(`slate-850`×4, `slate-150`×3, `slate-355`, `slate-250`, `slate-750`, `blue-450`×6, `emerald-455`; 의미 보존이 필요한 곳은 가장 가까운 유효 단계로 치환하지 말고 해당 variant 자체를 삭제). `index.html` 인라인 스크립트는 `darkMode` 저장값(`'true'`/`'false'`/`'system'`/없음)과 미디어쿼리로 첫 페인트 전에 `html.dark`를 붙이며 try/catch로 감싼다(`useTheme`과 같은 해석 규칙).
- [ ] **Step 4: 검증** `npm test`, `npm run lint`, 그리고 `npm run build && grep -l '\.dark' dist/assets/*.css`(파일 출력되면 `dark:` variant가 `.dark`에 반응) + `grep -rnE 'slate-(850|150|355|250|750)|blue-450|emerald-455' frontend/src` 결과 0건.
- [ ] **Step 5: 커밋** `feat: 디자인 토큰 골격과 .dark variant 추가, 무효 Tailwind 클래스 제거`

### Task 4: 공용 순수 로직 추출 (`lib/`)

**Files:**
- Create: `frontend/src/lib/avatar.ts`, `lib/taskLabels.ts`, `lib/taskFilters.ts`, `lib/date.ts` 및 각 `*.test.ts`
- Modify: `components/dashboard/TaskBoard.tsx`, `TaskList.tsx`, `components/common/TaskModal.tsx`(중복 헬퍼를 import로 교체), `frontend/src/types/index.ts`(`Task`에 `kind?: 'pr' | 'manual'`, `author?: string | null` 추가 — API 계약 §6, 다른 화면 계획이 소비)

**Interfaces:**
- Produces:
  - `avatar.ts`: `getInitials(name: string): string`, `getAvatarColor(name: string): string`(03 §6.1: 3벌 동일 복사본을 그대로 이관, 동작 변경 없음)
  - `taskLabels.ts`: `STATUS_ORDER: TaskStatus[]`(`['todo','inprogress','review','done']`), `STATUS_LABEL: Record<TaskStatus,string>`(할 일/진행 중/리뷰 중/완료), `PRIORITY_LABEL: Record<TaskPriority,string>`(낮음/보통/높음/긴급, 이모지 없음), `adjacentStatus(s: TaskStatus, dir: -1|1): TaskStatus | null`, `isPrTask(t: Pick<Task,'id' | 'kind'>): boolean`(`kind`가 있으면 `kind==='pr'`, 없으면 `id.startsWith('pr-')` — API 계약 §6의 `kind` 기준. **`sourceUrl`로 판정하지 않는다**: 수동 작업도 PR URL을 가질 수 있다. screen-all-tasks가 이 시그니처를 그대로 소비한다)
  - `taskFilters.ts`: `searchTasks(tasks: Task[], q: string): Task[]`(제목·설명·분류, 대소문자 무시, 공백 질의는 전체), `countByStatus(tasks: Task[]): Record<TaskStatus,number> & { all: number }`, `filterTasks(tasks, f: { status?: TaskStatus; assignee?: string }): Task[]`, `sortByCreatedAt(tasks, dir: 'asc'|'desc')`
  - `date.ts`: `formatDate(iso: string): string`(`TaskModal.formatCreatedAt`/인라인 `toLocaleDateString` 통합), `minutesAgo(iso: string, now?: Date): number`

- [ ] **Step 1: 실패 테스트** 각 파일: `adjacentStatus('todo',-1)===null`, `adjacentStatus('review',1)==='done'`; `isPrTask({id:'pr-a-b-1'})` true, `isPrTask({id:'t1'})` false, `isPrTask({id:'t1',kind:'pr'})` true, `isPrTask({id:'pr-a-b-1',kind:'manual'})` false(`kind` 우선), PR URL을 `sourceUrl`로 가진 `id:'t1'` 작업은 false; `searchTasks`가 분류로도 매칭·`'  '`는 전체; `countByStatus`가 빈 배열에서 전부 0; `getInitials('')`가 예외 없이 문자열; `minutesAgo`가 미래 시각에서 0 이상(07 F11 음수 보정).
- [ ] **Step 2:** `npx vitest run frontend/src/lib` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. TaskBoard의 죽은 함수 `getPriorityStyle`/`getCategoryStyle`(03 §1.1)은 이 단계에서 삭제. 세 컴포넌트는 로컬 복사본을 지우고 import.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `refactor: 아바타·라벨·필터·날짜 중복 로직을 lib로 통합`

### Task 5: 폐기 대상 제거 (분석 탭, 활동 피드, 오프라인 폴백)

**Files:**
- Delete: `components/dashboard/AnalyticsView.tsx`, `components/dashboard/ActivityFeed.tsx`, `constants/initialData.ts`(디렉터리가 비면 함께 삭제)
- Modify: `frontend/src/App.tsx`, `components/layout/Sidebar.tsx`(분석 탭), `frontend/src/types/index.ts`(`Activity` 타입 삭제)

**Interfaces:** Consumes: Task 2의 `purgeLegacyKeys`. Produces: 없음(삭제 작업). 04 매핑표 기준: 분석 폐기, 활동 피드 폐기, 워크플로 도식·완료 오버레이는 TaskModal 삭제(Task 16)에서 함께 사라진다.

- [ ] **Step 1: 실패 테스트(가드)** `frontend/src/lib/removed.test.ts`: 소스 트리(테스트 파일 제외)를 읽어 `AnalyticsView`, `ActivityFeed`, `INITIAL_ACTIVITIES`, `logActivity`, `saveActivitiesToLocal`, `saveTasksToLocal`, `'task-'+Date.now()`류 오프라인 임시 id 패턴, `localStorage.getItem('tasks')`가 0건임을 단언.
- [ ] **Step 2:** `npx vitest run frontend/src/lib/removed.test.ts` → FAIL
- [ ] **Step 3: 구현** App.tsx에서: `activities`/`isActivityStreamOpen` state·effect, `logActivity`(호출 4곳 포함), `saveActivitiesToLocal`, 미사용 import(`Bell, Sparkles, CheckSquare, History`), 폴링 오류 시 `localStorage('tasks')` 복원, `saveTasksToLocal`(→`setTasks`로 대체), `handleSaveTask`의 오프라인 임시 task 생성 catch(실패는 `console.error`가 아니라 일단 던져 호출자가 처리하도록 두고 Task 6에서 `MutationResult`로 대체)를 제거하고 앱 시작 시 `purgeLegacyKeys()` 1회 호출. recharts는 `architecture/WeeklyChart`가 계속 쓰므로 이 계획에서는 의존성을 유지한다(제거는 확정 결정 37에 따라 screen-area-flow T7 단독 책임).
- [ ] **Step 4:** `npm run lint`, `npm test`, `npm run build` PASS
- [ ] **Step 5: 커밋** `refactor: 분석 탭·활동 피드·localStorage 오프라인 폴백 제거`

### Task 6: `useTasks` — 데이터·mutation·롤백

**Files:**
- Create: `frontend/src/hooks/useTasks.ts`, `frontend/src/hooks/TasksContext.tsx`, `frontend/src/hooks/useTasks.test.tsx`

**Interfaces:**
- Consumes: `services/taskSync.ts`(`fetchTasksFromServer`, `invalidateTasksCacheHeaders`, `TASKS_POLL_INTERVAL_MS`), `postJson`, `lib/taskFilters`.
- Produces:
  - `type MutationResult<T = void> = { ok: true; value: T } | { ok: false; error: string }`
  - `useTasks(deps?: { notify?: (msg: string, kind: 'error' | 'info') => void }): TasksApi` where `TasksApi = { tasks: Task[]; loadState: 'loading'|'ready'|'error'; refresh(): Promise<void>; moveTask(id: string, s: TaskStatus): Promise<MutationResult>; createTask(d: TaskDraft): Promise<MutationResult<Task>>; updateTask(id: string, patch: Partial<TaskDraft>): Promise<MutationResult<Task>>; deleteTask(id: string): Promise<MutationResult>; addSubtask(taskId, title): Promise<MutationResult<SubTask>>; toggleSubtask(taskId, subtaskId, completed): Promise<MutationResult>; removeSubtask(taskId, subtaskId): Promise<MutationResult>; replaceSubtasks(taskId, items: SubTask[]): Promise<MutationResult<SubTask[]>>; addReview(taskId, r: Omit<RoleReview,'id'|'createdAt'>): Promise<MutationResult<RoleReview>>; updateReview(taskId, reviewId, patch: Partial<RoleReview>): Promise<MutationResult>; deleteReview(taskId, reviewId): Promise<MutationResult> }`; `TaskDraft = Omit<Task,'id'|'createdAt'|'subtasks'|'roleReviews'|'hasUnreflectedReview'|'lastReviewAddedAt'>`
  - `TasksProvider({children})`, `useTasksContext(): TasksApi`
  - 동작 계약: 현재 `App.tsx`의 `handle*` 11개와 `applyTasksFromServer`/폴링/`updateTaskInState`를 **엔드포인트·요청 본문·응답 병합 규칙 그대로** 이관한다(URL 표는 CLAUDE.md). 새 계약은 (1) 모든 mutation이 throw하지 않고 `MutationResult` 반환, (2) 낙관적 갱신 후 실패 시 이전 값으로 롤백 + `notify(오류문구,'error')` 1회, (3) 같은 `(종류,id)` mutation이 진행 중이면 두 번째 호출은 요청을 보내지 않고 `{ok:false}`, (4) `addReview` 응답의 `taskStatus`와 `roleReviews`를 함께 반영(후속 PATCH 없음), (5) `replaceSubtasks`는 호출자가 준 안정 id로 PUT.

- [ ] **Step 1: 실패 테스트** `fetch`를 `vi.stubGlobal`로 모킹: (a) `moveTask` 500 응답 → `tasks`가 원래 상태로 복귀·`notify` 1회·`{ok:false}`; (b) `moveTask` 네트워크 reject도 동일; (c) 같은 id로 `moveTask` 동시 2회 → fetch 1회; (d) `addReview` 첫 리뷰 응답 `taskStatus:'inprogress'` → `status` 반영, 추가 PATCH fetch 없음; (e) 폴링 `not-modified`/`error`에서 `tasks`가 비워지지 않음(로컬 폴백 없음); (f) `deleteTask` 성공 시 목록에서 제거, 실패 시 유지.
- [ ] **Step 2:** `npx vitest run frontend/src/hooks/useTasks.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 이 단계에서는 `App.tsx`를 아직 바꾸지 않는다(Task 10에서 교체) — 새 파일만 추가하므로 Task 5와 병렬 가능.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: useTasks 훅(롤백·중복 요청 방지 포함) 추가`

### Task 7: `usePrSync` + `SyncStatusLine` (동기화 상태 공용 컴포넌트)

**Files:**
- Create: `frontend/src/hooks/usePrSync.ts`, `hooks/PrSyncContext.tsx`, `frontend/src/components/common/SyncStatusLine.tsx`, `frontend/src/services/syncStatus.ts`(`toSyncStatus` 어댑터 + `mockSyncStatus`), `frontend/src/types/repoSync.ts`, `frontend/src/lib/repoCopy.ts`(+`repoCopy.test.ts`), 각 `*.test.ts(x)`
- Modify: `frontend/src/services/integrationsApi.ts`(`syncPullRequests(repoId?: number)` 선택 인자만 추가, 본문 `{ repoId }`는 인자가 있을 때만)

**Interfaces:**
- Consumes: `services/integrationsApi.ts`(`listWatchedRepos`, `syncPullRequests`, `formatSyncResult` — 기존 시그니처 유지, `syncPullRequests`만 선택 인자 `repoId?` 추가).
- Produces: (`SyncStatusInfo`·`toSyncStatus`·`mockSyncStatus`는 모두 `frontend/src/services/syncStatus.ts`에서 export — screen-review-queue가 이 경로로 import한다)
  - **공용 레포 상태 타입·문구의 단일 소유자(2차 조정):** `types/repoSync.ts`: `type RepoErrorKind = 'auth'|'rate_limit'|'not_found'|'upstream'|'unknown'`, `interface RepoError { kind: RepoErrorKind; message: string; resetAt?: string | null }`, `interface RepoSyncState { repoId: number|string; repo: string; lastAttemptAt: string|null; lastSuccessAt: string|null; lastError: RepoError|null; truncated: boolean }`. screen-review-queue·screen-settings는 이 타입을 import만 하고 `QueueRepoStatus`/`QueueRepoError`/`RepoSyncState`를 다시 정의하지 않는다.
  - `lib/repoCopy.ts`(순수 함수, `now: Date` 주입): `formatClock(iso: string): string`(로컬 24시간 `HH:mm`, 파싱 불가는 `''`), `formatFetched(iso: string | null, now?: Date): string`(`null`→"아직 가져온 적 없어요", 1분 미만·미래 "방금 가져옴", 이후 "N분|N시간|N일 전 가져옴"), `interface RepoErrorView { title: string; body: string; canRetry: boolean; retryDisabledReason?: string; adminCopy?: string; canDisconnect: boolean }`, `describeRepoError(repo: string, err: RepoError, lastSuccessAt: string | null, now?: Date): RepoErrorView`. 문구는 07 §3.2: `auth` 제목 "서버의 GitHub 토큰이 거부됐어요"·본문 "이 문제는 앱에서 해결할 수 없어요. 아래 내용을 서버 관리자에게 전달해 주세요."·`canRetry:false`·`adminCopy`(레포명과 `GITHUB_TOKEN` 포함); `rate_limit` 제목 "GitHub 호출 한도에 도달했어요"·본문 "{HH:mm} 이후 다시 가져올 수 있어요. 그때까지 목록은 {HH:mm} 기준이에요."(성공 이력이 없으면 뒷문장 "아직 가져온 적이 없어요.")·`canRetry:true`·`resetAt`이 미래면 `retryDisabledReason` "{HH:mm}부터 가능"; `not_found` 제목 "{repo} 레포를 읽을 수 없어요"·본문 "레포가 없어졌거나 서버 토큰에 읽기 권한이 없을 수 있어요."·`canRetry:true`·`adminCopy`·`canDisconnect:true`; `upstream` 제목 "GitHub가 응답하지 않았어요"·본문 "잠시 뒤에 다시 시도해 주세요. 목록은 {HH:mm} 기준이에요."·`canRetry:true`; `unknown` 제목 "{repo}를 가져오지 못했어요"·본문은 upstream과 같은 형식·`canRetry:true`·`canDisconnect:true`. 소비 규칙: 재시도 버튼은 `canRetry`일 때만 렌더하고 `retryDisabledReason`이 있으면 `aria-disabled`+사유 텍스트로 비활성.
  - `interface SyncStatusInfo { lastSuccessAt: string | null; syncing: boolean; error: { kind: RepoErrorKind; resetAt?: string | null } | null; truncated: boolean }`
  - `toSyncStatus(raw: unknown, prev: SyncStatusInfo): SyncStatusInfo` — **서버 필드 매핑은 api-contract 계획이 확정하므로 이 함수 한 곳에 격리**. 지금은 기존 `SyncResult`(`created/skipped/errors`)만 이해하고 성공 시 `lastSuccessAt=now`, 예외 시 `error.kind='unknown'`.
  - `mockSyncStatus(over?: Partial<SyncStatusInfo>): SyncStatusInfo`
  - `usePrSync(deps: { onCreated: () => Promise<void> }): { status: SyncStatusInfo; syncNow(repoId?: number): Promise<void>; lastResultText: string }` — 현 `runPrSync`(App.tsx:94-129) 이관: 마운트+`TASKS_POLL_INTERVAL_MS`마다 실행, 중복 실행 방지, 연결된 레포 0개면 건너뜀, `created>0`이면 `invalidateTasksCacheHeaders()` 후 `onCreated()`. **`syncNow(repoId)`는 그 레포만 `syncPullRequests(repoId)`로 다시 가져온다(레포별 재시도; 서버 30초 쓰로틀 적용, 이미 진행 중이면 진행 중인 것을 기다림).** 인자 없는 호출은 전체. 레포별 재시도 경로는 이것 하나뿐이며 queue·settings가 별도 sync API 함수를 만들지 않는다. `PrSyncProvider`/`usePrSyncContext()`.
  - `<SyncStatusLine status={SyncStatusInfo} onRefresh={() => void} now?: Date />` — 텍스트 "N분 전 가져옴"(마지막 **성공** 시각 기준; 성공이 없으면 "아직 가져온 적 없어요"), 6분 초과 시 "오래됨", 버튼 "지금 가져오기"(syncing 중·rate_limit이면 `aria-disabled` + "N분 뒤에 다시 가져올 수 있어요"), `truncated`면 "일부만 가져왔어요", 오류는 `role="alert"`로 **같은 오류 1회만**, 일반 갱신은 `role="status"` 변화 시에만.

- [ ] **Step 1: 실패 테스트** `SyncStatusLine.test.tsx`: (a) 3분 전 성공 → "3분 전 가져옴"; (b) 실패 직후에도 시각 문구가 마지막 성공 시각 그대로; (c) 7분 전 → "오래됨" 텍스트; (d) `rate_limit`+`resetAt` → 버튼 `aria-disabled="true"`, 클릭해도 `onRefresh` 미호출, 풀리는 시각 텍스트 존재; (e) 같은 `error`로 리렌더 3회 → `role="alert"` 요소 1개·내용 불변; (f) `truncated` 문구. `usePrSync.test.tsx`: 레포 0개면 `syncPullRequests` 미호출, 동시 2회 호출 시 1회, `created>0`이면 `onCreated` 호출, `syncNow(2)`가 `syncPullRequests(2)`(본문 `{repoId:2}`)를 호출하고 `syncNow()`는 인자 없이 호출. `repoCopy.test.ts`: `formatFetched(null)`·30초 전·3분 전·미래·90분 전, `auth`의 `canRetry===false`·`adminCopy`에 레포명과 `GITHUB_TOKEN`, `rate_limit` 미래 `resetAt`→`retryDisabledReason`이 `/^\d{2}:\d{2}부터 가능$/`·과거면 `undefined`, `not_found` 제목, 5종 모두 `title`/`body` 비어 있지 않고 "동기화"·"감시"·"문제가 발생" 없음, `formatClock('x')===''`.
- [ ] **Step 2:** `npx vitest run frontend/src/components/common/SyncStatusLine.test.tsx frontend/src/hooks/usePrSync.test.tsx` → FAIL
- [ ] **Step 3: 구현** 시그니처 그대로. 시각 표시는 토큰 유틸리티만(임시 스타일).
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 동기화 상태 줄 컴포넌트와 usePrSync 훅 추가`

### Task 8: 알림 호스트와 10초 되돌리기

**Files:**
- Create: `frontend/src/hooks/useToasts.tsx`, `frontend/src/hooks/useUndo.ts`, `frontend/src/components/common/ToastHost.tsx`, 각 `*.test.tsx`

**Interfaces:**
- Produces:
  - `ToastProvider({children})`, `useToasts(): { notify(message: string, kind?: 'info'|'error'): void }` — `ToastHost`는 `role="status"`(info)·`role="alert"`(error) 영역을 렌더, 포커스를 가져가지 않음, error는 닫기 전까지 유지(닫기 버튼 `aria-label="알림 닫기"`).
  - `const UNDO_WINDOW_MS = 10_000`
  - `useUndo(): { schedule(a: { label: string; hide(): void; restore(): void; commit(): Promise<{ ok: boolean; error?: string }>; windowMs?: number }): void; isPending(key?: string): boolean }` — `schedule` 즉시 `hide()`(낙관적 숨김), 토스트에 `label`(예: "‘제목’ 작업을 삭제했어요")과 **되돌리기** 버튼 + 남은 시간 텍스트(초 단위 갱신은 `aria-live` 아님). 창이 끝나면 `commit()`; 되돌리기 누르면 `restore()`하고 commit 안 함; commit 실패 시 `restore()` + 오류 알림; **언마운트/`pagehide` 시 대기 중 항목을 즉시 commit(flush)**; 여러 항목은 독립 타이머.
- Apply: Task 11(작업 삭제), Task 12(연결 해제).

- [ ] **Step 1: 실패 테스트**(`vi.useFakeTimers`): (a) schedule 직후 `hide` 호출·`commit` 미호출; (b) 9.9초 후 commit 미호출, 10초 후 1회; (c) 되돌리기 클릭 → `restore` 호출·commit 영구 미호출; (d) commit이 `{ok:false}` → `restore` + `role="alert"` 문구; (e) 2건 연속 schedule → 각각 독립 commit; (f) 언마운트 시 대기 항목 commit 즉시 1회; (g) 토스트의 "되돌리기"가 키보드(Enter)로 동작하고 이름이 "되돌리기"인 버튼.
- [ ] **Step 2:** `npx vitest run frontend/src/hooks/useUndo.test.tsx frontend/src/hooks/useToasts.test.tsx` → FAIL
- [ ] **Step 3: 구현** 시그니처 그대로. `useTasks`의 `notify` 의존성(Task 6)은 Task 10에서 `useToasts().notify`를 주입.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 알림 호스트와 10초 되돌리기 훅 추가`

### Task 9: 접근 가능한 `Dialog` 프리미티브 (네이티브 `<dialog>`)

**Files:**
- Create: `frontend/src/components/common/Dialog.tsx`, `components/common/Dialog.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `test/dialogStub.ts`(jsdom 스텁).
- Produces: `<Dialog open: boolean onClose: () => void title: string role?: 'dialog'|'alertdialog' initialFocusRef?: RefObject<HTMLElement> size?: 'md'|'lg' children />` — **네이티브 `<dialog>` + `showModal()`**(결정 28). `open`이 true가 되면 effect에서 `showModal()`, false가 되면 `close()`. 구조: `<dialog aria-labelledby={제목 id} role={role}>` 안에 내부 `h2` 제목(`tabIndex=-1`)과 닫기 버튼(`aria-label="닫기"`, 44px 영역)과 `children`. `createPortal`·`#root`의 `inert`·수동 포커스 트랩(`useFocusTrap`)은 **쓰지 않는다**(top layer가 배경을 비활성화하고 Tab을 대화상자 안에 가둔다). 초기 포커스는 `showModal()` 직후 `initialFocusRef` → 없으면 제목 `h2`에 명시적으로 준다. 닫으면 브라우저가 열기 직전 요소로 포커스를 복귀시킨다. `Esc`는 `cancel` 이벤트를 `preventDefault`하고 `onClose()`를 호출(상위 상태가 `open`을 내리면 effect가 `close()`), 백드롭 클릭(= `<dialog>` 자신이 클릭 대상)은 `dialog`에서만 `onClose()`, `alertdialog`는 무시. 대화상자 요소의 기본 스타일(`::backdrop`, `max-w`)은 토큰 유틸리티, `backdrop-blur`·`animate-*` 없음.
- 결정(확정 28): 수동 구현 대신 네이티브를 쓰고 jsdom에는 Task 1의 얇은 스텁을 쓴다. 스텁이 흉내 내지 못하는 부분(실제 Tab 순환 가둠, `Esc` 키 → `cancel`, `::backdrop` 클릭)은 단위 테스트에서 이벤트를 직접 발행해 핸들러만 검증하고, 실제 동작은 Task 16 수동 검증에서 본다.

- [ ] **Step 1: 실패 테스트**: (a) `open`일 때 `getByRole('dialog',{name:'작업 상세'})` 존재, `dialog.open===true`(`showModal` 호출됨), `open=false`로 바뀌면 `dialog.open===false`; (b) 열면 제목 `h2`가 `document.activeElement`, `initialFocusRef`가 있으면 그 요소; (c) `cancel` 이벤트 발행(입력 필드 안에서 발생시켜도) → `onClose` 1회·기본 닫힘이 취소됨(`defaultPrevented`); (d) 닫은 뒤 열기 전 포커스 요소(트리거 버튼)로 포커스 복귀(스텁 동작); (e) `alertdialog`에서 `dialog` 요소 자체에 대한 클릭은 `onClose` 미호출, `dialog`는 호출, 내부 자식 클릭은 둘 다 미호출; (f) 닫기 버튼 `aria-label="닫기"`·클릭 시 `onClose`; (g) 소스 가드: `Dialog.tsx`에 `createPortal`·`inert`·`aria-modal`·`useFocusTrap`이 없음(네이티브가 제공).
- [ ] **Step 2:** `npx vitest run frontend/src/components/common/Dialog.test.tsx` → FAIL
- [ ] **Step 3: 구현** 시그니처 그대로. 언마운트 시 열려 있으면 `close()`.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 네이티브 dialog 기반 Dialog 컴포넌트 추가`

### Task 10: 라우터 · AppShell · `App.tsx` 분해

**Files:**
- Create: `frontend/src/routes.tsx`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/hooks/useRouteAnnouncer.ts`, `frontend/src/hooks/useReviewBadge.ts`, `frontend/src/screens/NotFoundScreen.tsx`, 스텁 `screens/{MyReviewsScreen,AreasScreen,AreaDetailScreen,TasksScreen,SettingsScreen}.tsx`(각 `h1`+자리표시, Task 11·12가 채움), `AppShell.test.tsx`, `routes.test.tsx`
- Modify: `frontend/src/App.tsx`(→ 80줄 이하), `frontend/src/main.tsx`(`<HashRouter>`로 감쌈 — 결정 27, 라우터 생성부는 여기 한 곳), `components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: Task 2~9 산출물(`useTheme`, `TasksProvider`, `PrSyncProvider`, `ToastProvider`, `isStorageAvailable`).
- Produces:
  - `ROUTES = { me: '/me', areas: '/areas', area: (id: string) => `/areas/${encodeURIComponent(id)}`, tasks: '/tasks', task: (id: string) => `/tasks/${encodeURIComponent(id)}`, newTask: '/tasks/new', settings: '/settings' } as const`, `SCREEN_TITLES`(경로→"내 리뷰 요청" 등)
  - `App()`는 라우터를 **포함하지 않는다**(`main.tsx`가 `HashRouter`로, 테스트가 `MemoryRouter`로 감쌈): `ToastProvider > TasksProvider > PrSyncProvider > AppShell(Routes)`.
  - `AppShell`: 첫 `Tab` 대상 "본문으로 건너뛰기" 링크(HashRouter에서는 `href="#main"`이 라우트를 바꾸므로 `href`는 현재 경로 유지용으로 두고 `onClick`에서 `preventDefault()` 후 `#main`에 `focus()`), `<nav aria-label="주 메뉴">`(NavLink 4개, 설정은 하단 고정, `aria-current`), `<main id="main" tabIndex={-1}>`, 화면마다 `h1` 1개, 저장소 사용 불가 시 `role="status"` 배너 "이 브라우저에서는 설정을 저장하지 못해요. 새로고침하면 처음 상태로 돌아가요."
  - `Sidebar({ reviewBadge?: number })`: 4개 항목만(분석 제거), `v1.0.0 Stable`·"메인 메뉴" 라벨 삭제, 배지는 `reviewBadge`가 1 이상일 때만 "내 리뷰 요청"에 숫자와 `aria-label="리뷰 대기 N건"`로(0·`undefined`면 숨김, 결정 39). `AppShell`은 `useReviewBadge(): number | undefined`(신규 `hooks/useReviewBadge.ts`, **이 계획에서는 항상 `undefined`를 돌려주는 자리표시** — screen-review-queue T3가 큐 Provider 값으로 교체)를 `reviewBadge`에 연결한다. 고정 `w-64`는 `md:` 이상에서만(좁은 폭에서는 상단 가로 내비로 접힘).
  - `useRouteAnnouncer(titleFor: (pathname: string) => string)`: 라우트 변경 시 `document.title = '<화면명> · FlowSyncAI'`, `main`(또는 그 안의 `h1`)으로 포커스 이동(첫 마운트 제외).

- [ ] **Step 1: 실패 테스트** (`renderWithRouter`=`MemoryRouter`, 실제 라우터는 HashRouter이나 라우트 정의가 같다): (a) `/`→`/me`로 치환되고 `h1` "내 리뷰 요청"; (b) `/tasks/없는id`·`/zzz`·`/areas/한글%20이름`에서 예외 없이 `h1` 존재(알 수 없는 경로는 "페이지를 찾을 수 없어요" + 내 리뷰 요청 링크); (c) 라우트 이동 후 `document.title` 변경, `document.activeElement`가 `main`/`h1`; (d) 첫 `Tab`이 스킵 링크, Enter 후 `main` 포커스; (e) `nav` `aria-label="주 메뉴"`·현재 항목 `aria-current="page"`; (f) 화면당 `h1` 1개·`main` 1개; (g) `readStorage`가 던지는 환경에서 렌더 성공 + 안내 배너; (h) 사이드바에 "분석"·"v1.0.0" 텍스트 없음.
- [ ] **Step 2:** `npx vitest run frontend/src/components/layout frontend/src/routes.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 헤더 바(검색·감시 레포·테마·새 작업 버튼)는 제거 — 검색·새 작업은 Task 11, 테마·연결된 레포는 Task 12로 이동. 루트 div의 중복 `dark` 클래스·뷰별 부제 문구 삭제. `AreasScreen`·`AreaDetailScreen`은 **`h1` "영역 흐름" + "영역 흐름 화면을 준비하고 있어요" 자리표시만** 둔다. 구 `ArchitectureView`는 연결하지 않는다(직접 `localStorage` 접근이 래퍼 규칙 밖이므로 `/areas`가 구 화면을 노출하는 구간 자체를 없앤다. **`ArchitectureView`·`architecture/*` 파일은 수정하지 않는다** — screen-area-flow T5가 `AreasScreen`을 교체하고 T7이 그 파일들을 삭제한다). 이 자리표시 상태로는 릴리스하지 않는다(실행 개요의 릴리스 게이트). 임시로 기존 `TaskModal`은 `/tasks`의 `isOpen` 호출을 쓰지 않고 Task 13까지 **라우트에서 연결하지 않는다**(목록 행 클릭은 `ROUTES.task(id)`로 이동만).
- [ ] **Step 4: 검증** `npm test`, `npm run lint`, `npm run build`. 이후 `npm run dev`를 띄우고 `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/` → `200`(HashRouter라 딥링크는 `/#/tasks/abc`이고 서버는 항상 `/`만 받으므로 SPA 폴백 설정이 필요 없다), `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/v1/tasks/` → 200이 아니라 프록시 응답(백엔드 꺼짐이면 5xx; HTML `200`이면 프록시 깨짐). 브라우저에서 `http://127.0.0.1:3000/#/tasks/abc`를 직접 열어 새로고침해도 같은 화면이 유지되는지 확인.
- [ ] **Step 5: 커밋** `feat: react-router(HashRouter) 도입, AppShell·내비 4항목, App.tsx 분해`

### Task 11: 전체 작업 화면 (`/tasks`)

**Files:**
- Create: `frontend/src/screens/TasksScreen.test.tsx`
- Modify: `frontend/src/screens/TasksScreen.tsx`, `components/dashboard/TaskBoard.tsx`, `components/dashboard/TaskList.tsx`

**Interfaces:**
- Consumes: `useTasksContext`, `useUndo`, `lib/taskFilters`, `lib/taskLabels`(`isPrTask`, `adjacentStatus`), `ROUTES`.
- Produces: `TasksScreen`: 검색 입력(`<label>` 연결, 이름 "작업 검색"), 보기 전환 `보드 | 목록`(`aria-pressed` 버튼, URL `?view=board|list`, 기본 `list`), 상태 필터는 URL `?status=`, "새 작업" 링크 버튼(→`/tasks/new`), 목록/보드 행 클릭은 `ROUTES.task(id)` 이동. `TaskBoard`/`TaskList` props는 `{ tasks, onMoveTask, onSelectTask: (t: Task) => void, onDeleteTask, selectedStatus?, onSelectedStatusChange? }`로 유지하되 **`<div onClick>` 3곳(포털 카드, 카드 제목 영역, 행)을 `<button>`/`<Link>`로 교체**, 아이콘 전용 버튼 `aria-label`(+`title` 제거 가능), 호버 전용 노출 제거, 이모지(`긴급 🔥`)·`hover:-translate-y`·컬러 그림자 삭제. PR 작업(`isPrTask`)은 상태 변경 컨트롤을 렌더하지 않는다. 삭제는 `useUndo().schedule`(label "‘제목’ 작업을 삭제했어요", hide=숨김 id 집합에 추가, commit=`deleteTask`).

- [ ] **Step 1: 실패 테스트**: (a) 상태 라벨이 "리뷰 중"; (b) 목록 행의 제목이 링크(`getByRole('link',{name:/제목/})`)로 `/tasks/<id>`를 가리킴, `div`에 onClick 없음(접근성 트리에서 키보드 Enter로 이동); (c) 보드 포털 카드가 `button`이고 Enter로 `?status=`가 바뀜; (d) `view` 토글이 URL에 반영되고 새로고침(재렌더)해도 유지; (e) PR 작업 카드에는 "상태 변경" 컨트롤 없음, 수동 작업에는 있음; (f) 삭제 → 즉시 사라지고 "되돌리기" 노출, 되돌리기 시 복귀, 폴링이 같은 작업을 다시 내려줘도(숨김 집합 때문에) 창이 열린 동안 보이지 않음; (g) 상태 이동 API 실패 시 롤백+오류 알림.
- [ ] **Step 2:** `npx vitest run frontend/src/screens/TasksScreen.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 필터·정렬 로직은 Task 4 함수 재사용(`TaskList`의 내부 필터 state는 URL로 올림). 사이드바 배지 로직은 만들지 않는다.
- [ ] **Step 4:** `npm test` / `npm run lint` / `npm run build` PASS
- [ ] **Step 5: 커밋** `feat: 전체 작업 화면(보드/목록 전환, URL 상태, 되돌리기 삭제)`

### Task 12: 설정 · 내 리뷰 요청 셸 · 영역 흐름

**Files:**
- Create: `frontend/src/components/settings/MyLoginForm.tsx`, `components/settings/ConnectedReposSection.tsx`, `screens/SettingsScreen.test.tsx`, `screens/MyReviewsScreen.test.tsx`
- Modify: `screens/SettingsScreen.tsx`, `screens/MyReviewsScreen.tsx`, `screens/AreaDetailScreen.tsx`, `components/common/WatchedReposPanel.tsx`(→ `ConnectedReposSection`으로 이관 후 삭제), `services/integrationsApi.ts`(문구만: `formatSyncResult`의 "동기화" 표현)

**Interfaces:**
- Consumes: `lib/storage`(`getMyLogin`, `setMyLogin`), `usePrSyncContext`, `SyncStatusLine`, `useUndo`, `useTheme`, `listWatchedRepos/addWatchedRepo/removeWatchedRepo`(기존 시그니처).
- Produces: `<MyLoginForm initial?: string onSaved: (login: string) => void />`(라벨 "내 GitHub 로그인", 정규화 결과를 입력 아래에 "octocat으로 저장돼요"로 미리 보여 주고, 무효 입력은 `aria-invalid`+`aria-describedby` 오류 "GitHub 로그인은 영문·숫자·하이픈만 쓸 수 있어요"). `SettingsScreen` 섹션 3개: **나**(`MyLoginForm` + "{login}의 큐" 상시 표시), **연결된 레포**(기존 패널의 추가/목록/`지금 가져오기`를 모달→인라인 섹션으로; 연결 해제는 확인창 없이 `useUndo` 10초 되돌리기, 문구에 "팀 모두에게 적용돼요" 포함), **화면**(테마 라디오 그룹, `useTheme`; 이 계획에서는 밝게/어둡게 2개이며 "시스템 설정 따르기"는 screen-settings T8이 `setMode`로 추가, 결정 40). `MyReviewsScreen`: 로그인이 없으면 `MyLoginForm`을 첫 실행 안내로 표시(저장 시 큐로 전환), 있으면 `h1` "내 리뷰 요청" + "{login}의 큐" + **제목 줄에 `SyncStatusLine` 한 곳**(결정 24) + 빈 상태("리뷰할 요청이 없어요. … [영역 흐름 보기]" 링크, 결정 8). **큐 항목 데이터는 만들지 않는다**(백엔드 큐 계획 소유). `AreaDetailScreen`: `h1` "영역 상세" + 영역 흐름으로 돌아가는 링크만.

- [ ] **Step 1: 실패 테스트**: (a) 로그인 `'@Octocat '` 입력·저장 → 저장소에 `octocat`, 화면에 "octocat의 큐"; (b) `'a b'` → 저장 안 됨·`aria-invalid="true"`·오류 문구; (c) 로그인 없음이면 `/me`가 안내 폼을 보여 주고 큐 제목 줄은 없음, 저장소가 throw해도 폼 동작; (d) 로그인 있음이면 `SyncStatusLine`이 `/me`에만 있고 `/settings`에는 없음; (e) 연결 해제 → 행이 사라지고 "되돌리기"로 복귀, 10초 후 `removeWatchedRepo` 1회; (f) 테마 라디오가 `html.dark`를 토글; (g) "감시"·"동기화" 텍스트가 DOM에 없음.
- [ ] **Step 2:** `npx vitest run frontend/src/screens` → FAIL
- [ ] **Step 3: 구현** 위 계약. 모든 입력은 `label for/id`. 선택 칩(후보 로그인 제안, 05 J1)은 후보 데이터가 API 계약 소유이므로 **만들지 않는다**.
- [ ] **Step 4:** `npm test` / `npm run lint` / `npm run build` PASS
- [ ] **Step 5: 커밋** `feat: 설정 화면(나·연결된 레포·테마)과 내 리뷰 요청 셸`

### Task 13: 작업 상세 대화상자 골격 (`/tasks/:id`, `/tasks/new`)

**Files:**
- Create: `frontend/src/services/aiApi.ts`(+`aiApi.test.ts`), `hooks/useTaskForm.ts`(+test), `components/task/TaskForm.tsx`, `components/task/TaskSummary.tsx`, `components/task/TaskDetailDialog.tsx`, `components/task/TaskDetailDialog.test.tsx`
- Modify: `frontend/src/routes.tsx`(`tasks/new`, `tasks/:id`를 `TasksScreen`의 자식 라우트로 연결)

**Interfaces:**
- Consumes: `Dialog`, `useTasksContext`, `useUndo`, `ROUTES`, `lib/taskLabels`, `lib/avatar`.
- Produces:
  - `generateChecklist(input: { title: string; description: string; roleReviews: RoleReview[] }): Promise<SubTask[]>` in `services/aiApi.ts` — `postJson('/api/v1/generate-checklist/', …)`(기존 `TaskModal:150-197`의 요청 본문·응답 처리 이관), 항목 id는 `sub-ai-${crypto.randomUUID()}`, 실패는 `class AiChecklistError extends Error { kind: 'upstream'|'server'|'network' }`(502→upstream, 500→server).
  - `useTaskForm(task: Task | null, initialStatus?: TaskStatus): { values: TaskDraft; setField<K extends keyof TaskDraft>(k: K, v: TaskDraft[K]): void; isDirty: boolean; reset(): void; toPayload(): TaskDraft }` — **`task?.id`가 바뀔 때만 초기화**하고 같은 id의 서버 갱신에는 사용자가 수정한 필드를 보존.
  - `<TaskForm values setField onSubmit onCancel submitLabel errors? />`: 모든 입력 `label htmlFor`, 필수 제목 오류 `aria-invalid`/`aria-describedby`, 필드 라벨 "담당자"·"분류", 상태·우선순위는 네이티브 `<select>`.
  - `<TaskSummary task: Task />`: 생성일(`formatDate`), `PrBadge`, 제목, 설명, 담당자(PR이면 라벨 "작성자", 값은 `task.author` — PR Task의 `assigneeId`는 `""`, API 계약 §6).
  - `<TaskDetailDialog />`(라우트 컴포넌트, `useParams`): Task 9의 네이티브 `Dialog`로 렌더, 제목은 작업 제목(신규는 "새 작업"), 상단에 상태 `<select>`(`moveTask`, 대화상자는 닫히지 않음·PR 작업이면 숨김), "정보 수정" 토글(`TaskForm`), "작업 삭제"(`useUndo` 후 `/tasks`로 이동), 닫기=`navigate(-1)`(히스토리 없으면 `/tasks`)로 필터·목록 위치 유지. 작업이 로드된 뒤 id가 없으면 알림 "작업을 찾을 수 없어요. 이미 삭제됐을 수 있어요." + `/tasks`로 `replace` 이동. 신규 작성 시 체크리스트·역할 검토 영역은 렌더하지 않는다. Task 14·15가 이 파일 하단에 `ChecklistSection`/`ReviewSection`을 끼운다.

- [ ] **Step 1: 실패 테스트**: `aiApi.test.ts`(성공 시 안정 id 부여, 502→`kind:'upstream'`, reject→`network`, `Idempotency-Key` 헤더 전송), `useTaskForm.test.tsx`(필드 수정 후 같은 id의 새 `task` prop이 와도 값 보존·id가 바뀌면 초기화), `TaskDetailDialog.test.tsx`: (a) `/tasks/t1`에서 `role="dialog"` 이름이 작업 제목, 포커스가 제목으로; (b) `Esc`→닫힘, 포커스가 목록의 열었던 링크로 복귀; (c) 상태 `<select>` 변경이 대화상자를 닫지 않음; (d) PR 작업에서 상태 select 없음; (e) 삭제 → 되돌리기 토스트 + `/tasks` 이동; (f) 로드 후 없는 id → 알림 + 이동, 예외 없음; (g) 폴링으로 제목이 바뀌어도 편집 중인 설명 입력값 유지; (h) 필수 제목 비움 → `aria-invalid`.
- [ ] **Step 2:** `npx vitest run frontend/src/services/aiApi.test.ts frontend/src/hooks/useTaskForm.test.tsx frontend/src/components/task` → FAIL
- [ ] **Step 3: 구현** 위 계약. 새 작업 저장은 `createTask` 성공 시 `ROUTES.task(newId)`로 `replace` 이동.
- [ ] **Step 4:** `npm test` / `npm run lint` / `npm run build` PASS
- [ ] **Step 5: 커밋** `feat: URL 기반 작업 상세 대화상자와 폼 분리`

### Task 14: 체크리스트 접힘 영역 (+ 체크리스트 제안받기)

**Files:**
- Create: `frontend/src/components/task/ChecklistSection.tsx`, `hooks/useChecklistGenerator.ts`, 각 test
- Modify: `components/task/TaskDetailDialog.tsx`(섹션 삽입)

**Interfaces:**
- Consumes: `useTasksContext`(`toggleSubtask/addSubtask/removeSubtask/replaceSubtasks`), `generateChecklist`.
- Produces: `<ChecklistSection task: Task />` — `<details>`(기본 접힘) `<summary>`에 "체크리스트 (완료/전체)" 텍스트; 항목은 `<label><input type="checkbox">`, 삭제 버튼 `aria-label="‘항목’ 삭제"`(상시 노출), 추가 입력은 `label` 연결, **"체크리스트 제안받기" 버튼은 이 한 곳에만**(기존 3곳 복제 제거), `task.hasUnreflectedReview`면 정적 문구 "새 역할 검토가 아직 체크리스트에 반영되지 않았어요" + 같은 버튼(ping/pulse 없음). `useChecklistGenerator(task: Task): { generate(): Promise<void>; state: 'idle'|'loading'|'error'; error: string | null }` — `generateChecklist` → `replaceSubtasks(task.id, items)`; 오류 문구는 해요체(upstream: "AI 서버가 응답하지 않았어요. 잠시 뒤에 다시 시도해 주세요."). 전체 완료 시 축하 오버레이·자동 다음 단계 제안은 **만들지 않는다**(04 폐기).

- [ ] **Step 1: 실패 테스트**: (a) 기본 `details`가 닫혀 있고 summary 텍스트가 "체크리스트 (1/3)"; (b) 체크 토글이 `toggleSubtask(taskId, id, true)` 호출·실패 시 롤백(Task 6 계약)으로 체크 상태 복귀; (c) 제안받기 성공 시 `replaceSubtasks`가 `sub-ai-` 접두 id 배열로 호출; (d) 502 → `role="alert"` 문구, 버튼 재시도 가능; (e) 로딩 중 버튼 `aria-disabled`·중복 호출 없음; (f) 항목 입력 중 폴링으로 `task`가 갱신돼도 추가 입력창 값 유지; (g) 삭제 버튼이 포커스 가능하고 이름이 항목명 포함.
- [ ] **Step 2:** `npx vitest run frontend/src/components/task/ChecklistSection.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 체크리스트를 접힘 보조 영역으로 분리`

### Task 15: 역할 검토 접힘 영역

**Files:**
- Create: `frontend/src/components/task/ReviewSection.tsx`, `ReviewSection.test.tsx`
- Modify: `components/task/TaskDetailDialog.tsx`

**Interfaces:**
- Consumes: `useTasksContext`(`addReview/updateReview/deleteReview`).
- Produces: `<ReviewSection task: Task />` — `<details>` 기본 접힘, summary "역할 검토 (n)"; 목록(역할 뱃지, 긴급 텍스트 "긴급"(이모지·pulse 없음), 본문, "확인함" 버튼(구 Accept, 확인 후 "확인함 · 날짜" 텍스트), 삭제 `aria-label`), 추가 폼(역할 `<select>` + 직접 입력, 검토자, 긴급도, 내용; 전부 `label for/id`, 영어 병기 제거: "개발자"/"디자이너" 등). 입력 초안은 **섹션 로컬 state**이며 `task` prop 갱신으로 리셋되지 않는다. 첫 역할 검토 추가 시 서버가 돌려준 `taskStatus` 반영은 `useTasks`가 담당(추가 PATCH 없음).

- [ ] **Step 1: 실패 테스트**: (a) 기본 접힘·summary "역할 검토 (2)"; (b) 폼 입력 후 같은 `task`의 새 객체(폴링)로 리렌더해도 내용 보존; (c) 추가 성공 시 폼 초기화, 실패 시 내용 보존 + `role="alert"`; (d) "확인함" 클릭이 `updateReview(..., {isAccepted:true})` 호출; (e) DOM에 "Accept"·"Urgent"·"Developer" 문자열 없음; (f) 삭제 버튼이 호버 없이 접근 가능.
- [ ] **Step 2:** `npx vitest run frontend/src/components/task/ReviewSection.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. Task 14와 파일이 달라 병렬 가능하나 `TaskDetailDialog.tsx` 삽입 지점이 겹치므로 머지 시 충돌만 해결.
- [ ] **Step 4:** `npm test` / `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 역할 검토를 접힘 보조 영역으로 분리`

### Task 16: TaskModal 삭제 · 최종 가드 · 문서 갱신

**Files:**
- Delete: `frontend/src/components/common/TaskModal.tsx`
- Create: `frontend/src/lib/guards.test.ts`(Task 5의 `removed.test.ts`와 통합 가능)
- Modify: `CLAUDE.md`(Frontend structure 절 갱신), `docs/DECISIONS.md`(날짜 항목 **추가**, 기존 항목 덮어쓰기 금지)

**Interfaces:** Consumes: 앞 모든 태스크. Produces: 없음.

- [ ] **Step 1: 실패 테스트(가드)** `guards.test.ts`가 `frontend/src`의 비테스트 소스를 읽어 0건을 단언: (a) 무효 클래스 정규식(`slate-(850|150|355|250|750)|blue-450|emerald-455`); (b) `/<(div|span)\b[^>]*\sonClick=/`; (c) `animate-(pulse|ping|bounce)`; (d) `localStorage`/`sessionStorage`(`lib/storage.ts` 제외); (e) 금지 문자열 `Accept|업무|감시|v1\.0\.0|Workflow Diagram|\(Review\)|\(Done\)|\(Urgent\)|🔥|🎉`; (f) `TaskModal` 참조; (f2) `BrowserRouter` 참조(결정 27: `HashRouter`만); (g) `fetch\([^)]*method:\s*'POST'`(`apiClient.ts` 제외); (g2) 외부 CDN 의존 0건(결정 20): 루트 `index.html`과 `frontend/src` 비테스트 소스·CSS에서 `<script|<link ... (src|href)="https?://`, CSS `@import url(http`, `https://(fonts\.googleapis|cdn\.|unpkg|cdnjs|esm\.sh|aistudiocdn)` 0건(`localhost`·`github.com` 링크 문자열은 허용); (h) 직접 `console.error`만으로 끝나는 mutation catch는 정규식으로 잡기 어려우므로 제외(Task 6 테스트가 보장). 가드는 `components/dashboard/ArchitectureView.tsx`와 `components/dashboard/architecture/`를 **검사 대상에서 제외**한다(구 파일이며 screen-area-flow T7이 삭제한다; 이 계획은 그 파일을 수정하지 않는다).
- [ ] **Step 2:** `npx vitest run frontend/src/lib/guards.test.ts` → FAIL(TaskModal 위반)
- [ ] **Step 3: 구현** `TaskModal.tsx` 삭제(워크플로 도식·완료 오버레이·`실시간 동기화` 뱃지·Sparkles 포함 폐기, 04 매핑표). 남은 위반 수정. CLAUDE.md "Frontend structure"를 새 구조(routes/screens/hooks/lib/components/task)로 갱신, `docs/DECISIONS.md`에 2026-11-24 항목 추가(문제: 590줄 App·1,093줄 모달·URL 없음 / 해결: 라우터·훅·Dialog / 결과: 이 계획의 검증 결과).
- [ ] **Step 4: 최종 검증** `npm run lint`, `npm test`, `npm run build` 모두 PASS. 수동: `npm run dev` + 백엔드(`docker compose up`)에서 `/#/me → /#/tasks → /#/tasks/<id>(Esc, 뒤로가기, Tab이 대화상자 밖으로 나가지 않음, 닫으면 열었던 링크로 포커스 복귀) → /#/settings`, OS 다크 설정과 앱 토글이 둘 다 `html.dark`로 일관 동작, 320px 폭에서 가로 스크롤 없음(DevTools 에뮬레이션).
- [ ] **Step 5: 커밋** `refactor: TaskModal 제거와 가드 테스트, 문서 갱신`

### Task 17: 시각 토큰 값·폰트 적용 (결정 36 — 사용자 렌더 확인 게이트)

**Files:**
- Modify: `frontend/src/index.css`(`/* TEMP: Impeccable */` 값을 `docs/ux/10-visual-direction.md` §5 값으로 교체, `@font-face` 추가), 아직 `dark:` 쌍이 남은 비테스트 소스(`grep -rln 'dark:' frontend/src`로 실행 시점에 확인; 토큰 유틸리티 `bg-surface-raised`·`text-muted` 등으로 치환)
- Create: `frontend/public/fonts/`(Pretendard 동적 서브셋 woff2 + `LICENSE`(SIL OFL)), `frontend/src/styles/tokenValues.test.ts`

**Interfaces:** Consumes: Task 3의 토큰 이름(이름은 바꾸지 않는다), 10 §2·§5. Produces: 없음. **실행 시점:** 화면 계획(queue·area·tasks·settings)이 모두 끝나고 구 파일(`ArchitectureView` 등)이 삭제된 뒤. 앞서 만든 화면은 토큰 이름만 쓰므로 값 교체로 깨지지 않는다.

- [ ] **Step 1: 실패 테스트** `tokenValues.test.ts`: (a) `index.css`에 `TEMP: Impeccable` 0건; (b) `--font-sans` 값이 `Pretendard`로 시작하고 폴백 스택(`Apple SD Gothic Neo`, `Malgun Gothic`, `system-ui`)을 포함; (c) `@font-face`의 `src`가 모두 `/fonts/`로 시작하는 로컬 경로이고 `http(s)://` URL 0건(결정 20); (d) 비테스트 소스의 `dark:` 변형 0건(`bg-surface` 계열로 통일); (e) `index.css`의 라이트·다크 블록에 10 §5의 토큰 21개가 모두 hex 값으로 존재(비어 있지 않음).
- [ ] **Step 2:** `npx vitest run frontend/src/styles/tokenValues.test.ts` → FAIL
- [ ] **Step 3: 구현** 값 교체와 `dark:` 치환. 폰트 파일은 `npm pack pretendard`를 **임시 디렉터리**에서 실행해 동적 서브셋 woff2만 `frontend/public/fonts/`로 복사한다(`package.json`에 의존성을 추가하지 않는다. 설치 경로·용량은 10 §2.1이 "확인 필요"로 남긴 항목이므로 실제 용량을 PR 설명에 적는다). `font-display: swap`, 숫자에 `font-variant-numeric: tabular-nums`.
- [ ] **Step 4: 검증과 게이트** `npm test`, `npm run lint`, `npm run build` PASS. 10 §3.3 대비 재측정(호버·눌림·비활성), DevTools 그레이스케일, 320px. 그다음 `/#/me`, `/#/areas`, `/#/tasks`, `/#/settings`의 라이트·다크 스크린샷을 사용자에게 보여 주고 **승인을 받기 전에는 머지하지 않는다**(결정 36: 이 방향은 Impeccable이 배정한 후보이며 렌더링을 보고 재검토할 수 있다).
- [ ] **Step 5: 커밋** `feat: 시각 토큰 값과 Pretendard 자가 호스팅 적용`

---

## 07 §5 체크리스트 → 태스크 매핑 (이 범위)

| 07 §5 번호 | 내용 | 담당 |
|---|---|---|
| 12 | localStorage 차단에서도 동작 + 안내 | Task 2, 10 |
| 13 | 낙관적 갱신 실패 롤백 + 알림 | Task 6 (+11, 14, 15의 UI 확인) |
| 20 | 연결 해제 안내("팀 모두에게 적용") — 결정 17에 따라 확인창 대신 되돌리기 | Task 8, 12 |
| 22, 23, 30, 33 | `div onClick` 0건, 상태 변경 컨트롤, 아이콘 `aria-label`, 호버 전용 제거 | Task 11, 13~15, 16 가드 |
| 24~26 | 스킵 링크, 라우트 전환 시 `title`·포커스, `h1`/`main`/`nav`/`lang="ko"` | Task 3, 10 |
| 27, 28 | 패널·모달 포커스 이동/복귀/트랩/Esc/`aria-modal` | Task 9, 13 |
| 29 | 라벨 연결, 오류 `aria-describedby` | Task 12, 13, 15 |
| 31 | 대체 링 없는 `outline-none` 0건 | Task 3(토큰 `--focus-ring`), 새 컴포넌트 전체 |
| 42, 43 | 알림 낭독 규칙, reduced-motion·`animate-*` 0건 | Task 3, 7, 8, 16 |
| 46, 47, 49 | 금지 용어, "지금 가져오기" 문구, 해요체 | 용어는 Global Constraints, 가드는 Task 16 |

**이 계획에서 하지 않는 07 항목(이유):** 1~11·14~19·21·36~41·44·45(큐·영역 시각화·서버 신선도·로그인 후보 대조·키보드 행 펼침 등: 큐 데이터/API 계약 의존 또는 시각 디자인 단계), 32·34·35·41(색 대비·글자 크기·타깃 크기 실측: Impeccable 토큰 값 확정 후). 큐 목록 UI, 영역 상세 내용, 영역 별칭, 다중 리뷰어 모델은 백엔드 계획 완료 후 별도 프런트 계획이 맡는다.

## Self-Review

- 스펙 커버리지: 범위 (1)=Task 3, (2)=Task 10, (3)=Task 5·6·7·10, (4)=Task 2, (5)=Task 9·13~16, (6)=위 매핑표, (7)=Task 7·8, (8)=Task 5·16, 결정 36(시각 값·폰트)=Task 17, 결정 40(테마 모드)=Task 3. 결정 6·9·12·16·17·19·20·24가 Global Constraints에 반영됨.
- 타입 일관성: `MutationResult`(Task 6)를 Task 11·13~15가 소비, `SyncStatusInfo`(Task 7)를 Task 12가 소비, `UNDO_WINDOW_MS`/`useUndo.schedule`(Task 8)을 Task 11·12·13이 소비, `ROUTES`(Task 10)를 Task 11·13이 소비.
- 비례: 코드 본문 없이 시그니처·단언 위주.

## 태스크 의존 그래프

```
T1(테스트 인프라)
 ├─ T2(storage) ─┬─ T3(토큰/다크) → T4(lib 추출) → T5(폐기 제거) ─┐
 │               └─ T6(useTasks) ──────────────────────────────────┤
 ├─ T7(usePrSync/SyncStatusLine) ─────────────────────────────────┤
 ├─ T8(토스트/되돌리기) ─────────────────────────────────────────┤
 └─ T9(Dialog) ───────────────────────────────────────────────────┤
                                                                    ▼
                                              T10(라우터·AppShell·App 분해)
                                                    ├─ T11(전체 작업)
                                                    ├─ T12(설정·내 리뷰 요청 셸·영역)
                                                    └─ T13(작업 상세 골격) ─┬─ T14(체크리스트)
                                                                              └─ T15(역할 검토)
                                         T11~T15 모두 ─────────────→ T16(TaskModal 삭제·가드·문서)
T16 + 모든 화면 계획 완료 ───────────────→ T17(시각 토큰 값·폰트, 사용자 렌더 확인 게이트)
```

**병렬 가능 묶음** (같은 파일을 만지는 태스크는 같은 묶음 안에서 직렬):
- 묶음 A(직렬 시작): T1
- 묶음 B(T1 후 병렬): {T2 → T3 → T4 → T5}(TaskBoard/TaskModal/App을 공유하므로 이 체인은 직렬), T6(새 파일만, T2 후), T7, T8, T9 — 체인 하나 + 독립 4개
- 묶음 C(B 전부 후): T10 단독
- 묶음 D(T10 후 병렬): T11, T12, T13
- 묶음 E(T13 후 병렬): T14, T15(`TaskDetailDialog.tsx` 삽입 지점 충돌만 머지 시 해결)
- 묶음 F: T16 단독
- 묶음 G(화면 계획 4개와 구 파일 삭제가 끝난 뒤): T17 단독(사용자 승인 게이트)

## 사용자 결정이 필요한 질문

모두 확정됨(2026-11-24 "전부 추천대로"): 라우터는 HashRouter(결정 27), 대화상자는 네이티브 `<dialog>.showModal()`이고 작업 상세는 모달 유지(결정 28), 전체 작업 기본 보기는 목록(결정 29), 되돌리기는 10초 지연 DELETE(결정 30). 이 계획에 남은 미결 질문은 없다.
