# 전체 작업 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tasks`를 칸반·리스트 통합 화면(기본 목록, 보드 전환, 출처·담당자·상태·검색 필터, 빈/오류/로딩 상태, 320px 리플로)으로 완성한다.

**Architecture:** 필터·정렬·URL 쿼리 직렬화는 순수 모듈(`lib/taskView.ts`) 하나로 모으고, 목록(`TaskList.tsx`)과 보드(`TaskBoard.tsx`)는 그 결과를 받는 **제어형 표현 컴포넌트**로 다시 쓴다. 두 보기는 상태 컨트롤(`TaskStatusControl`)·필터 바·상태 컴포넌트를 공유한다. 작업 상세는 foundation의 `/tasks/:id` 대화상자(자식 라우트)를 그대로 쓰며, 이 계획은 목록 → 상세 링크가 필터 쿼리를 유지하게만 한다.

**Tech Stack:** React 19, TypeScript, react-router v7(`useSearchParams`, `Link`, `Outlet`), Tailwind 4 토큰 유틸리티, Vitest + Testing Library(foundation Task 1 인프라).

**Spec:** `docs/ux/00-context.md`(확정 결정 1~40, 특히 4·6·9·12·17·18·19·28·29·30·33), `docs/ux/03-current-ui-inventory.md`(§1.1, §4, §6), `docs/ux/04-information-architecture.md`(§2 매핑, §3 용어집), `docs/ux/05-user-journeys.md`(§4 오류·빈 상태 원칙), `docs/ux/06-wireframes.md`(§6 전체 작업), `docs/ux/07-fortify-include-review.md`(§2.2, §3.2~3.3, §5 체크리스트), `docs/ux/wireframes/index.html`(프레임 10 `#scr-tasks`). 소비하는 계획: `docs/superpowers/plans/2026-11-24-frontend-foundation.md`, `docs/superpowers/plans/2026-11-24-api-contract.md`(§6 Task API).

## 선행 조건과 foundation 계획과의 관계

- **foundation Task 1~13이 머지된 뒤** 시작한다(필수: 2·4·6·8·10·11·13). 이 계획은 foundation **Task 11이 만든 `TasksScreen.tsx`/`TaskBoard.tsx`/`TaskList.tsx`를 덮어쓴다**(같은 파일명 유지). foundation `TasksScreen.test.tsx`의 (c)항("보드 포털 카드 Enter로 `?status=` 변경")은 포털 제거로 무효가 되므로 이 계획 Task 7이 대체한다.
- 이 계획은 foundation의 이름·시그니처를 그대로 쓴다: `renderWithRouter`, `useTasksContext(): TasksApi`(`tasks`, `loadState`, `refresh`, `moveTask`, `deleteTask`, `MutationResult`), `useUndo().schedule`, `useToasts().notify`, `ROUTES`, `lib/taskLabels`(`STATUS_ORDER`, `STATUS_LABEL`, `PRIORITY_LABEL`), `lib/taskFilters`(`searchTasks`, `countByStatus`), `lib/avatar`, `lib/date`, `lib/storage`(`normalizeLogin`), `hooks/useMyLogin`(`useMyLogin().login`, screen-settings T1 소유 — 내 로그인은 이 훅으로만 읽는다).
- 라우터 방식(결정 27 HashRouter)과 대화상자 방식(결정 28 네이티브 `<dialog>`)은 foundation이 소유한다. 이 계획의 코드는 `useSearchParams`/`Link`/`Outlet`만 써서 어느 라우터에도 동작한다.

## 03 인벤토리 근거의 재사용·통합 판단

| 현재 파일 | 판단 | 근거와 처리 |
|---|---|---|
| `TaskBoard.tsx`(456줄) | **같은 파일명으로 재작성**. 코드 재사용 거의 없음 | 2단계 포털(177-225)과 상태별 `desc`(106-133)·고정 높이 카드(326)·죽은 `getPriorityStyle/getCategoryStyle`·이모지·좌측 굵은 테두리(50-68)는 04 §2 매핑표와 03 §4가 폐기. 남기는 것은 카드에 담는 필드(제목·담당·우선순위·삭제)뿐. 아바타는 foundation이 `lib/avatar`로 이관 |
| `TaskList.tsx`(333줄) | **같은 파일명으로 제어형 전환, 뼈대 재사용** | 테이블 열 구조·생성일 정렬 토글·행 삭제는 유지. 내부 필터 state(75-78)·담당자 텍스트 검색·`exclude_done` 분기는 `lib/taskView.ts`와 URL로 이동(03 §6.2-9) |
| 통합 방식 | 두 컴포넌트는 **합치지 않는다** | DOM 구조가 다르다(table vs 4열 section). 통합 대상은 데이터 파이프라인(필터·정렬·카운트), 상태 컨트롤, 필터 바, 빈/오류 상태. 03 §6.1이 지적한 3중 복사(아바타·우선순위 라벨·상태 이동)가 전부 한 곳이 된다 |
| `PrBadge.tsx`(17줄) | 문구·크기만 수정 | 9px 보라 "PR" → 텍스트 "리뷰 요청"(04 §3), 12px 이상 |

## Global Constraints

- 수정 범위는 `frontend/src/`만. `backend/` 수정 금지. POST는 `postJson()`만(이 계획은 새 POST 없음).
- 상태 변경은 `<select>`(드래그·키보드 단축키 금지, 결정 19, 07 §2.2). **PR 항목(`kind==='pr'`)은 상태 변경 컨트롤을 렌더하지 않고** 글자 "‘상태’ · GitHub 기준"만 보인다(결정 12). 보드 카드에서는 "이동 불가"를 덧붙인다.
- 삭제는 확인 대화상자 없이 `useUndo().schedule`(10초 되돌리기, 결정 17·30). 작업 상세는 모달 유지(결정 28), 기본 보기는 목록(결정 29).
- **PR 출처 정책(결정 38):** 새 PR은 "내 리뷰 요청"에서만 보인다. 전체 작업은 **기존 PR Task를 유지해 보여 주기만** 하고(상태 이동 불가, `kind==='pr'`), 새 PR 행을 만들지 않는다. `Task.author`는 표시에만 쓰고, Task API에 영역(`areaId`)은 없으므로 **영역 열·영역 필터를 만들지 않는다**.
- 용어(04 §3, 결정 9): 화면 제목 **전체 작업**, 보기 **목록 / 보드**, 상태 **할 일 / 진행 중 / 리뷰 중 / 완료**, PR 작업 배지 **리뷰 요청**, 사람 필드는 PR **작성자** · 수동 작업 **담당자**(07 T9), 출처 필터는 **출처**(07 T7: 전체 / 리뷰 요청 / 직접 만든 작업), 버튼 **새 작업**. 영어 병기·이모지(`🔥`)·가짜 문구·화면 부제 금지(03 §4).
- 문장 문구는 해요체, 오류·빈 상태는 "무슨 일 / 영향 / 지금 할 일"(07 §3.2). 검색·필터는 새 작업 목록에 **서버 호출을 추가하지 않는다**(클라이언트 계산, `GET /tasks/` 한 번).
- 새 코드에서 `<div onClick>`/`<span onClick>` 금지, 아이콘 전용 버튼 `aria-label` 필수, 호버 전용 컨트롤 금지, 상호작용 요소 ≥ 24×24px(닫기·칩은 44px 영역), 본문 12px 미만 금지, `animate-pulse|ping|bounce` 금지, `outline-none`은 대체 포커스 링과 함께만.
- 시각 값은 토큰 이름으로만 참조: `bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `text-text`, `text-muted`, `border-border`, `border-border-strong`, `bg-accent`, `text-accent-contrast`, `ring-focus-ring`, `text-danger`, `text-success`, `text-warning`, `text-[--status-*]`(상태 4종), `--priority-*`, 타입 스케일 `--text-caption|body-sm|body|title|heading`, 모서리 `--radius-sm|md`, 간격 4px 기준, 그림자는 `--shadow-overlay`만(카드에는 그림자·컬러 그림자 없음). 임의 색 값(`slate-*`, `blue-*`, hex) 금지. 색만으로 상태·우선순위를 구분하지 않는다(글자 병기).
- 320px 리플로(결정 18): 고정 폭(`w-64`, `min-w-[...px]`, `grid-cols-4` 무접두)은 `md:` 이상에서만. 가로 스크롤 없음.
- 커밋 메시지는 한국어 `type: 요약` + 시스템이 지정한 Co-Authored-By 줄.

## Review Focus

1. 깨졌거나 낯선 URL 쿼리(`?status=zzz&view=x&kind=&assignee=%E0%A4%A&q=`, 같은 키 중복)에서 예외 없이 기본값으로 복귀하고 칩·선택값이 화면과 일치한다. (Task 1, 7)
2. 서버 오류·로딩·"작업 0개"·"필터 결과 0개"가 서로 다른 화면이다. 서버가 죽었을 때 "아직 작업이 없어요"가 나오지 않는다. (Task 6, 7)
3. 담당자는 자유 문자열이다: 대소문자·앞뒤 공백 차이(`Minji `, `minji`), 빈 값(PR 작업), 한글 이름, 후보 80개 이상, 내 GitHub 로그인 미설정에서도 필터가 예외 없이 동작한다. (Task 1, 2)
4. 한글 IME로 검색어를 입력하는 도중(조합 중) 글자가 유실되거나 URL 갱신이 입력을 되돌리지 않는다. 아주 긴 제목·수백 건에서도 잘림 없이 2줄 줄바꿈된다. (Task 2, 4)
5. 상태 변경 뒤 카드가 다른 열로 가도 포커스가 그 카드의 컨트롤에 남고 이동 결과가 한 번 낭독된다. 폴링으로 포커스된 행이 사라져도 포커스가 `body`로 떨어지지 않는다. (Task 3, 6)

---

### Task 1: 필터·정렬·URL 직렬화 순수 모듈과 Task 타입 확장

**Files:**
- Create: `frontend/src/lib/taskView.ts`, `frontend/src/lib/taskView.test.ts`

**Interfaces:**
- Consumes: foundation `STATUS_ORDER`, `searchTasks`, `normalizeLogin`.
- Produces:
  - (소비) `Task.kind?: 'pr' | 'manual'`, `Task.author?: string | null` — API 계약 §6(결정 33). **타입은 foundation T4가 `types/index.ts`에 추가한다**(이 계획은 정의하지 않고 import만). `author`는 PR Task에서 작성자 GitHub 로그인(알 수 없으면 `""`), 수동 Task에서 `null`; 화면은 값이 없거나 빈 문자열이면 `—`.
  - (소비) `isPrTask(t: Pick<Task, 'id' | 'kind'>): boolean` — foundation T4 소유(`kind` 우선, 없으면 `id.startsWith('pr-')`, `sourceUrl`로 판정하지 않음: 수동 작업도 PR URL을 가질 수 있음). 이 계획은 `lib/taskLabels.ts`를 수정하지 않는다.
  - 타입: `TaskView = 'list'|'board'`, `TaskKindFilter = 'all'|'pr'|'manual'`, `TaskSortKey = 'createdAt'|'title'|'status'|'priority'`, `TaskViewFilter = { q: string; status: TaskStatus|'all'; kind: TaskKindFilter; assignee: string }`(`assignee`: `''`=전체, `'me'`, `'none'`=담당자 없음, 그 외는 이름 문자열), `TaskViewState = TaskViewFilter & { view: TaskView; sort: TaskSortKey; dir: 'asc'|'desc' }`.
  - `DEFAULT_VIEW_STATE: TaskViewState`(`view:'list'`, `sort:'createdAt'`, `dir:'desc'`, 나머지 전체).
  - `parseTaskViewParams(sp: URLSearchParams): TaskViewState` — 알 수 없는 값은 해당 필드만 기본값, 같은 키 중복은 첫 값, `q`는 trim·200자 자름, `view=board`면 `status`는 `'all'`.
  - `toTaskViewParams(s: Partial<TaskViewState>): URLSearchParams` — 기본값인 키는 생략, `view==='board'`면 `status` 생략.
  - `tasksPath(s: Partial<TaskViewState>): string` — `/tasks` 또는 `/tasks?...`(다른 화면이 "대기 N건" 같은 딥링크를 걸 때 사용).
  - `taskLinkTo(id: string, search: string): { pathname: string; search: string }` — `ROUTES.task(id)`와 현재 `location.search`를 그대로 보존.
  - `applyTaskFilter(tasks: Task[], f: TaskViewFilter, ctx: { me: string | null }): Task[]` — `q`는 `searchTasks` 결과 ∪ 담당자·작성자 부분 일치. 담당자 비교는 `trim().toLowerCase()`; `'me'`는 `ctx.me`가 null이면 빈 결과가 아니라 **필터 무시**(UI가 선택지를 숨기므로 도달 불가, 방어용); `'me'`는 `assigneeId` 또는 `author`가 `ctx.me`와 같은 작업.
  - `sortTasks(tasks: Task[], key: TaskSortKey, dir: 'asc'|'desc'): Task[]` — 새 배열, 동률은 `id`로 안정 정렬, 우선순위는 low<medium<high<urgent, 상태는 `STATUS_ORDER` 순, 제목은 `localeCompare('ko')`.
  - `nextSort(cur: { key: TaskSortKey; dir: 'asc'|'desc' }, key: TaskSortKey): { key: TaskSortKey; dir: 'asc'|'desc' }` — 같은 키면 방향 반전, 다른 키면 `asc`(`createdAt`만 `desc` 시작).
  - `assigneeOptions(tasks: Task[]): { value: string; label: string; count: number }[]` — `assigneeId`(trim 후 비어 있지 않은 것)만, 대소문자만 다른 값은 하나로 합치고 `label`은 첫 등장 표기, 개수 내림차순 → 이름순.
  - `displayTitle(t: Pick<Task,'title'>): string` — 앞의 `[PR] `만 제거(`'[PR] #58 제목'`→`'#58 제목'`).

- [ ] **Step 1: 실패 테스트** `taskView.test.ts`: (a) `parseTaskViewParams(new URLSearchParams('status=zzz&view=x&kind=&sort=nope&dir=up'))`가 `DEFAULT_VIEW_STATE`와 같음; (b) `'view=board&status=review'`→`status:'all'`; (c) `'status=todo&status=done'`→`'todo'`; (d) `toTaskViewParams(DEFAULT_VIEW_STATE).toString()===''`, `parse(toTaskViewParams(s))`가 임의 상태 `s`에서 왕복 동일; (e) `tasksPath({kind:'pr'})==='/tasks?kind=pr'`, `tasksPath({})==='/tasks'`; (f) `taskLinkTo('a b','?view=board&kind=pr')`→`{pathname:'/tasks/a%20b', search:'?view=board&kind=pr'}`; (g) `applyTaskFilter`: `assignee:'minji'`가 `' Minji '` 작업을 포함, `'none'`이 `''` 담당자(PR)만, `'me'`+`me:'minji-park'`가 `assigneeId` 또는 `author`가 같은 작업을 포함, `q:'jaeho'`가 `author:'jaeho-lee'` 작업을 포함, `kind:'manual'`이 `id:'pr-…'` 작업을 제외하고 `sourceUrl`이 PR URL인 `id:'t1'`은 포함; (h) `assigneeOptions`가 `['Minji','minji ','']`를 `[{value:'minji', label:'Minji', count:2}]`로 합침, 100개 입력에서도 예외 없음; (i) `sortTasks` 우선순위 desc에서 urgent 먼저, 입력 배열 불변; (j) `nextSort`; (k) `displayTitle('[PR] #58 x')==='#58 x'`, `'[PR]'` 단독·빈 문자열 안전; (l) `isPrTask`의 `kind`/`id` 판정 테스트는 foundation T4(`taskLabels.test.ts`)가 소유하며 여기서는 `applyTaskFilter`의 `kind` 필터가 `isPrTask`를 쓰는지만 (g)로 확인.
- [ ] **Step 2:** `npx vitest run frontend/src/lib/taskView.test.ts` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 쿼리 키 이름은 `view`, `status`, `kind`, `assignee`, `q`, `sort`, `dir`(foundation의 `?view=`, `?status=`와 동일).
- [ ] **Step 4:** 같은 명령 → PASS, `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 전체 작업 필터·정렬·URL 쿼리 순수 모듈 추가`

### Task 2: `useTaskView` 훅과 `TaskFilterBar`

**Files:**
- Create: `frontend/src/hooks/useTaskView.ts`, `frontend/src/components/dashboard/TaskFilterBar.tsx`, 각 `*.test.tsx`

**Interfaces:**
- Consumes: Task 1 전체, `useMyLogin`(settings T1), `countByStatus`, `STATUS_LABEL`.
- Produces:
  - `useTaskView(): { state: TaskViewState; filter: TaskViewFilter; search: string; set(patch: Partial<TaskViewState>, opts?: { replace?: boolean }): void; clearFilters(): void; activeFilters: { key: 'q'|'status'|'kind'|'assignee'; label: string }[] }` — `useSearchParams` 기반. `search`는 현재 `location.search`(`'?…'` 또는 `''`). `activeFilters.label` 예: `검색어 “결제”`, `상태 리뷰 중`, `출처 리뷰 요청`, `담당자 minji`. `set`은 기본적으로 `replace:false`(보기 전환·칩), 검색 타이핑은 `replace:true`.
  - `<TaskFilterBar state onChange(patch: Partial<TaskViewState>) assignees: ReturnType<typeof assigneeOptions> counts: ReturnType<typeof countByStatus> hasMe: boolean resultCount: number />`:
    - 검색 `<input type="search">`(`<label>` 이름 "작업 검색", 플레이스홀더 "제목, 담당자, 작성자로 검색"). **로컬 draft state**를 쓰고 `onCompositionStart/End`로 조합 중에는 URL 반영을 미루며, 외부(뒤로가기)로 `state.q`가 바뀔 때만 draft를 덮어쓴다.
    - `<select>` 2개: 출처(`전체|리뷰 요청|직접 만든 작업`), 담당자(`전체`, `나`(`hasMe`일 때만), `담당자 없음`, 이어서 `assigneeOptions` 라벨+개수). 네이티브 `<label>` 연결.
    - 상태 칩 그룹 `role="group" aria-label="상태 필터"`(`aria-pressed` 버튼, "전체 6 / 할 일 1 …" — 숫자는 `counts`, 보드 보기에서는 **렌더하지 않음**).
    - 보기 전환 `role="group" aria-label="보기 전환"` 안 버튼 2개 "목록"/"보드"(`aria-pressed`; 03의 "칸반"이라는 단어는 쓰지 않는다).
    - `role="status"` 한 줄 "작업 {resultCount}개"(값이 바뀔 때만 낭독, 보이는 텍스트).
    - 필터가 하나라도 걸려 있으면 "필터 해제" 버튼(`onChange(DEFAULT 필터)`).
    - 좁은 폭(<`md`)에서 모든 컨트롤이 세로로 쌓이고 `w-full`, `md:`부터 한 줄.

- [ ] **Step 1: 실패 테스트**: `useTaskView.test.tsx`(`MemoryRouter initialEntries=['/tasks?kind=pr&q=%EA%B2%B0%EC%A0%9C']`): (a) `state.kind==='pr'`, `state.q==='결제'`; (b) `set({view:'board'})` 후 `search`에 `view=board`, `status` 제거; (c) `clearFilters()`가 `view`/`sort`는 유지하고 필터 4개만 해제; (d) `activeFilters` 라벨. `TaskFilterBar.test.tsx`: (e) `hasMe=false`면 담당자 select에 "나" 옵션 없음; (f) 칩 "리뷰 중 2" 클릭 → `onChange({status:'review'})`, 보드 보기에서는 칩 그룹 없음; (g) 한글 조합: `fireEvent.compositionStart` 후 `change` 값 `'결ㅈ'` → `onChange` 미호출, `compositionEnd` 후 `'결제'`로 1회 호출; (h) `state.q`가 외부에서 바뀌면 입력값 갱신; (i) 필터 없으면 "필터 해제" 없음; (j) 결과 수 `status` 영역 텍스트 "작업 3개", 같은 값으로 리렌더해도 DOM 노드 교체 없음; (k) 모든 컨트롤이 접근 가능한 이름을 가짐(`getByRole('combobox',{name:'출처'})` 등); (l) 어떤 입력도 `animate-` 클래스 없음.
- [ ] **Step 2:** `npx vitest run frontend/src/hooks/useTaskView.test.tsx frontend/src/components/dashboard/TaskFilterBar.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 스타일은 토큰 유틸리티만.
- [ ] **Step 4:** 같은 명령 → PASS, `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 전체 작업 필터 바와 URL 상태 훅 추가`

### Task 3: `TaskStatusControl`과 PR 배지 문구

**Files:**
- Create: `frontend/src/components/dashboard/TaskStatusControl.tsx`, `TaskStatusControl.test.tsx`
- Modify: `frontend/src/components/common/PrBadge.tsx`(+ `PrBadge.test.tsx` 신규)

**Interfaces:**
- Consumes: `isPrTask`, `STATUS_ORDER`, `STATUS_LABEL`, `displayTitle`, `useToasts().notify`, `MutationResult`.
- Produces:
  - `<TaskStatusControl task: Task onMove: (id: string, s: TaskStatus) => Promise<MutationResult> showLockNote?: boolean />` — 수동 작업: `<select>` `aria-label="‘{displayTitle}’ 상태 변경"`, `data-status-control={task.id}`. 변경 성공 시 `notify("‘{제목}’을 {STATUS_MOVED[s]} 옮겼어요", 'info')`(`STATUS_MOVED = { todo:'할 일로', inprogress:'진행 중으로', review:'리뷰 중으로', done:'완료로' }`)와, 다음 렌더 후 같은 `data-status-control` 요소로 포커스 복귀. 실패(`ok:false`)는 select 값이 원래대로 돌아가고 알림은 `useTasks`가 이미 냈으므로 **추가 알림 없음**. PR 작업: 컨트롤 없이 텍스트 `"{STATUS_LABEL} · GitHub 기준"`(+ `showLockNote`면 " · 이동 불가"). 색이 아닌 글자로 상태 표시.
  - `PrBadge({ url?: string })`: 글자 "리뷰 요청", 링크면 `aria-label="GitHub에서 열기"`와 `rel="noopener noreferrer" target="_blank"`, 12px 이상.

- [ ] **Step 1: 실패 테스트**: (a) 수동 작업에 `combobox` 이름 `‘제목’ 상태 변경`, 옵션 4개 라벨; (b) 선택 시 `onMove('t1','review')` 1회; (c) `onMove`가 `{ok:true}`면 `notify` 1회 "‘제목’을 리뷰 중으로 옮겼어요", 부모가 다른 위치에 리마운트해도(`key` 변경 없이 위치 이동 시뮬레이션) `document.activeElement`가 새 DOM의 `[data-status-control="t1"]`; (d) `{ok:false}`면 select 값 복귀·`notify` 0회; (e) `id:'pr-…'` 작업은 `combobox` 없음, 텍스트 "리뷰 중 · GitHub 기준", `showLockNote`면 "이동 불가" 포함; (f) `kind:'pr'`+`sourceUrl` 없음도 PR로 취급; (g) `PrBadge` 텍스트 "리뷰 요청", 링크 속성.
- [ ] **Step 2:** `npx vitest run frontend/src/components/dashboard/TaskStatusControl.test.tsx frontend/src/components/common/PrBadge.test.tsx` → FAIL
- [ ] **Step 3: 구현** 시그니처 그대로. 포커스 복귀는 `useLayoutEffect`로 "방금 옮긴 id" ref를 확인.
- [ ] **Step 4:** 같은 명령 → PASS, `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 작업 상태 컨트롤(PR 읽기 전용 포함)과 리뷰 요청 배지`

### Task 4: `TaskList.tsx` — 제어형 목록(테이블)과 320px 리플로

**Files:**
- Modify: `frontend/src/components/dashboard/TaskList.tsx`(전면 재작성, 파일명 유지)
- Create: `frontend/src/components/dashboard/TaskList.test.tsx`

**Interfaces:**
- Consumes: `TaskStatusControl`, `PrBadge`, `taskLinkTo`, `nextSort`, `displayTitle`, `PRIORITY_LABEL`, `formatDate`, `getInitials/getAvatarColor`.
- Produces: `<TaskList tasks: Task[] sort: { key: TaskSortKey; dir: 'asc'|'desc' } onSortChange: (key: TaskSortKey) => void linkSearch: string onMoveTask: (id: string, s: TaskStatus) => Promise<MutationResult> onDeleteTask: (t: Task) => void />` — **내부 필터·정렬 state 없음**(`tasks`는 이미 필터·정렬된 배열). `<table>` + `<caption class="sr-only">전체 작업 목록</caption>`. 열: 작업(제목 `Link` → `taskLinkTo(id, linkSearch)`, 2줄까지 줄바꿈, `PrBadge`는 PR 작업만) / 출처("리뷰 요청"|"직접") / 상태(`TaskStatusControl`) / 사람("담당 {assigneeId}" 수동 · "작성 {author}" PR · 없으면 `—`) / 우선순위(`PRIORITY_LABEL` 글자) / 생성(`formatDate`) / 삭제 버튼(`aria-label="‘제목’ 삭제"`, 항상 보임). 정렬 가능한 열 머리(작업·상태·우선순위·생성)는 `<button>`을 가진 `<th aria-sort="ascending|descending|none">`. **좁은 폭(<`md`)**: 같은 DOM에서 `tr`을 블록 카드로 접고 각 `td`는 `data-label`을 `::before`로 보여 준다(`role="table|row|cell|columnheader"`를 명시해 표 의미 유지). 이모지·우선순위 색 좌측 굵은 테두리·컬러 그림자·`hover:` 부유 없음. 열 머리 `button`과 행 컨트롤 모두 최소 24px.

- [ ] **Step 1: 실패 테스트**: (a) 제목이 `link`이고 `href`가 `/tasks/t1?view=list&kind=pr`처럼 `linkSearch`를 보존(`MemoryRouter`); (b) PR 행에 `combobox` 없고 "리뷰 중 · GitHub 기준", 수동 행에 있음; (c) 사람 열: 수동 "담당 minji-park", PR+`author` "작성 jaeho-lee", PR `author` 없음 `—`(접근 이름에 "작성자 정보 없음" 대신 `—`가 읽히지 않도록 `aria-label="작성자 정보 없음"`); (d) 정렬 머리 클릭 → `onSortChange('priority')`, `aria-sort`가 `sort` prop과 일치(나머지 `none`); (e) 삭제 버튼 이름 `‘제목’ 삭제`, 클릭 → `onDeleteTask(task)` 1회, `hidden`/`opacity-0` 클래스 없음; (f) 200자 제목 행이 `truncate`/`whitespace-nowrap`/`text-ellipsis` 클래스를 갖지 않음(07 §2.7); (g) 소스 가드: 파일 내용에 `onClick` 있는 `<div|span>`·`🔥`·`\bw-(\d+)\b` 무접두 고정 폭·`animate-` 없음; (h) 빈 `tasks`면 `<tbody>`가 비어도 `caption`·머리는 유지(빈 상태 안내는 Task 6/7이 소유).
- [ ] **Step 2:** `npx vitest run frontend/src/components/dashboard/TaskList.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 03 §6.1의 아바타 3중 복사는 foundation `lib/avatar`를 import.
- [ ] **Step 4:** 같은 명령 → PASS, `npm run lint` PASS
- [ ] **Step 5: 커밋** `refactor: 작업 목록을 제어형 접근 가능한 표로 재작성하고 좁은 폭 리플로 추가`

### Task 5: `TaskBoard.tsx` — 4열 동시 표시 보드

**Files:**
- Modify: `frontend/src/components/dashboard/TaskBoard.tsx`(전면 재작성, 파일명 유지)
- Create: `frontend/src/components/dashboard/TaskBoard.test.tsx`

**Interfaces:**
- Consumes: `TaskStatusControl`, `PrBadge`, `taskLinkTo`, `displayTitle`, `STATUS_ORDER`, `STATUS_LABEL`, `PRIORITY_LABEL`.
- Produces: `<TaskBoard tasks: Task[] linkSearch: string onMoveTask: (id: string, s: TaskStatus) => Promise<MutationResult> onDeleteTask: (t: Task) => void />`. 2단계 포털·열별 설명문·고정 높이 카드·`selectedStatus` props 삭제. 열 4개는 `STATUS_ORDER` 순 `<section aria-labelledby>`에 `h2`("리뷰 중 2") + `<ul>`/`<li>` 카드. 카드: 제목 `Link`(카드 전체로 확장하는 `after:absolute after:inset-0` 패턴, 상태 컨트롤·삭제 버튼은 그 위 `relative z-10`), 사람(목록과 동일 문구), 우선순위 글자, 수동 작업만 `TaskStatusControl`(`showLockNote`로 PR은 "GitHub 기준 · 이동 불가"), 삭제 버튼. 빈 열은 `<li>` 대신 짧은 문구 "작업이 없어요". 그리드: 기본(<`md`) 1열 세로 쌓기, `md:grid-cols-2`, `xl:grid-cols-4`. 열 머리 개수는 필터 적용 후 개수.

- [ ] **Step 1: 실패 테스트**: (a) 작업이 있는 상태에서 `heading` 4개(할 일·진행 중·리뷰 중·완료)가 항상 동시에 존재하고 숫자 포함; (b) 각 열이 `list` 역할이며 카드가 `listitem`; (c) 카드 제목이 `link`(`/tasks/t1?...`), 클릭 가능한 `div` 없음; (d) PR 카드에 `combobox` 없고 "이동 불가" 문구, 수동 카드는 `combobox`; (e) 수동 카드 `onMoveTask` 호출 후 부모가 작업을 다른 열로 옮겨 다시 렌더해도 포커스가 같은 카드의 상태 컨트롤에 있음(Task 3 계약 재확인); (f) 빈 열에 "작업이 없어요"; (g) 소스 가드: `getPriorityStyle|getCategoryStyle|h-\[19\.5rem\]|h-72|border-l-\[|hover:-translate|🔥|desc:` 0건, 고정 폭 무접두 클래스 0건.
- [ ] **Step 2:** `npx vitest run frontend/src/components/dashboard/TaskBoard.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. `adjacentStatus` 이전/다음 버튼은 만들지 않는다(상태 변경 수단은 `<select>` 하나, 결정 19).
- [ ] **Step 4:** 같은 명령 → PASS, `npm run lint` PASS
- [ ] **Step 5: 커밋** `refactor: 칸반을 2단계 포털 없는 4열 보드로 재작성`

### Task 6: 로딩·오류·빈 상태와 포커스 대체 훅

**Files:**
- Create: `frontend/src/components/dashboard/TaskCollectionStates.tsx`, `TaskCollectionStates.test.tsx`, `frontend/src/hooks/useListFocusFallback.ts`, `useListFocusFallback.test.tsx`

**Interfaces:**
- Consumes: `ROUTES`, `Link`.
- Produces:
  - `<TasksLoading />` — `role="status"` "작업을 불러오는 중이에요", 정적 스켈레톤 줄 5개(`aria-hidden`, `animate-*` 없음).
  - `<TasksLoadError onRetry: () => void hasStale: boolean />` — `role="alert"` 제목 "서버에 연결할 수 없어요", 본문 `hasStale ? '아래 목록은 마지막으로 가져온 내용이에요.' : '이 앱의 서버가 꺼져 있거나 네트워크가 끊겼을 수 있어요. 지금은 작업을 보여 드릴 수 없어요.'`, 버튼 "다시 시도". `hasStale`이면 목록 위 배너, 아니면 목록 대신 전체 영역.
  - `<TasksEmptyAll />` — 제목 "아직 작업이 없어요", 본문 "직접 만든 작업은 ‘새 작업’으로 만들어요. 리뷰 요청은 ‘내 리뷰 요청’에서 볼 수 있어요.", 링크 "새 작업"(`ROUTES.newTask`)·"내 리뷰 요청"(`ROUTES.me`)(결정 38: 새 PR은 큐에서만). 문구는 파일 상단 `TASKS_COPY` 상수에 모은다.
  - `<TasksEmptyFiltered activeFilters: { key: string; label: string }[] onClear: () => void />` — 제목 "조건에 맞는 작업이 없어요", 지금 걸린 필터를 목록(`ul`)으로 나열, 버튼 "필터 해제".
  - `useListFocusFallback(headingRef: RefObject<HTMLElement | null>, visibleIds: string[]): void` — 직전 렌더에서 포커스가 목록 영역 안의 어떤 `[data-row-id]`에 있었고 이번 렌더에서 그 id가 `visibleIds`에서 사라져 `document.activeElement===document.body`가 되면 `headingRef.current.focus()`. 사용자가 입력창에 있거나 다른 곳에 포커스가 있으면 건드리지 않음.

- [ ] **Step 1: 실패 테스트**: (a) `TasksLoading`에 `role="status"`와 `animate-` 클래스 없음; (b) `TasksLoadError hasStale=false`가 `role="alert"` 단일, "다시 시도" 클릭 → `onRetry` 1회, 같은 props로 3회 리렌더해도 `alert` 1개; `hasStale=true` 문구 분기; (c) `TasksEmptyAll`의 링크 `href`가 각각 `/tasks/new`, `/me`이고 본문에 "레포를 연결하면" 문구 없음; (d) `TasksEmptyFiltered`가 라벨 3개를 목록으로 나열하고 "필터 해제" 호출; (e) 소스에 "문제가 발생"·"잘못된" 문자열 없음; (f) `useListFocusFallback`: 포커스된 행이 `visibleIds`에서 빠지면 제목으로 포커스, 포커스가 검색 입력에 있으면 불변, 행이 그대로면 불변.
- [ ] **Step 2:** `npx vitest run frontend/src/components/dashboard/TaskCollectionStates.test.tsx frontend/src/hooks/useListFocusFallback.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 시그니처.
- [ ] **Step 4:** 같은 명령 → PASS, `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 전체 작업 로딩·오류·빈 상태와 포커스 대체 훅`

### Task 7: `TasksScreen` 조립(필터 유지 링크, 상태 분기, 삭제 되돌리기)

**Files:**
- Modify: `frontend/src/screens/TasksScreen.tsx`, `frontend/src/screens/TasksScreen.test.tsx`(foundation Task 11의 (c)항 삭제·나머지 유지·아래 항목 추가)

**Interfaces:**
- Consumes: Task 1~6 전부, `useTasksContext()`(`tasks`, `loadState`, `refresh`, `moveTask`, `deleteTask`), `useUndo().schedule`, `useMyLogin`, `<Outlet />`(foundation Task 13의 `/tasks/:id`·`/tasks/new` 자식 라우트).
- Produces: `TasksScreen()`(기본 export, 이름·라우트 불변). 구조: `h1` "전체 작업" + `Link` "새 작업"(→`ROUTES.newTask`, 보조 버튼 스타일, 쿼리 보존 불필요) → `TaskFilterBar` → 상태 분기 → 목록 또는 보드 → `<Outlet />`. 상태 분기: `loadState==='loading'&&tasks.length===0`→`TasksLoading`; `loadState==='error'&&tasks.length===0`→`TasksLoadError(hasStale=false)`; `loadState==='error'`+작업 있음→배너 `hasStale`+목록; `tasks.length===0`→`TasksEmptyAll`; 필터 후 0개→`TasksEmptyFiltered`. 파이프라인: `hiddenIds`(undo로 숨긴 id 집합) 제외 → `applyTaskFilter` → (상태 칩 카운트는 상태를 제외한 필터를 적용한 집합으로 `countByStatus`) → `sortTasks`. `onDeleteTask(t)` = `schedule({ label: "‘{displayTitle}’ 작업을 삭제했어요", hide: add id, restore: remove id, commit: () => deleteTask(t.id) })` — foundation Task 11의 폴링 재유입 방지(숨김 집합이 창 동안 유지) 그대로. 헤딩 `h2`(`tabIndex=-1`, 화면 낭독 전용 "작업 목록")를 `useListFocusFallback`에 연결하고 행에는 `data-row-id`.

- [ ] **Step 1: 실패 테스트**(`TasksContext` 모킹, `MemoryRouter`): (a) 기본 진입 `/tasks`가 목록, `h1` 하나, 목록 `caption` 존재; (b) `/tasks?view=board&kind=pr&status=zzz`가 예외 없이 보드·PR만, 칩 그룹 없음; (c) 필터 선택(출처=리뷰 요청) 후 행 링크를 눌러 `/tasks/t1?kind=pr`로 이동해도 목록이 그대로 마운트되어 같은 필터가 유지되고, 상세를 닫으면(`navigate(-1)`) 같은 URL로 복귀; (d) 담당자 선택지가 `assigneeOptions`와 일치하고 로그인 미설정이면 "나" 없음, `useMyLogin().save('minji-park')` 후 "나" 선택 시 `assigneeId` 또는 `author`가 같은 작업만; (e) `loadState:'error'`+빈 `tasks`에서 "서버에 연결할 수 없어요"이고 "아직 작업이 없어요"는 없음, "다시 시도"가 `refresh` 호출; (f) `loadState:'loading'`에서 `status` 안내, 빈 상태 문구 없음; (g) 작업 0개+`ready` → 빈 상태(전체), 필터 결과 0 → 필터 나열+"필터 해제"로 복구; (h) 삭제 → 즉시 사라짐·"되돌리기" 노출·복귀, 10초(`vi.useFakeTimers`) 뒤 `deleteTask` 1회, 그 사이 `tasks`가 같은 작업을 다시 내려줘도 숨김 유지(foundation 계약 회귀); (i) 상태 `select` 변경 실패(`moveTask` → `{ok:false}`)에서 값 복귀·행 이동 없음; (j) 포커스된 행이 `tasks` 갱신으로 사라지면 `h2`로 포커스; (k) 보기 전환이 `view=board`를 URL에 쓰고 `status`를 지움, 되돌리면 칩 복귀; (l) 목록의 200건 작업 렌더가 `act` 안에서 완료(성능 가드: 단순 렌더 1회 < 2초).
- [ ] **Step 2:** `npx vitest run frontend/src/screens/TasksScreen.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 새 훅 만들지 않고 화면 안 `useMemo` 체인으로 조립.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run build` PASS
- [ ] **Step 5: 커밋** `feat: 전체 작업 화면 통합(필터 유지, 상태 분기, 되돌리기 삭제)`

### Task 8: 가드·320px 실측·문서 반영

**Files:**
- Create: `frontend/src/screens/tasksLayout.guard.test.ts`
- Modify: `CLAUDE.md`(Frontend structure 절의 `TaskBoard/TaskList` 설명 한 줄), `docs/DECISIONS.md`(2026-11-24 항목 **추가**, 기존 항목 덮어쓰기 금지)

**Interfaces:** Consumes: 앞 모든 태스크. Produces: 없음.

- [ ] **Step 1: 실패 테스트(가드)** `tasksLayout.guard.test.ts`가 `TasksScreen.tsx`, `components/dashboard/{TaskList,TaskBoard,TaskFilterBar,TaskStatusControl,TaskCollectionStates}.tsx`, `PrBadge.tsx`를 읽어 단언: (a) `\b(w|min-w|max-w)-(\[?\d)` 중 접두사(`md:|lg:|xl:`) 없는 고정 폭 0건; (b) `/<(div|span)\b[^>]*\sonClick=/` 0건; (c) `animate-(pulse|ping|bounce)`, `🔥`, `🎉`, `slate-\d`, `blue-\d`, `#[0-9a-fA-F]{3,8}` 0건; (d) `text-\[(9|10|10\.5|11)px\]` 0건; (e) 금지 용어 `칸반|모든 작업|작업 대장|검토 중|Accept|업무` 0건(주석 제외); (f) `outline-none`은 같은 `className` 안에 `focus-visible:` 또는 `ring-` 동반.
- [ ] **Step 2:** `npx vitest run frontend/src/screens/tasksLayout.guard.test.ts` → FAIL이면 위반 파일 수정(없으면 이 단계는 PASS로 시작해도 되며, 그 경우 Task 4·5 가드와 중복이므로 이 파일은 합쳐도 된다)
- [ ] **Step 3: 실측** 백엔드 켠 상태(`docker compose up --build`)에서 `npm run dev` 후 브라우저 자동화로 `http://127.0.0.1:3000/tasks`를 열어 뷰포트 320×640으로 `document.documentElement.scrollWidth <= 320`을 `/tasks`, `/tasks?view=board`, `/tasks/<실제 id>` 세 곳에서 확인(`evaluate_script`). 백엔드를 끄고 새로고침해 "서버에 연결할 수 없어요" 화면 확인. 키보드만으로 검색→출처 선택→행 열기→`Esc`→상태 변경 완료(07 §5 #21·23). 200%·400% 확대에서 잘림 없음.
- [ ] **Step 4: 최종** `npm run lint`, `npm test`, `npm run build` PASS. `CLAUDE.md`·`docs/DECISIONS.md`에 "전체 작업 = 필터 순수 모듈 + 제어형 목록/보드, 포털 폐기, PR 수동 이동 제거" 반영.
- [ ] **Step 5: 커밋** `test: 전체 작업 레이아웃 가드와 문서 갱신`

---

## 07 §5 체크리스트 → 태스크 매핑 (이 화면)

| 07 §5 | 내용 | 담당 |
|---|---|---|
| 13 | 낙관적 갱신 실패 롤백 + 알림(`console.error` 단독 0건) | Task 3·7(i) (롤백 자체는 foundation `useTasks`) |
| 18 | 포커스된 행이 사라질 때 포커스가 `body`가 아님 | Task 6·7(j) |
| 22·23·30·33 | 클릭 `div` 0, 드래그 없이 상태 이동, 아이콘 `aria-label`, 호버 전용 0 | Task 3·4·5·8 |
| 29 | 라벨 연결 | Task 2 |
| 34·36·41 | 12px 미만·색 단독 신호 0, 24px 타깃 | Task 8(d), Task 3~5의 글자 병기 |
| 40 | 320px 가로 스크롤 없음 | Task 4·5·8 실측 |
| 42 | `role="status"` 변화 시에만, 같은 오류 1회 | Task 2(j)·6(b) |
| 45 | 제목 말줄임으로 정보 소실 없음 | Task 4(f) |
| 46 | 금지 용어 0 | Task 8(e) |
| 49 | 오류·빈 상태 3요소 해요체 | Task 6 |

이 계획이 다루지 않는 항목: 큐·영역 관련(1~11·14·15·17 등), 색 대비 실측(35, Impeccable 토큰 확정 후), 상세 패널 내부(foundation Task 13~15 소유).

## Self-Review

- 스펙 커버리지: 목록/보드 통합·기본 목록(Task 1·2·4·5·7), 버튼/select 방식·드래그 금지·PR 이동 제거(Task 3·5), 수동·AI 체크리스트·역할 검토 보조 유지(foundation Task 13~15의 접힘 영역을 그대로 사용, 목록 행에서 상세 링크 유지 Task 7(c)), 모달 유지(Outlet), 10초 되돌리기(Task 7(h)), 필터·검색·담당자 문자열(Task 1·2), 용어(Global Constraints, Task 8(e)), 빈·오류 상태(Task 6·7), 320px(Task 4·5·8), 07 체크리스트(매핑표).
- 타입 일관성: `TaskViewState/Filter`, `TaskSortKey`(Task 1)를 Task 2·4·7이 같은 이름으로 소비. `onMoveTask: (id, s) => Promise<MutationResult>`는 Task 3·4·5·7에서 동일. `linkSearch`는 `useTaskView().search`(Task 2)를 Task 7이 목록·보드에 전달.
- 비례: 시그니처·단언 중심, 구현 본문 없음.

## 인터페이스 충돌·누락 (구현 전에 확인할 것)

1. ~~foundation `isPrTask`(`sourceUrl` 기준) vs 계약 `kind`~~ **해결(조정 로그 2026-11-24)**: foundation T4가 `kind`(없으면 id 접두사) 기준 `isPrTask(Pick<Task,'id'|'kind'>)`로 바뀌었고 테스트도 맞췄다.
2. ~~PR 작업의 작성자 필드가 계약에 없다~~ **해결**: api-contract §6·backend Task 11에 `Task.author`(PR=작성자 로그인, 수동=`null`)가 추가됐다(결정 33). 이 화면은 그 값을 소비한다.
3. **영역 열·영역 필터는 만들지 않는다(결정 38 확정).** Task API에 `areaId`를 추가하지 않는다. 06 프레임 10과 영역 흐름의 "대기 N건 → 영역 필터 도착지" 링크는 성립하지 않으며 screen-area-flow가 이 링크를 만들지 않는다(그 계획이 상세 화면 링크로 대체함).
4. **foundation Task 13의 `TaskDetailDialog`** 가 삭제 후 `/tasks`로 이동하면 목록 필터가 사라진다(닫기=`navigate(-1)`은 유지됨). 이 계획은 건드리지 않았다.
5. ~~foundation `Dialog`(수동 구현)·BrowserRouter와 결정 27·28의 불일치~~ **해결**: foundation이 HashRouter·네이티브 `<dialog>`로 수정됐다. 이 계획은 영향받지 않는다.

## 사용자 결정이 필요한 질문

모두 확정됨(결정 38): ① 새 PR은 "내 리뷰 요청"에서만 보이고 기존 PR Task는 유지한다 ② `Task.author`는 추가됐고 `areaId`는 추가하지 않는다(영역 열·필터 제외) ③ 필터 라벨은 "출처". 남은 미결 질문 없음. 알려진 부작용: 백엔드 Task 13(미러 중단) 이후 기존 PR Task는 GitHub 상태를 더 따라가지 않아 낡을 수 있다(실행 개요 위험 목록).

## 태스크 의존 그래프

```
foundation T1~T13 머지(필수 전제)
        │
        ├─ T1(lib/taskView, 타입, isPrTask) ─┬─ T2(useTaskView, FilterBar) ─┐
        │                                    ├─ T4(TaskList) ◄─ T3         │
        │                                    └─ T5(TaskBoard) ◄─ T3        │
        ├─ T3(TaskStatusControl, PrBadge) ── T1 이후 (isPrTask 소비)       │
        └─ T6(상태 컴포넌트, 포커스 훅) ── 독립(foundation만 필요)         │
                                                                           ▼
                              T2, T4, T5, T6 모두 ─────────────────→ T7(TasksScreen 조립) → T8(가드·실측·문서)
```

**병렬 가능 묶음:** 묶음 A: T1 단독 / 묶음 B(T1 후): T2, T3, T6 병렬(파일 겹침 없음; T6은 T1 없이도 시작 가능) / 묶음 C(T3 후): T4, T5 병렬(서로 다른 파일) / 묶음 D: T7 단독 / 묶음 E: T8 단독.
