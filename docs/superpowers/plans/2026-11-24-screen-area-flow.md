# 영역 흐름 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/areas`(개요), `/areas/:areaId`(상세)를 새 영역 API 위에 만든다. 영역당 한 행인 작은 다중 차트 표, "리뷰 대기 중, 활동 없음" 라벨, 결합 그래프 → 순위 목록, 걸친 PR 표시, 텍스트 대안, 키보드·로딩·오류·0개·잘림·연결 끊김 상태를 포함한다.

**Architecture:** 차트는 **순수 SVG 컴포넌트 하나**(`WeeklyBars`)로 만든다. 기하(칸 수, 이번 주 판정, 대체 텍스트)는 `lib/areaChart.ts`의 순수 함수로 분리해 jsdom에서 숫자로 검증한다. 서버 상태는 `services/areasApi.ts` + 훅 3개(`useAreaRepos/useAreas/useAreaDetail`)가 소유하고, 화면은 URL(`?repo=&days=&sort=`)이 단일 진실이다. 기존 `ArchitectureView`와 `architecture/*`는 URL 기반 구 API용이라 대체하며 마지막 태스크에서 삭제한다.

**Tech Stack:** React 19, TypeScript 5.8, react-router v7(foundation), Tailwind 4 토큰 유틸리티, Vitest + testing-library(foundation Task 1). 새 의존성 없음.

**Spec:** `docs/ux/00-context.md`(확정 결정 1~40, 특히 32·37), `docs/ux/04-information-architecture.md`, `docs/ux/05-user-journeys.md`(J3 §3, J4 §4), `docs/ux/06-wireframes.md`(§4 영역 흐름 개요, §5 영역 상세), `docs/ux/07-fortify-include-review.md`(§2.4, §5 #16·36~40·46), `docs/ux/wireframes/index.html`(프레임 7·8·9, id `scr-areas`/`scr-area-detail`/`scr-areas-empty`). 소비하는 계약: `docs/superpowers/plans/2026-11-24-api-contract.md` §4.1·§4.2·§5(GET)(§4.3 PR 단건 매핑은 소비하지 않는다). 소비하는 기반: `docs/superpowers/plans/2026-11-24-frontend-foundation.md`(Task 1 `renderWithRouter`, Task 4 `lib/date.formatDate`, Task 10 `ROUTES`·`AreasScreen`/`AreaDetailScreen` 스텁, Task 3 토큰).

## 차트 기술 선택: 순수 SVG (recharts 아님)

- 이 화면의 마크는 막대 5~13개 × 영역 7~20행이다. recharts는 `ResponsiveContainer`가 부모 크기를 측정해야 하는데 jsdom에서는 0×0이라 **눈금·속 빈 막대·점선을 단위 테스트로 검증할 수 없다**. 행마다 인스턴스 20개를 만드는 비용도 크다.
- 필요한 마크(속 빈 막대, 바닥선만 있는 0, 점선 자리표시, 모든 행이 같은 눈금)는 `<rect>`/`<line>` 몇 개이고 recharts의 축·툴팁·범례 기능은 하나도 쓰지 않는다. 툴팁은 호버 전용이라 07 §2.4(툴팁 의존 금지)와도 충돌한다.
- 접근성: SVG 한 개가 `role="img"` + 짧은 `aria-label`을 갖고, 숫자는 같은 행의 텍스트와 "표로 보기"에도 있다. recharts의 내부 SVG 접근성은 통제하기 어렵다.
- 결과: 이 화면은 recharts를 쓰지 않으며, foundation Task 5 이후 `WeeklyChart`가 마지막 사용처였으므로 Task 7에서 의존성을 제거한다(결정 37로 확정, 다른 사용처 없음).

## Global Constraints

- 수정 범위는 `frontend/`, `package.json`(Task 7의 recharts 제거만), 이 문서. **`backend/` 금지.** 새 의존성 금지, 외부 CDN·웹폰트 금지(결정 20).
- 라우트·내비 라벨은 foundation 그대로: `ROUTES.areas`=`/areas`, `ROUTES.area(id)`=`/areas/${encodeURIComponent(id)}`, 라벨 **영역 흐름**. `ROUTES`를 재정의하지 않는다. 레포·기간·정렬은 쿼리(`?repo=<id>&days=30&sort=recent`)로 싣는다(영역 id는 레포 안에서만 유일, 계약 §4).
- 영역 이름은 `displayName`(별칭 있으면 별칭) 위에, 아래 줄에 원래 경로 `pathPrefix`(06 §4.2). 별칭 `status:"disconnected"`는 텍스트 라벨 **연결 끊김**(결정 7).
- 막대 높이 = 주간 커밋. **1칸 = 커밋 2개, 최대 8칸(16개), 모든 영역 같은 눈금**, 16 초과는 최대 칸에서 자름. 왼쪽 = 가장 오래된 주, 오른쪽 = 이번 주. 이번 주는 **속이 빈 막대**, 0은 막대 없이 **바닥선만**, 데이터 없음은 **점선 짧은 막대**(06 §4.2). 영역마다 다른 색 금지(영역 식별은 이름, 03 §2.1). 색·두께 등 시각 값은 토큰 이름(`--text`, `--text-muted`, `--border`, `--border-strong`, `--accent`, `--warning`, `--focus-ring`)만 참조하고 임시 값을 새로 만들지 않는다.
- 라벨(확정): 추세 **활발해짐 / 꾸준함 / 활동 적음**(결정 16: "조용함" 사용 금지), 정체 신호 **리뷰 대기 중, 활동 없음**(결정 23, 규칙: `trend==='quiet'` 그리고 `reviewWaiting.prCount>=1`), 경과는 "최장 N일". "진행률"·"완료"·"정체 후보" 문구 금지(05 §3.1, 07 #16). 해요체, 오류·빈 상태는 "무슨 일 / 영향 / 지금 할 일"(07 §3.2).
- 한 PR은 **주 영역 한 곳에만** 개수에 센다(결정 32, 계약 §4.1 `reviewWaiting`). 상세에서는 PR이 걸친 영역을 모두 보여 주고 "개수는 주 영역에만 세요"를 한 줄 알린다.
- 신선도는 응답의 `generatedAt`(분석 시각)만 쓴다. 동기화 상태 줄(`SyncStatusLine`)은 이 화면에 두지 않는다(결정 24).
- 새 코드: `<div onClick>` 금지, 아이콘 전용 버튼 `aria-label`, 호버 전용 정보 금지(정보는 항상 텍스트로도 존재), 상호작용 요소 24×24px 이상, `outline-none`은 `--focus-ring` 대체와 함께만, `animate-pulse|ping|bounce` 금지(로딩 스켈레톤은 정적), 320px에서 가로 스크롤 없음, 12px 미만 글자 금지.
- 조작은 URL이 단일 진실: 새로고침·뒤로가기로 레포·기간·정렬이 유지된다. localStorage는 쓰지 않는다.
- GET은 브라우저 HTTP 캐시가 `ETag`/304를 처리한다(계약 공통 규칙). 클라이언트에서 ETag를 직접 다루지 않는다.
- 커밋 메시지는 한국어 `type: 요약` + 시스템이 지정한 Co-Authored-By 줄.

## Review Focus

1. **0과 모름과 끊김 구분**: 모든 주가 0인 영역은 바닥선만 있고 "최근 N일 활동 없음"(문구에 "완료" 없음). 연결 끊긴 별칭은 점선 + "연결 끊김" 라벨이며 0 막대로 그려지지 않는다. (Task 2, 3, 5)
2. **이번 주 판정과 눈금 경계**: `weekly` 마지막 항목이 실제로 현재 주가 아닐 때(캐시된 오래된 응답, `weekly`가 비었거나 1개) 속 빈 막대를 잘못 붙이지 않는다. 커밋 17+·음수·`NaN`은 8칸에서 잘리고 숫자 라벨은 실제 값 그대로. (Task 2, 3)
3. **잘못된 진입 경로**: `?repo=`가 없거나 연결 해제된 id·숫자 아님, `/areas/한글%20이름`, 사라진 영역 id, 연결된 레포 0개에서 예외 없이 안내와 복귀 링크가 나온다. (Task 4, 5, 6)
4. **실패와 경합**: 분석 실패 시 직전 결과는 유지하고 "직전 결과예요"를 밝히며, 레포·기간을 빠르게 바꿔도 늦게 온 이전 응답이 새 화면을 덮지 않는다. 분석 502("읽을 수 없음")와 정상 0개 영역과 활동 0이 서로 다른 화면이다. `refresh` 연타는 요청 1회. (Task 4, 5)
5. **규모와 좁은 폭**: 영역 20개+, 별칭 80자, 90·180일(막대 13·26개)에서 가로 스크롤 없이 읽히고 키보드로 모든 행·링크에 닿는다. 상세의 대기 PR 수와 개요의 수가 다를 수 있는 이유(주 영역 집계)가 화면에 쓰여 있다. (Task 3, 5, 6)

---

### Task 1: 타입과 영역 API 클라이언트

**Files:**
- Create: `frontend/src/types/areas.ts`, `frontend/src/services/areasApi.ts`, `frontend/src/services/areasApi.test.ts`

**Interfaces:**
- Consumes: 계약 §4.1~4.3, §5(GET만). 기존 `ArchGroupKind`(`types/index.ts`)를 import. `types/index.ts`는 수정하지 않는다(다른 화면 계획과 충돌 방지). `AreaAlias`는 이 파일이 소유하고 screen-settings T6이 import한다(설정이 먼저 실행되면 그쪽이 같은 형태로 만든 것을 재사용). 테스트 `fetch` 라우팅은 screen-settings T2의 `test/routeFetch.ts`를 재사용할 수 있고, 단순 `vi.stubGlobal('fetch')`도 허용.
- Produces (`types/areas.ts`, 필드명은 계약의 JSON 그대로): `AreaTrend = 'rising'|'steady'|'quiet'`, `AreaWeek { weekStart: string; commits: number; filesChanged: number }`, `Area { id; name; displayName; alias: { id: number; displayName: string; updatedAt: string } | null; pathPrefix; kind: ArchGroupKind; fileCount; samplePaths: string[]; weekly: AreaWeek[]; totalCommits; lastChangeAt: string | null; authors: string[]; trend: AreaTrend; reviewWaiting: { prCount: number; oldestRequestedAt: string | null } }`, `AreasResponse { repoId; generatedAt; days; truncated: boolean; analyzedCommits: number; areas: Area[]; couplings: { a: string; b: string; count: number }[] }`, `WaitingPr { repo; number; title; url; author; isDraft; requestedReviewers: string[]; oldestRequestedAt: string; size: { additions; deletions; changedFiles }; primaryAreaId: string; isPrimary: boolean; touchedAreas: { areaId: string; displayName: string; fileCount: number }[]; unmapped: number; filesTruncated: boolean }`(계약 §4.2 그대로, 결정 37), `AreaDetail extends Area { recentCommits: { sha7; message; author; date }[]; waitingPullRequests: WaitingPr[]; coupledWith: { areaId: string; count: number }[] }`, `AreaAlias { id; repoId; pathPrefix; displayName; status: 'connected'|'disconnected'|'unknown'; createdAt; updatedAt }`.
- Produces (`services/areasApi.ts`): `class AreasApiError extends Error { status: number; code: string | null }`(네트워크 실패는 `status 0`, `code 'network'`; `AbortError`는 그대로 던짐), `fetchAreas(repoId: number, days: number, opts?: { refresh?: boolean; signal?: AbortSignal }): Promise<AreasResponse>`, `fetchAreaDetail(repoId: number, areaId: string, days: number, signal?: AbortSignal): Promise<AreaDetail>`, `fetchAreaAliases(repoId: number, signal?: AbortSignal): Promise<AreaAlias[]>`. **영역 API 클라이언트의 단일 소유자는 이 파일이다**: screen-review-queue(빈 큐 영역 요약)는 `fetchAreas`를, screen-settings(영역 이름)는 `fetchAreas`·`fetchAreaAliases`를 import한다(각자 같은 엔드포인트 클라이언트를 따로 만들지 않는다). 별칭 쓰기(POST/PATCH/DELETE)는 설정 화면 계획이 소유하므로 만들지 않는다. §4.3 `fetchPrAreas`는 만들지 않는다.

- [ ] **Step 1: 실패 테스트** `areasApi.test.ts`(`fetch`를 `vi.stubGlobal`): (a) `fetchAreas(1, 30)`이 `/api/v1/integrations/watched-repos/1/areas/?days=30`을 호출, `refresh:true`면 `&refresh=1`; (b) `fetchAreaDetail(1, '한글 영역/x', 30)`의 경로에 `encodeURIComponent` 적용(`%ED%95%9C...`, `%2F`); (c) `fetchAreaDetail` 응답의 `waitingPullRequests[].touchedAreas`·`isPrimary`가 타입대로 통과; 502 `{error:'사유', code:'github_unavailable'}` → `AreasApiError`(`status 502`, `code 'github_unavailable'`, `message '사유'`); (d) 404 `area_not_found`·`repo_not_found`의 `code` 보존; (e) 본문이 JSON이 아닌 500 → `message`가 `요청 실패 (500)`, `code null`; (f) `fetch` reject → `status 0`, `code 'network'`; (g) `AbortController.abort()` → `name === 'AbortError'`로 reject(래핑 금지); (h) `fetchAreaAliases` 200 배열 반환.
- [ ] **Step 2:** `npx vitest run frontend/src/services/areasApi.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** 위 시그니처. 공통 `get<T>(url, signal)` 한 개를 안에서만 쓴다(`architectureApi.ts`의 오류 파싱 방식과 동일, `code` 추가).
- [ ] **Step 4:** `npx vitest run frontend/src/services/areasApi.test.ts`, `npm run lint` → PASS
- [ ] **Step 5: 커밋** `feat: 영역 흐름 API 클라이언트와 타입 추가`

### Task 2: 차트·표시 순수 로직과 URL 파라미터 (`lib/`)

**Files:**
- Create: `frontend/src/lib/areaChart.ts`, `frontend/src/lib/areaChart.test.ts`, `frontend/src/lib/areaRoute.ts`, `frontend/src/lib/areaRoute.test.ts`

**Interfaces:**
- Consumes: Task 1 타입, foundation의 `ROUTES`(`routes.tsx`).
- Produces (`lib/areaChart.ts`):
  - `BAR_STEP = 2`, `BAR_MAX_CELLS = 8`
  - `barCells(commits: number): number` — 0·음수·`NaN`→0, 1~2→1, 3~4→2, … `Math.min(8, Math.ceil(commits/2))`(0과 1을 눈으로 구분하기 위해 올림)
  - `isClipped(commits: number): boolean` — `commits > BAR_STEP * BAR_MAX_CELLS`
  - `currentWeekIndex(weekly: AreaWeek[], generatedAt: string): number` — 마지막 항목의 `weekStart`(UTC 월요일) ≤ `generatedAt` < `weekStart + 7일`이면 `weekly.length - 1`, 아니면 `-1`
  - `describeWeekly(weekly: AreaWeek[], currentIdx: number, days: number): string` — 예 `5주 커밋: 4, 6, 10, 14, 16개(마지막은 진행 중인 주)`, 전부 0이면 `최근 30일 활동 없음`, 빈 배열이면 `주간 데이터 없음`
  - `trendLabel(t: AreaTrend): string`(활발해짐/꾸준함/활동 적음), `TREND_GLYPH: Record<AreaTrend, string>`(▲ ■ ▼, 장식용이며 글자가 1차 정보)
  - `isReviewWaitingNoActivity(a: Pick<Area, 'trend' | 'reviewWaiting'>): boolean`
  - `sortAreas(areas: Area[], key: 'recent' | 'waiting' | 'name'): Area[]` — 새 배열, 안정 정렬. `recent`=`lastChangeAt` 내림차순(null 마지막), `waiting`=`prCount` 내림차순 후 `oldestRequestedAt` 오름차순, `name`=`displayName` `localeCompare('ko')`. 정체 신호 행을 위로 끌어올리는 정렬은 만들지 않는다(06 §4.3).
  - `relativeDay(iso: string | null, now: Date, days?: number): string` — `오늘`/`어제`/`N일 전`, 미래 시각은 `오늘`, `days` 초과면 `41일 전 (30일 밖)`, null이면 `변경 기록 없음`
  - `waitingDays(iso: string, now: Date): number`(≥0), `waitLabel(days: number): string`(0→`최장 1일 미만`, 7+→`최장 7일+`, 그 외 `최장 N일`), `waitBarCells(days: number): number`(1칸=1일, 1~7)
  - `summarizeAreas(areas: Area[], days: number, analyzedCommits: number, now: Date): string` — 07 §2.4의 요약 문단(`최근 30일, 분석한 커밋 41개. 영역 7개. 활발해짐 2, 꾸준함 3, 활동 적음 2. 리뷰 대기가 있는 영역 3개, 최장 5일(백엔드 API).`). 영역 0개면 `영역 0개`로 끝낸다.
  - `miscShare(areas: Area[], a: Area): number | null` — `a.pathPrefix === '@misc'`일 때 `fileCount` 비중(0~1), 아니면 null. 경고 임계 `MISC_WARN_SHARE = 0.3`(임시값, 06 예시 38%에서 역산한 추정)
  - `disconnectedAliases(aliases: AreaAlias[], areas: Area[]): AreaAlias[]` — 서버가 `disconnected`라 했고 `areas` 중 같은 `pathPrefix`가 없는 것만(클라이언트 이중 확인)
- Produces (`lib/areaRoute.ts`): `AREA_DAY_OPTIONS = [30, 60, 90, 180] as const`, `type AreaSort = 'recent' | 'waiting' | 'name'`, `parseAreaParams(sp: URLSearchParams): { repoId: number | null; days: 30 | 60 | 90 | 180; sort: AreaSort }`(잘못된 값은 기본 `null`/30/`recent`), `areasHref(p: { repoId: number; days?: number; sort?: AreaSort }): string`, `areaHref(areaId: string, p: { repoId: number; days?: number }): string`(`ROUTES.area(areaId)` + 쿼리, `days`가 30이면 생략).

- [ ] **Step 1: 실패 테스트**(고정 `now`/`generatedAt` 사용): `barCells(0)=0`, `(1)=1`, `(2)=1`, `(3)=2`, `(16)=8`, `(17)=8`, `(40)=8`, `(-3)=0`, `(NaN)=0`; `isClipped(16)=false`, `(17)=true`; `currentWeekIndex`: `generatedAt` `2026-11-24`(화)에 마지막 `weekStart '2026-11-23'`→`len-1`, 마지막이 `'2026-11-09'`→`-1`, 빈 배열→`-1`; `describeWeekly`가 위 세 문장 정확히 일치(숫자는 17+도 실제 값); `isReviewWaitingNoActivity`: `quiet`+1건 true, `quiet`+0건 false, `rising`+3건 false; `sortAreas('recent')`에서 null 마지막·원본 불변, `'waiting'` 동률 처리; `relativeDay(어제)`=`어제`, 41일 전/`days 30`=`41일 전 (30일 밖)`, 미래→`오늘`; `waitLabel(0|4|9)`; `summarizeAreas`가 "진행률"·"완료"를 포함하지 않고 영역 0개에서 예외 없음; `miscShare`; `disconnectedAliases`가 서버 `connected`인 항목과 현재 영역과 일치하는 `disconnected` 항목을 제외. `areaRoute.test.ts`: `parseAreaParams('?repo=abc&days=45&sort=x')`→`{null,30,'recent'}`, `?repo=2&days=90&sort=waiting` 정상; `areaHref('한글 영역', {repoId:1})`가 `/areas/%ED%95%9C...?repo=1`.
- [ ] **Step 2:** `npx vitest run frontend/src/lib/areaChart.test.ts frontend/src/lib/areaRoute.test.ts` → FAIL
- [ ] **Step 3: 구현** 위 시그니처. 날짜 계산은 UTC 기준 `Date.parse`, 외부 라이브러리 없음. `foundation lib/date.formatDate`는 절대 날짜(툴팁이 아니라 상세의 텍스트) 용도로만 재사용하고 여기서 재정의하지 않는다.
- [ ] **Step 4:** 같은 명령 → PASS, `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 영역 막대 눈금·텍스트 대안·정렬 로직과 URL 파라미터 추가`

### Task 3: `WeeklyBars` 순수 SVG 막대

**Files:**
- Create: `frontend/src/components/areas/WeeklyBars.tsx`, `frontend/src/components/areas/WeeklyBars.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `barCells`, `isClipped`, `currentWeekIndex`, `describeWeekly`, `BAR_MAX_CELLS`.
- Produces: `<WeeklyBars weekly: AreaWeek[] generatedAt: string days: number variant?: 'row' | 'detail' state?: 'data' | 'unknown' weekCount?: number />`.
  - `state='data'`: 막대 `<rect>` 열 + 항상 그려지는 바닥선 `<line>`. 이번 주 막대는 `fill="none"`+`stroke`(속 빈 막대), 나머지는 `fill`. 0이면 `<rect>` 없음(바닥선만). 잘린 막대는 윗부분에 짧은 가로 표식 `<line data-clipped>`(색이 아닌 모양).
  - `state='unknown'`: `weekCount`개의 점선 짧은 막대(`stroke-dasharray`, 높이 2칸), 바닥선 없음.
  - 바깥 `<svg role="img" aria-label={…}>`: data는 `describeWeekly(...)`, unknown은 `데이터 없음`. 모든 `<rect>`는 `aria-hidden`. 칸 높이·막대 폭·간격은 파일 상단 상수 하나로 두고 모든 행이 같은 `viewBox` 높이를 쓴다. 막대 개수가 13·26이어도 같은 막대 폭을 유지해 SVG가 가로로 늘어난다(좁은 화면에서 래퍼가 `overflow` 없이 줄바꿈되는 것은 Task 5가 보장).
  - `variant='detail'`: 막대 위에 값 텍스트(`<text>`가 아니라 SVG 밖 DOM `<span>`으로, 막대와 같은 열), 아래에 주 시작일 `M/D`. 숫자는 항상 DOM 텍스트이고 툴팁 없음.
  - 색은 `var(--text-muted)`(채움), `var(--accent)`(이번 주 윤곽)처럼 토큰만 `fill`/`stroke`에 넣는다.

- [ ] **Step 1: 실패 테스트**: (a) `[4,6,10,14,16]` + 마지막이 현재 주 → `rect` 5개, 높이가 `barCells*cell`(2,3,5,7,8칸)과 일치하고 모든 행에서 같은 칸 높이, 마지막 `rect`만 `fill="none"`; (b) 전부 0 → `rect` 0개·바닥선 1개·`aria-label="최근 30일 활동 없음"`; (c) 값 `[0,2,0,0,0]`에서 0인 주는 `rect` 없음·2인 주는 1칸; (d) 마지막 주가 현재 주가 아닌 응답(`generatedAt`이 3주 뒤) → 속 빈 막대 없음, `aria-label`에 "진행 중" 없음; (e) 커밋 40 → 높이 8칸으로 잘리고 `data-clipped` 표식 1개, `aria-label`에는 `40`; (f) `state="unknown" weekCount={5}` → 점선 막대 5개(`stroke-dasharray` 있음)·`aria-label="데이터 없음"`·바닥선 없음; (g) `weekly=[]` → 예외 없이 `주간 데이터 없음`; (h) `variant="detail"`에서 값 `16`과 `11/17` 형식의 주 시작일이 DOM 텍스트로 존재; (i) 13주·26주 입력에서 `rect` 개수와 `viewBox` 폭이 막대 수에 비례; (j) 렌더된 마크업에 `hsl(`·`#` 색 리터럴이 없음(토큰만).
- [ ] **Step 2:** `npx vitest run frontend/src/components/areas/WeeklyBars.test.tsx` → FAIL
- [ ] **Step 3: 구현** 시그니처 그대로. 상호작용·호버 상태 없음(정적 마크).
- [ ] **Step 4:** 같은 명령, `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 순수 SVG 주간 막대(같은 눈금·속 빈 이번 주·점선) 추가`

### Task 4: 데이터 훅 (`useAreaRepos`, `useAreas`, `useAreaDetail`)

**Files:**
- Create: `frontend/src/hooks/useAreaRepos.ts`, `hooks/useAreas.ts`, `hooks/useAreaDetail.ts`, 각 `*.test.tsx`

**Interfaces:**
- Consumes: Task 1(`fetchAreas`, `fetchAreaDetail`, `fetchAreaAliases`, `AreasApiError`), 기존 `listWatchedRepos()`/`WatchedRepo`(`services/integrationsApi.ts`, 시그니처 불변).
- Produces:
  - `useAreaRepos(): { status: 'loading' | 'ready' | 'error'; repos: WatchedRepo[]; retry(): void }`
  - `type AreaError = { status: number; code: string | null; message: string }`
  - `useAreas(repoId: number | null, days: number): { status: 'idle' | 'loading' | 'ready' | 'error'; data: AreasResponse | null; aliases: AreaAlias[]; aliasesFailed: boolean; error: AreaError | null; stale: boolean; refresh(): void; canRefresh: boolean }`
    - `repoId`/`days`가 바뀌면 `data`를 즉시 비운다(다른 레포 데이터를 보여 주지 않음). 같은 키에서 재요청이 실패하면 `data` 유지 + `stale: true` + `error` 설정. 이전 요청은 `AbortController`로 취소하고 늦게 온 응답은 무시. `refresh()`는 `refresh=1`로 재요청하고 진행 중이거나 `REFRESH_COOLDOWN_MS = 30_000` 이내면 요청하지 않는다(`canRefresh=false`). 별칭 조회 실패는 `aliasesFailed`로만 알리고 영역 표시를 막지 않는다.
  - `useAreaDetail(repoId: number | null, areaId: string, days: number): { status: 'loading' | 'ready' | 'gone' | 'error'; data: AreaDetail | null; error: AreaError | null; retry(): void }` — `area_not_found`는 `gone`.

- [ ] **Step 1: 실패 테스트**(`vi.mock('../services/areasApi')`, 가짜 타이머): `useAreas`: (a) 첫 성공 → `ready`; (b) `days` 30→90 즉시 `data null`·`loading`; (c) 레포 A 응답이 느리고 B가 먼저 도착 후 A가 도착해도 `data.repoId`는 B; (d) 성공 뒤 재요청 실패 → `data` 유지·`stale true`·`error.code` 보존; (e) 502 `github_unavailable`가 첫 요청이면 `data null`·`status 'error'`; (f) `refresh()` 연타 3회 → `fetchAreas` 추가 호출 1회(`refresh:true`), 30초 후 `canRefresh true`; (g) 별칭 조회 reject → `aliasesFailed true`·`status 'ready'`; (h) `repoId null` → `idle`·fetch 없음; (i) 언마운트 시 abort. `useAreaDetail`: 404 `area_not_found`→`gone`, 500→`error`, `retry` 재호출, `areaId` 변경 시 이전 영역 데이터가 즉시 비워짐. `useAreaRepos`: 성공/실패/`retry`.
- [ ] **Step 2:** `npx vitest run frontend/src/hooks/useAreaRepos.test.tsx frontend/src/hooks/useAreas.test.tsx frontend/src/hooks/useAreaDetail.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. 언마운트·키 변경 시 `AbortController` 정리.
- [ ] **Step 4:** 같은 명령, `npm run lint` PASS
- [ ] **Step 5: 커밋** `feat: 영역 데이터 훅(경합 취소·직전 결과 유지·갱신 제한) 추가`

### Task 5: 영역 흐름 개요 화면 (`/areas`)

**Files:**
- Create: `frontend/src/components/areas/AreaRows.tsx`, `components/areas/AreaNotices.tsx`, `components/areas/CouplingRanking.tsx`, `components/areas/AreaRows.test.tsx`
- Modify: `frontend/src/screens/AreasScreen.tsx`(foundation Task 10의 `ArchitectureView` 래퍼를 대체), `frontend/src/screens/AreasScreen.test.tsx`(신규)

**Interfaces:**
- Consumes: Task 1~4, foundation `ROUTES`/`useSearchParams`/`renderWithRouter`, `lib/areaRoute`.
- Produces:
  - `<AreaRows areas: Area[] disconnected: AreaAlias[] generatedAt: string days: number repoId: number now?: Date />` — `md:` 이상은 네이티브 `<table>`(`<caption class="sr-only">영역별 최근 N주 활동과 리뷰 대기</caption>`, `<th scope="col">` 5개: 영역 / 주간 활동 / 추세 / 마지막 변경 / 리뷰 대기, 영역 이름은 `<th scope="row">` 안의 `<Link to={areaHref(...)}>`), `md:` 미만은 같은 셀 컴포넌트로 만든 `<ul>` 카드(이름·막대·"리뷰 대기 N건"이 위 줄). 두 레이아웃 중 하나만 `hidden`/`md:hidden`으로 렌더되어 낭독이 중복되지 않는다. 행 구성: 이름 + 아래 줄 `pathPrefix · 파일 N개 · 사람 N명`, `WeeklyBars`(row), `TREND_GLYPH`(aria-hidden) + `trendLabel`, `relativeDay(...)`, 리뷰 대기 셀(`리뷰 대기 N건 · 최장 N일` 텍스트 + 가로 막대 `waitBarCells`칸, 막대는 `aria-hidden`, 0건이면 `대기 없음`), `isReviewWaitingNoActivity`이면 글리프(aria-hidden)+글자 **리뷰 대기 중, 활동 없음**, `miscShare ≥ MISC_WARN_SHARE`이면 이름 아래 `분류되지 않은 파일이 많아요(약 N%)`. `disconnected` 행은 표 맨 아래에 `연결 끊김` 라벨 + `WeeklyBars state="unknown"` + 설명("이 이름이 가리키던 경로(backend/x)가 코드에서 보이지 않아요") + 링크 `영역 이름 정리`(→`ROUTES.settings`).
  - `<AreaNotices ... />`: 분석 한도 콜아웃(`truncated`), 활동 0 콜아웃(`analyzedCommits === 0`, 06 §4.4 문구 그대로 + `days<90`이면 `기간을 90일로 늘리기` 버튼), 직전 결과 안내(`stale`).
  - `<CouplingRanking couplings areas repoId />` — `<ol>`, 항목 `A ↔ B`(둘 다 영역 상세 링크) + `커밋 N개` 텍스트 + 가로 막대(`aria-hidden`). `count` 내림차순 상위 10쌍, 더 있으면 `상위 10쌍만 보여요(전체 N쌍)`. 목록은 SVG 원형 그래프를 대체한다(결정 22). 영역 id가 `areas`에 없으면 id 문자열로 표시.
  - 화면 구성(위→아래): `h1` 영역 흐름 → 선택기 3개(`<label>`+`<select>`: 레포, 기간 30/60/90/180일, 정렬 최근 변경 순/리뷰 대기 많은 순/이름 순 — 변경 시 URL 갱신) + `다시 분석하기` 버튼(`canRefresh=false`면 `aria-disabled`) → 콜아웃 "활동이에요. 진행률이 아니에요." + 기준 한 줄(`N분 전 분석`, 분석 커밋 수) → **범례 본문 텍스트**(1칸=커밋 2개·같은 눈금·최대 16개, 속 빈 막대=이번 주, 점선=데이터 없음, 왼쪽=오래된 주) → `summarizeAreas` 요약 문단 → `AreaRows` → `<details>` `표로 보기`(영역×주 커밋 수 `<table>`, `caption`, 열 머리글 `th scope="col"`=주 시작일) → `함께 바뀐 영역` + `CouplingRanking`.
  - 상태: `useAreaRepos` 로딩→스켈레톤(정적), 레포 0개→빈 상태("연결된 레포가 없어요. 영역 흐름은 레포를 연결하면 볼 수 있어요." + 링크 `설정에서 레포 연결하기`), `?repo=` 없음→첫 레포로 `replace` 이동, 목록에 없는 id→안내 "이 레포는 더 이상 연결되어 있지 않아요" + 첫 레포 링크, `useAreas` 로딩→제목·콜아웃 틀 유지 + 표 자리에 스켈레톤 행 6개 + `role="status"` "최근 N일 커밋을 분석하는 중이에요(처음엔 조금 걸려요)", 502 `github_unavailable`→오류형 빈 상태("이 레포를 읽을 수 없어요 / 영역 흐름만 볼 수 없고 내 리뷰 요청은 그대로예요 / 잠시 뒤에 다시 시도해 주세요" + `다시 시도`, `role="alert"` 한 번), 그 외 오류→같은 틀의 일반 문구, `areas: []`→"이 레포에서 나눌 영역을 찾지 못했어요" + 다른 레포 선택 안내, 직전 결과가 있는 실패→표 유지 + 배너(`stale`).

- [ ] **Step 1: 실패 테스트** `AreaRows.test.tsx`: (a) 데스크톱 렌더에서 `getByRole('table', {name: /영역별 최근/})`, 열 머리글 5개, 이름 링크의 `href`가 `/areas/<id>?repo=1`; (b) 행의 `role="img"` 이름이 `5주 커밋: …` 문자열; (c) `quiet`+대기 2건 행에 텍스트 `리뷰 대기 중, 활동 없음`·`리뷰 대기 2건`·`최장 6일`이 있고 `정체 후보`·`조용함`은 DOM 어디에도 없음; (d) 전부 0인 행은 `대기 없음`, 문구 `완료` 없음; (e) 추세 글자가 `활발해짐/꾸준함/활동 적음`; (f) `disconnected` 별칭 → `연결 끊김` 텍스트·`영역 이름 정리` 링크·`aria-label="데이터 없음"` 막대; (g) 이름 80자 별칭이 말줄임 없이 줄바꿈(`truncate` 클래스 없음); (h) 카드 레이아웃과 표가 동시에 접근성 트리에 나타나지 않음(`hidden` 쪽은 `getByRole`로 안 잡힘).
  `AreasScreen.test.tsx`(`MemoryRouter`, 훅 모킹): (i) 정상: `h1` "영역 흐름" 1개, 범례 텍스트에 `1칸 = 커밋 2개`·`속이 빈 막대`·`점선`, 요약 문단, "활동이에요. 진행률이에요" 아님을 확인(`진행률이 아니에요` 포함); (j) 로딩: `role="status"` 문구; (k) `?repo=999`(없음)→"더 이상 연결되어 있지 않아요"; (l) 레포 0개→설정 링크; (m) 502 → "이 레포를 읽을 수 없어요"·`role="alert"` 1개, `다시 시도` 클릭이 `retry`; (n) `areas: []`→"영역을 찾지 못했어요"이며 `이 레포를 읽을 수 없어요`는 없음; (o) `analyzedCommits 0`→"최근 30일 동안 이 레포에 커밋이 없어요"+`기간을 90일로 늘리기`가 URL을 `days=90`으로; (p) `truncated`→"최근 60개만 분석했어요"; (q) `stale`→"직전 결과" 문구와 표 유지; (r) 정렬 `select` 변경이 URL `sort=`를 바꾸고 행 순서가 바뀜(정체 행 자동 상단 이동 없음); (s) `표로 보기`의 표에 영역×주 숫자(예 `16`)가 있음; (t) `다시 분석하기`가 `canRefresh=false`일 때 `aria-disabled`이고 클릭해도 `refresh` 미호출; (u) 키보드: `userEvent.tab()` 반복으로 선택기→이름 링크들이 DOM 순서대로 포커스되고 `outline-none` 클래스 없음; (v) 화면에 `localStorage` 호출 0회.
- [ ] **Step 2:** `npx vitest run frontend/src/components/areas frontend/src/screens/AreasScreen.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약. `ArchitectureView`는 이 태스크에서 건드리지 않는다(삭제는 Task 7). 시각 값은 토큰 유틸리티만.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run build` PASS
- [ ] **Step 5: 커밋** `feat: 영역 흐름 개요(작은 다중 차트 표·순위 목록·상태별 화면)`

### Task 6: 영역 상세 화면 (`/areas/:areaId`)

**Files:**
- Create: `frontend/src/components/areas/WaitingPrTable.tsx`, `components/areas/WaitingPrTable.test.tsx`, `screens/AreaDetailScreen.test.tsx`
- Modify: `frontend/src/screens/AreaDetailScreen.tsx`(foundation Task 12의 `h1`+링크 스텁을 대체)

**Interfaces:**
- Consumes: Task 1~4, `WeeklyBars`(detail), `lib/areaChart`, `lib/areaRoute`, foundation `lib/date.formatDate`.
- Produces:
  - `<WaitingPrTable repoId: number areaId: string prs: WaitingPr[] now?: Date />` — 열 PR(`#58 제목`)/작성자/올라온 지(`waitingDays` + `일`, 1일 미만은 `1일 미만`)/리뷰어(쉼표 나열)/걸친 영역/GitHub(링크 이름 `#58 GitHub에서 열기`, 새 탭 링크는 `rel="noopener noreferrer"`). 걸친 영역 셀은 **응답 항목의 `touchedAreas`·`isPrimary`로 그린다(추가 호출 없음, 결정 37)**: `touchedAreas`의 첫 항목(= `primaryAreaId`)에 글자 `주 영역`, 나머지는 `걸쳐 있음` 글자 + 영역 상세 링크(이름은 `touchedAreas[].displayName`), `isPrimary===false`이면 행에 `주 영역은 {이름}이에요(개수는 거기에만 세요)`, `unmapped>0`이면 `분류되지 않은 파일 N개`, `filesTruncated`면 `파일이 많아 일부만 봤어요`. 표 아래 한 줄: "여러 영역에 걸친 PR은 변경 파일이 가장 많은 영역 한 곳에만 개수에 들어가요. 여기서는 걸친 영역을 모두 보여요." draft PR은 `초안` 텍스트.
  - `AreaDetailScreen`: `useParams().areaId`(디코딩된 값), 쿼리 `repo`/`days`. 위→아래: `영역 흐름` 뒤로 링크(`areasHref`로 레포·기간 유지) → `h1`=`displayName`, 보조 줄 `원래 경로 {pathPrefix} · 파일 N개 · {추세 글자} · 마지막 변경 {relativeDay}` + 해당되면 **리뷰 대기 중, 활동 없음** 텍스트, 링크 `이름 바꾸기`(→`ROUTES.settings`, 별칭 편집은 설정 화면 소유) → `h2 주간 활동(커밋)` + `WeeklyBars variant="detail"`(활동 0이면 문구 "최근 N일 동안 이 영역에 커밋이 없어요") → `h2 리뷰 대기 PR N건` + `WaitingPrTable`(0건이면 "지금 리뷰 대기 PR이 없어요. 영역이 사라진 게 아니에요.") → `h2 최근 커밋`(메시지 첫 줄·작성자·날짜·`sha7`) → 보조 열: `최근 변경한 사람`(이름만, 숫자·순위 없음, "물어볼 사람을 찾는 용도예요. 순위나 평가가 아니에요.") → `함께 바뀐 영역`(`coupledWith`를 `커밋 N개` 순으로, 이름은 `useAreas`의 영역 목록에서 조회하고 없으면 id) → `포함된 경로(일부)`(`samplePaths`). 좁은 폭에서 보조 열은 아래로 내려오고 순서는 사람→결합→경로.
  - 상태: 로딩(틀 유지 + 스켈레톤), `gone`→`h1` "이 영역은 더 이상 코드에서 보이지 않아요" + 링크 `영역 흐름으로 돌아가기`, `?repo=` 없음/잘못됨→개요로 가는 안내, 일반 오류→재시도 버튼 + `role="alert"` 1회. 상세 화면은 `useAreas`로 이름 조회용 목록을 함께 읽되 그 실패가 상세 표시를 막지 않는다.

- [ ] **Step 1: 실패 테스트** `WaitingPrTable.test.tsx`(props만으로 렌더, 네트워크 모킹 없음): (a) 두 영역에 걸친 PR(`touchedAreas` 2개)에서 주 영역 칩에 `주 영역`, 다른 칩에 `걸쳐 있음`+영역 상세 링크(`href`에 `?repo=1`); (b) `isPrimary:false` PR 행에 "주 영역은 … 거기에만 세요" 문구; (c) `touchedAreas`가 빈 배열이어도 예외 없이 행 유지; (d) `filesTruncated` 문구; (e) GitHub 링크 접근 이름 `#58 GitHub에서 열기`가 행마다 구분, `rel` 포함; (f) 집계 안내 한 줄 존재; (g) 리뷰어 0명 PR도 예외 없음; (h) `초안` 텍스트.
  `AreaDetailScreen.test.tsx`: (i) `/areas/backend-payments?repo=1`에서 `h1`=별칭 이름, 보조 줄에 원래 경로, 주간 막대 값이 텍스트(`16`)로 존재; (j) 활동 0 → 문구 + 바닥선만, `완료` 없음; (k) 대기 PR 0건 문구; (l) 주 영역이 아닌 영역(`isPrimary:false`)의 상세에도 걸친 PR이 표에 나오고 "주 영역은 …" 문구가 있음; `/areas/한글%20이름?repo=1` 디코딩되어 `fetchAreaDetail`이 `'한글 이름'`으로 호출; (m) `gone` → "더 이상 코드에서 보이지 않아요" + 돌아가기 링크, 예외 없음; (n) `repo` 쿼리 없음 → 안내 + 개요 링크; (o) 뒤로 링크가 `days=90`을 보존; (p) `최근 변경한 사람`에 숫자·`순위` 텍스트 없음; (q) `quiet`+대기 영역에 `리뷰 대기 중, 활동 없음`; (r) `h1` 1개.
- [ ] **Step 2:** `npx vitest run frontend/src/components/areas/WaitingPrTable.test.tsx frontend/src/screens/AreaDetailScreen.test.tsx` → FAIL
- [ ] **Step 3: 구현** 위 계약.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run build` PASS
- [ ] **Step 5: 커밋** `feat: 영역 상세(걸친 PR 표시·대기 PR 표·함께 바뀐 영역 목록)`

### Task 7: 구 아키텍처 화면 삭제 · 가드 · 수동 검증

**Files:**
- Delete: `frontend/src/components/dashboard/ArchitectureView.tsx`, `frontend/src/components/dashboard/architecture/`(CouplingGraph, GroupCard, WeeklyChart, utils, utils.test), `frontend/src/services/architectureApi.ts`(+`architectureApi.test.ts`가 있으면 함께)
- Create: `frontend/src/lib/areaGuards.test.ts`
- Modify: `package.json`(`recharts` 제거), `CLAUDE.md`(Frontend structure에 영역 흐름 항목 추가), `docs/DECISIONS.md`(날짜 항목 **추가**, 기존 덮어쓰기 금지)

**Interfaces:** Consumes: Task 5·6 완료. Produces: 없음. 백엔드 `GET /integrations/architecture/`는 계약상 유지되므로 건드리지 않는다. `STORAGE_KEYS.archRepoUrl`(foundation `lib/storage.ts`)은 사용처가 사라져도 그대로 둔다(`storage.test.ts` 호환, 정리는 foundation 소유).

- [ ] **Step 1: 실패 테스트(가드)** `areaGuards.test.ts`: 테스트 파일 제외 `frontend/src`를 읽어 (a) `ArchitectureView|CouplingGraph|GroupCard|WeeklyChart|architectureApi|REPO_URL_KEY|groupColors` 0건, (b) `recharts` import 0건, (c) `components/areas`·`screens/Area*.tsx`·`lib/area*.ts`·`hooks/useArea*.ts`에서 `조용함|정체 후보|진행률 \d|완료율|localStorage|hsl\(|animate-(pulse|ping|bounce)|<(div|span)\b[^>]*\sonClick=` 0건(허용 문구 "진행률이 아니에요"는 `진행률이` 패턴이 아니므로 통과), (d) 같은 파일들에서 `outline-none`이 `focus-visible:` 대체와 같은 `className`에 있지 않은 경우 0건.
- [ ] **Step 2:** `npx vitest run frontend/src/lib/areaGuards.test.ts` → FAIL(구 파일 존재)
- [ ] **Step 3: 구현** 파일 삭제 후 `grep -rn recharts frontend/src` 0건을 확인하고 `npm uninstall recharts`. `CLAUDE.md`·`DECISIONS.md` 갱신(문제: URL 수동 입력·색 의존 누적 차트·원형 그래프 / 해결: 레포 id 기반 영역 API·같은 눈금 작은 다중 차트·순위 목록 / 결과: 이 계획의 검증 결과, recharts 제거).
- [ ] **Step 4: 검증** `npm run lint`, `npm test`, `npm run build` PASS. 수동(백엔드 `docker compose up` + `npm run dev`): (1) `/#/areas`에서 첫 레포가 선택되고 새로고침·뒤로가기로 `?repo=&days=&sort=`가 유지, (2) Tab만으로 선택기→영역 이름→상세→뒤로 링크까지 이동하고 포커스 링이 항상 보임, (3) DevTools 렌더링 탭 "grayscale" 에뮬레이션에서 추세·정체 신호·속 빈 막대·점선이 글자/모양으로 구분됨, (4) 320px 폭에서 가로 스크롤 없음(카드 레이아웃)·90일 선택 시에도 동일, (5) 서버 중지 후 `다시 분석하기`로 직전 결과 유지 배너 확인, (6) VoiceOver로 개요를 읽어 한 영역이 한 번만 낭독됨(이 항목은 자동화 불가, 결과를 PR 설명에 기록).
- [ ] **Step 5: 커밋** `refactor: 구 아키텍처 화면과 recharts 제거, 영역 흐름 가드 추가`

---

## Self-Review

- **스펙 커버리지:** 작은 다중 차트·같은 눈금·속 빈 이번 주·0 바닥선·점선(T2·T3·T5), "리뷰 대기 중, 활동 없음"(T2 규칙, T5·T6 표시), 순위 목록(T5)·상세 보조 목록(T6), 결정 32 걸친 PR(T6), 텍스트 대안·비색상(T2 `describeWeekly`, T3 `aria-label`, T5 요약·`표로 보기`, 글리프는 보조), 키보드(T5 u), 로딩·오류·0개·잘림(T5 j~q), 별칭·연결 끊김(T5 f, T2 `disconnectedAliases`), E9/E10(T5 o, T6 m). 07 #16·36~38·40이 T5·T7로 매핑됨.
- **타입 일관성:** `Area`/`AreaDetail`/`AreaAlias`(T1)를 T2~T6이 그대로 소비. 훅 반환형(T4)을 T5·T6 테스트의 모킹 형태와 맞춤. `ROUTES`·`renderWithRouter`·`formatDate`는 foundation 이름 그대로 사용했고 재정의하지 않음.
- **비례:** 코드 본문 없이 시그니처·테스트 단언 위주.

## 태스크 의존 그래프

```
(foundation T1·T3·T4·T10·T12 완료 전제)
T1(타입·API) ─┬─ T2(lib: 눈금·텍스트·URL) ── T3(WeeklyBars SVG) ─┬─ T5(개요 화면) ─┐
              └─ T4(훅 3종) ────────────────────────────────────┤                 ├─ T7(삭제·가드·수동 검증)
                                                                 └─ T6(상세 화면) ─┘
              (T5는 T2·T3·T4 필요, T6도 T2·T3·T4 필요)
```

**병렬 가능 묶음:** A: T1 단독 → B: {T2 → T3} ∥ {T4}(파일 겹침 없음) → C: {T5} ∥ {T6}(`components/areas/` 디렉터리는 공유하나 파일은 분리, `screens/`도 파일 분리) → D: T7 단독.

## 인터페이스 충돌 의심

1. **foundation `ROUTES.area(id)`에 레포가 없다.** 영역 id는 레포 안에서만 유일하므로 `?repo=` 쿼리로 보완했다(`areaHref`). foundation의 시그니처는 바꾸지 않았다.
2. ~~foundation Task 16이 `ArchitectureView.tsx`를 수정~~ **해결**: foundation T2·T16은 이 파일(과 `architecture/*`)을 수정하지 않고 가드에서 제외한다. 삭제 책임은 이 계획 Task 7에만 있다. foundation T10의 `AreasScreen`이 `ArchitectureView`를 감싸는 임시 연결은 이 계획 Task 5가 대체한다.
3. ~~foundation이 `BrowserRouter`로 쓰여 있음~~ **해결**: foundation이 HashRouter(결정 27)로 수정됐다. 이 계획은 라우터 종류에 의존하지 않도록 쿼리만 쓰고 `#` 앵커는 쓰지 않는다(그래서 "대기 N건 → 상세의 PR 표 앵커 이동"은 만들지 않고 상세 화면 링크로 대체했다).
4. ~~계약 §4.2의 `waitingPullRequests`에 걸친 영역 정보가 없다~~ **해결(결정 37)**: §4.2 항목에 `primaryAreaId`·`isPrimary`·`touchedAreas`·`unmapped`·`filesTruncated`가 추가됐고 주 영역이 아닌 영역 상세에도 PR이 포함된다. 이 계획은 §4.3·`usePrAreas`를 쓰지 않는다.
5. **별칭 쓰기(이름 바꾸기·정리)는 설정 화면 계획의 소유**로 보고 이 계획은 링크(`ROUTES.settings`)만 둔다. 설정 계획은 `fetchAreaAliases`/`AreaAlias`를 재정의하지 말고 `services/areasApi.ts`·`types/areas.ts`를 import해야 한다.
6. 06 와이어프레임의 "대기 N건 → 전체 작업(영역 필터)" 링크는 foundation의 `TasksScreen`에 영역 필터가 없고 PR이 큐로 이전되어 만들지 않았다. 06 §5의 "내 리뷰 요청에 있음" 배지도 큐 화면 계획의 데이터가 필요해 이 계획에서 제외했다.
7. 06 문서는 추세 라벨을 "조용함"이라 쓰지만 확정 결정 16과 충돌해 **활동 적음**을 썼다.

## 사용자 결정이 필요한 질문

모두 확정됨(결정 37): ① 걸친 PR은 §4.2 응답 필드로 받는다 ② 주 영역이 아닌 영역 상세에도 포함한다 ③ recharts 제거(Task 7) ④ 경고 임계 30%·기간 30/60/90/180일은 임시값으로 유지. 남은 미결 질문 없음.
