# 03. 현재 UI 인벤토리 (frontend/src, 읽기 전용 조사)

입력: `00-context.md`. 용도: Impeccable 시각 디자인 단계와 구현 단계의 입력.
조사 방식: 전 파일 직접 읽기 + grep 집계(`frontend/src`의 `*.tsx`/`*.ts`, `*.test.ts` 제외). 줄 번호는 조사 시점 기준. 코드 수정 없음.
총 규모: 4,038줄(ts/tsx/css). 빈도 숫자는 "클래스 토큰 등장 횟수"이며 렌더 횟수가 아니다.

---

## 1. 화면·컴포넌트 목록

### 1.1 구조 개요

`App.tsx`가 라우터 없이 `activeTab` state(`board|list|analytics|architecture`)로 뷰를 갈아끼운다(App.tsx:25, 530-559). URL 없음, 뒤로가기 불가, 새로고침 시 항상 `board`. 모달은 `isModalOpen`+`selectedTask`로 제어. 사이드바 고정폭 `w-64`, 반응형 분기 없음(`md:`/`lg:`는 TaskBoard 그리드와 모달 폼에만 있음) → 모바일 화면 없음.

| 파일 | 줄 | 역할 | 받는 props / 의존 데이터 |
|---|---|---|---|
| `App.tsx` | 590 | 셸 + 전역 state + 모든 리소스 mutation handler + 폴링 + 다크모드 토글 + 헤더(검색, 감시레포, 테마, 새 작업) + 토스트 | tasks(서버+localStorage), activities(localStorage), darkMode(localStorage), 감시레포 sync 상태 |
| `components/layout/Sidebar.tsx` | 96 | 4개 탭 네비 + 배지(보드=미완료 수, 목록=전체 수) + 브랜드 | `activeTab`, `setActiveTab`, `taskCounts{all,todo,inprogress,review,done}` |
| `components/dashboard/TaskBoard.tsx` | 456 | "칸반". 실제로는 2단계: (a) 4개 상태 포털 카드(177-225) → (b) 한 상태만 보이는 카드 그리드(228-455). 진짜 칸반(4열 동시 표시)이 아님 | `tasks`(검색 적용됨), `onMoveTask/onSelectTask/onAddTaskClick/onDeleteTask`, `selectedStatus`/`onSelectedStatusChange`(App이 소유) |
| `components/dashboard/TaskList.tsx` | 333 | "모든 작업/작업 대장" 테이블. 상태 필터·담당자 검색·생성일 정렬, 행 안의 상태 `<select>` | `tasks`, `onSelectTask/onDeleteTask/onMoveTask` |
| `components/dashboard/AnalyticsView.tsx` | 214 | KPI 카드 4개 + 상태 막대차트 + 우선순위 도넛(recharts) | `tasks`(검색 미적용 원본) |
| `components/dashboard/ArchitectureView.tsx` | 129 | GitHub URL 입력 → 그룹별 변경 흐름 분석 화면 조립(폼·로딩·오류·빈 상태) | `darkMode`(차트 색용), 자체 state, `services/architectureApi` |
| `.../architecture/WeeklyChart.tsx` | 75 | 그룹별 주간 커밋 누적 막대 + 범례 토글 | groups, colors, hidden, highlight, darkMode |
| `.../architecture/GroupCard.tsx` | 94 | 그룹 카드(스파크라인, 추세 뱃지, 최근 커밋/파일 펼침) | group, color, selected, onSelect |
| `.../architecture/CouplingGraph.tsx` | 88 | 원형 배치 SVG 관련도 그래프(함께 변경된 그룹) + 순위 목록 | groups, couplings, highlight, onSelect |
| `.../architecture/utils.ts` | 104 | 색 생성(hsl), 추세 메타, 시계열 변환, 원형 레이아웃, 날짜 포맷 (+`utils.test.ts` 96줄) | 순수 함수 |
| `components/common/TaskModal.tsx` | 1,093 | 작업 생성/수정/상세/검토/체크리스트/AI 생성/상태 이동 전부 (아래 1.2) | 아래 1.2 |
| `components/common/WatchedReposPanel.tsx` | 161 | 감시 레포 CRUD + 지금 동기화 + 결과 표시 모달. `role="dialog"` 있음 | `onClose`, `syncing`, `syncInfo`, `onSync`; 내부에서 `integrationsApi` 직접 호출 |
| `components/common/PrBadge.tsx` | 17 | 9px 보라 "PR" 링크 뱃지 | `url?` |
| `components/dashboard/ActivityFeed.tsx` | 70 | 활동 스트림 사이드 패널 | `activities` — **어디서도 렌더되지 않음**(App.tsx:21 import만, `isActivityStreamOpen`은 setter 미사용) |

**죽은 코드**(디자인 대상에서 제외 후보)
- `ActivityFeed.tsx` 전체, App.tsx의 `activities`/`saveActivitiesToLocal`/`INITIAL_ACTIVITIES`(`constants/initialData.ts` 40줄, 영어 가짜 인물 Sarah Chen 등)/`logActivity`(빈 함수, App.tsx:171-173; 호출 4곳)/미사용 import `Bell, Sparkles, CheckSquare, History`(App.tsx:2).
- TaskBoard의 `getPriorityStyle`(138-148), `getCategoryStyle`(150-160): 정의만 있고 호출 없음. `Task.roles`는 항상 빈 배열(편집 UI 없음, TaskModal:96, 214).

### 1.2 TaskModal.tsx (1,093줄) 내부 구조

props 14개: `isOpen, onClose, task, initialStatus, onSave, onDeleteTask, onAddSubtask, onToggleSubtask, onRemoveSubtask, onReplaceSubtasks, onAddReview, onUpdateReview, onDeleteReview, onNavigateToStatus`(7-22). 로컬 `useState` 20개(87-106), 그중 폼 필드 6 + 하위작업 2 + 리뷰 폼 5 + UI 플래그 5 + 복제 데이터(`subtasks`, `roleReviews`) 2.

| 줄 | 섹션 | 하위 기능 | 분리 후보 |
|---|---|---|---|
| 24-69 | 모듈 헬퍼 | `getInitials`, `getAvatarColor`, `formatCreatedAt` | `getInitials/getAvatarColor`는 TaskBoard·TaskList에도 **동일 복사본**(3벌) → `lib/avatar.ts` |
| 87-143 | state + prop→state 동기화 effect | `[task,isOpen,initialStatus]` 변경 시 20개 state 전부 리셋(109-143) | 폼 state는 `useTaskForm(task)` 훅 |
| 150-197 | `handleGenerateChecklist` | 컴포넌트가 `postJson('/api/v1/generate-checklist/')`을 **직접 호출**(App의 handler 규칙 우회), 응답 id를 `sub-ai-${Date.now()}`로 생성 | `services/aiApi.ts` + App handler로 이동 |
| 199-239 | 저장 / 상태 이동 | `handleSave`(scalar만 onSave), `handleStatusChangeAndRedirect`(onSave로 PATCH + 보드로 이동) | 상태 이동은 App의 `handleMoveTask`로 통일 가능 |
| 241-343 | 하위작업·리뷰 handler | toggle/add/remove subtask, add/accept/delete review. 낙관적 로컬 state + 서버 호출 + `console.error`만(실패 시 롤백·사용자 알림 없음) | 체크리스트·리뷰 각각의 훅 |
| 346-412 | 모달 셸 + 헤더 | 제목(모드별), "정보 수정"/"작업 삭제" 버튼, 인라인 삭제 확인(367-402), 닫기 | `ModalShell`(공용 다이얼로그) + `TaskModalHeader` |
| 416-521 | **편집/생성 폼** | 제목·설명·상태·우선순위·카테고리(자유입력)·담당자(자유입력, 라벨은 "작업 생성자") | `TaskForm` |
| 523-546 | 보기: 헤더·제목·설명 | 생성일, PrBadge, 제목, 설명 | `TaskSummary` |
| 548-573 | 보기: 담당자 카드 | 아바타 + "작업 생성자" 라벨(필드명과 의미 불일치) | `AssigneeCard` |
| 575-756 | **보기: 역할별 검토 기록** (약 180줄) | 목록(579-674: 역할 뱃지, 긴급, 검토자 Accept, 삭제), 추가 폼(676-755: 역할/직접입력/검토자/긴급도/내용) | `ReviewList` + `ReviewForm` |
| 758-795 | AI 체크리스트 생성 버튼 + 오류 | 같은 버튼이 3곳에 복제(764, 807, 841) | `ChecklistGenerateButton` |
| 797-914 | **체크리스트** | 헤더, `hasUnreflectedReview` 경고(828-858, 서버 계산값 사용), 항목 토글/삭제(861-894), 추가 폼(897-913) | `Checklist` |
| 916-1038 | **워크플로 도식** | 수동 상태 변경 2버튼(929-956), 4단계 스텝바(958-1037, 단계마다 거의 같은 블록 4번 복붙) | `StatusStepper`(데이터 구동 map) |
| 1043-1089 | 완료 축하 오버레이 | 체크리스트 전부 체크 시 "다음 단계로 이동" 확인(`animate-bounce`, 🎉) | `CompletionPrompt` |

구조 문제(디자인과 직결): ① 보기/편집이 모드 분기라 생성 시 리뷰·체크리스트 UI 없음. ② 한 스크롤 안에 "정보→담당자→리뷰→AI 버튼→체크리스트→상태"가 나열되어 위계 없음. ③ `isOpen` 가드 후 return null(143)이 effect 뒤라 훅 규칙은 OK이나 모달이 항상 마운트됨. ④ 스텝바 진행선 폭이 `status==='done'`일 때 `'76%'`(971) — 다른 값(33/66)과 규칙 불일치. ⑤ 모달 안에서 상태를 바꾸면 모달이 닫히고 보드 첫 화면으로 이동(`onNavigateToStatus`, App.tsx:581-586) — 삭제 시에도 `'todo'`로 이동(384).

---

## 2. 시각 패턴 빈도 (grep 근거)

명령 기준: `grep -rohE "<패턴>" --include='*.tsx' --include='*.ts' .` (test 제외). 토큰은 Tailwind 유틸리티 기본 팔레트 직접 사용. **디자인 토큰/`@theme`/CSS 변수 0개**(`index.css`는 `@import "tailwindcss";` 1줄).

### 2.1 색
| 계열 | 등장 | 용도 |
|---|---|---|
| slate | 659 | 전부(배경/텍스트/테두리). 상위: `slate-800` 125, `slate-400` 121, `slate-200` 79, `slate-100` 68, `slate-500` 67, `slate-700` 57, `slate-900` 46, `slate-600` 32, `slate-300` 22, `slate-50` 20 |
| blue | 165 | 주 액센트·진행 중·선택 |
| rose | 106 | 높음/긴급/삭제/오류 |
| emerald | 92 | 낮음/완료/성공 |
| amber | 58 | 보통/검토 중/경고 |
| red | 19, indigo 18, purple 9, violet 7, fuchsia 6, teal 6, sky 4, pink 3 | 긴급 뱃지, AI 버튼(indigo), 카테고리 뱃지 해시색, PR 뱃지(violet), 아바타색 |

- 의미 색이 겹침: 보통=amber(우선순위) = 검토 중=amber(상태); 높음=rose = 삭제=rose = 오류=rose; 진행 중=blue = 기본 버튼=blue = 포커스링=blue. 한 화면에서 색이 의미를 구분하지 못한다.
- 하드코딩 hex(`AnalyticsView`) 11개: `#64748b #3b82f6 #d97706 #10b981 #f43f5e #fbbf24 #60a5fa #0f172a #e2e8f0 #f1f5f9 #94a3b8`. 우선순위 차트 색(`#f43f5e/#fbbf24/#3b82f6`)이 카드의 낮음=emerald와 **불일치**(낮음이 파랑), 그리고 `urgent`가 차트에 없음(AnalyticsView.tsx:54-63).
- 차트 툴팁은 항상 `#0f172a` 배경(AnalyticsView 154, 198)이라 라이트/다크 구분 없음. 반면 `WeeklyChart`는 `darkMode` prop으로 색 분기(별도 방식).
- 그룹 색은 hsl 동적 생성(`architecture/utils.ts:6-24`)으로 슬레이트/블루 계열과 별개 체계.

### 2.2 존재하지 않는 클래스 (Tailwind 4.3.1 기본 팔레트에 없는 단계 → 스타일이 조용히 무시됨)
| 클래스 | 위치 |
|---|---|
| `slate-850` ×4 | `Sidebar.tsx:47`(`border-slate-850` → 사이드바 헤더 구분선 없음), `TaskModal.tsx:685`, `726`(`text-slate-850` 입력 텍스트색 무효), `917`(`dark:border-slate-850`) |
| `slate-150` ×3 | `TaskModal.tsx:527, 624, 677` |
| `slate-355` | `TaskModal.tsx:618` (`dark:text-slate-355` 리뷰 본문) |
| `slate-250`, `slate-750` | `TaskModal.tsx:904` (체크리스트 추가 입력 테두리, 라이트·다크 모두 무효) |
| `blue-450` ×6 | `TaskModal.tsx:362, 987, 1003, 1019`, `TaskBoard.tsx:215, 341` (다크 hover/활성 텍스트) |
| `emerald-455` | `TaskModal.tsx:1033` |
→ 총 18곳. 전부 "다크 모드 보정용 임의 단계"로 보이며(추측) 효과 없음. 토큰화 시 일괄 제거 대상.

### 2.3 타이포
- 폰트: 커스텀 폰트 로드 없음(`index.html`에 `<link>` 없음). `font-sans` 24, `font-mono` 26 — 둘 다 Tailwind 기본 스택이라 `font-sans`는 사실상 무의미. 숫자·카테고리·날짜에 `font-mono`를 장식적으로 사용.
- 크기: `text-xs` 86, `text-sm` 23, `text-2xl` 5, `base` 3, `xl` 2, `lg` 2, `3xl` 1. 임의값 `text-[10px]` 39, `[11px]` 28, `[9px]` 9, `[13.5px]` 1, `[10.5px]` 1. → 기본 본문이 12px(`text-xs`)이고 보조가 9-11px. **위계가 11~12px 대역에 뭉쳐 있음.**
- 굵기: `font-bold` 78, `semibold` 39, `medium` 7, `black` 7, `extrabold` 6. 거의 모든 텍스트가 bold 이상.
- 대문자+자간: `uppercase` 29, `tracking-wider` 28, `tracking-tight` 4, `tracking-widest` 1, `tracking-wide` 1. 한국어 UI에서 `uppercase`는 영어 라벨(`Total Tasks` 등)에만 효과 → 한/영 혼용을 가린다.
- 한/영 혼재 라벨: AnalyticsView 전체가 영어(`Total Tasks`, `In Progress`, `Completed Tasks`, `Checklist Items Done`, `Tasks by Status Stage`, `Tasks Priority Levels`, `No priority data available`, 차트 범례 `To Do/In Progress/In Review/Completed`, 우선순위 `High/Medium/Low`) / TaskModal `Accept 완료`(631), `업무 Accept`(648), `작업 프로세스 흐름도 (Workflow Diagram)`(921), `검토 중 (Review)`(1065), `완료됨 (Done)`(1075), `긴급 (Urgent) 🔥`(729), 역할 `개발자 (Developer)` 등.

### 2.4 간격
- 패딩: `p-4` 11, `p-1` 9, `p-5` 8, `p-6` 5, `p-3` 5, `p-1.5` 5, `p-8` 3. gap: `gap-2` 27, `gap-1.5` 25, `gap-1` 22, `gap-3` 17, `gap-4` 11, `gap-6` 4. 소수 단계(`1.5`, `2.5`, `3.5`)와 임의값(`h-[19.5rem]` 카드 고정높이 TaskBoard:326, `w-[22px] h-[22px]`)이 혼재. 일정한 스케일 없음(추측: 화면별로 즉흥 조정).
- 페이지 패딩 `p-8`(App:513), 카드 `p-4`~`p-6` 제각각.

### 2.5 모서리
`rounded-lg` 49, `rounded-xl` 32, `rounded`(4px) 28, `rounded-full` 23, `rounded-2xl` 3, `rounded-md` 2, `rounded-sm` 2. 같은 "카드"가 화면에 따라 xl/2xl, 같은 "버튼"이 lg/rounded/xl.

### 2.6 그림자·링·효과
- 그림자: `shadow-sm` 21, `shadow-md` 7, `shadow-lg` 7, 컬러 그림자(`shadow-blue-*` 7, `shadow-emerald-*` 4, `shadow-red-*` 2, `shadow-amber-*` 2, `shadow-rose-*` 1), `shadow-xl` 2.
- 링: `ring-1`(포커스) 다수, `ring-2` 9(모달 입력 포커스+긴급 리뷰 카드), `ring-4` 4(스텝바 현재 단계).
- 효과: `backdrop-blur-sm/md`(TaskModal:346, 1045), `hover:-translate-y-1`(TaskBoard:194), `transition-all` 37(대부분 불필요한 전 속성 전환), `cursor-pointer` 37.
- 애니메이션 14곳: `animate-pulse` 5(TaskModal 609/634/932/942, Arch 80), `animate-spin` 5, `animate-bounce` 1(1046), `animate-ping` 1(832), `animate-in fade-in` 2(Tailwind 4 기본에 없는 클래스 — `tailwindcss-animate` 미설치라 **무효**, 추측: 확인 필요).

### 2.7 좌측 굵은 테두리
`border-l-[5px]`/`[6px]` 5회 — TaskBoard.tsx:50,56,62,68,74(우선순위별 색) + TaskList.tsx:233(`border-l-[4px] border-l-rose-500`, urgent 행). Sidebar 활성 항목은 `border-r-4 border-blue-500 rounded-r-none`(Sidebar:75) — 같은 계열의 사이드 스트라이프.

---

## 3. 다크 모드

### 구현
- `App.tsx:40-43` `darkMode` state를 `localStorage('darkMode')`에서 초기화. 토글 버튼(477-484) → `setDarkMode(!darkMode)`.
- `App.tsx:150-157` effect가 `document.documentElement.classList`에 `dark` 추가/제거 + localStorage 저장. 추가로 루트 div에도 `${darkMode ? 'dark' : ''}`(App.tsx:438) — 중복.
- 컴포넌트는 `dark:` 변형을 직접 병기: 총 **485회**(TaskModal 90, TaskBoard 66, TaskList 35, AnalyticsView 20, WatchedReposPanel 15, ArchitectureView 14, GroupCard 9, App 9, ActivityFeed 9, CouplingGraph 8, utils 3, WeeklyChart 3, PrBadge 1). `Sidebar.tsx`는 `dark:` 0회(항상 `bg-slate-900`).
- `ArchitectureView`/`WeeklyChart`는 `darkMode` boolean을 prop으로 받아 recharts 색을 JS로 분기.

### 문제점
1. **(확인 필요, 높은 확률로 버그)** Tailwind **4.3.1**의 `dark:` 기본 변형은 `@media (prefers-color-scheme: dark)`(`node_modules/tailwindcss/dist/lib.js`에서 확인). `index.css`에 `@custom-variant dark (&:where(.dark, .dark *))`가 **없고** `tailwind.config`도 없음 → `.dark` 클래스 토글이 `dark:` 유틸리티에 영향을 주지 못하고 **OS 설정을 따를 가능성**이 큼. 즉 토글 버튼과 저장값이 실제 테마를 바꾸지 못할 수 있음. 실제 렌더로 검증하지 않았음(조사는 코드 리딩만).
2. 다크 상태가 3중(React state, `html.dark` 클래스, 루트 div 클래스) + localStorage. 첫 렌더 후 effect에서 클래스를 붙이므로 다크 사용자에게 흰 배경 플래시(FOUC) 가능. `prefers-color-scheme` 초기값 미반영.
3. 모든 요소에 `bg-white dark:bg-slate-900` 식 쌍 병기(485회) — 새 색 추가마다 두 벌 작성. 시맨틱 토큰(`--surface`, `--text-muted`)으로 바꾸면 `dark:` 대부분이 사라질 수 있음.
4. 사이드바는 다크 전용 색이라 라이트 모드에서 어두운 블록이 남음(의도일 수 있으나 토큰 체계 밖).
5. 하드코딩 hex(툴팁 `#0f172a`, 그리드 `#e2e8f0`)와 `darkMode` prop 분기가 혼재(AnalyticsView는 분기 없음).
6. 무효 클래스(2.2)의 상당수가 다크 전용 보정이라 다크 hover/보조 텍스트가 의도대로 안 나옴.
7. `index.html`: `<title>My Google AI Studio App</title>`, `<html lang="en">`(한국어 UI), `color-scheme` 메타 없음.

---

## 4. 슬롭 요소 (파일:줄)

**이모지(6곳)**
- `TaskBoard.tsx:70` `긴급 🔥` / `TaskList.tsx:64` / `TaskModal.tsx:472, 610, 729`(`긴급 (Urgent) 🔥`) / `TaskModal.tsx:1051` `축하합니다! … 🎉`

**가짜·장식 문구**
- `Sidebar.tsx:56` `v1.0.0 Stable`(실제 버전 아님) · `Sidebar.tsx:63` `메인 메뉴`(메뉴 1개 그룹에 그룹 라벨)
- `TaskModal.tsx:923-925` `실시간 동기화` 뱃지(실시간 아님, 3분 폴링) · `TaskModal.tsx:921` `(Workflow Diagram)`
- `TaskModal.tsx:932` "수동 작업 단계 변경" 옆 `Sparkles animate-pulse`(AI 기능 아님)
- `constants/initialData.ts` 전체: Sarah Chen/Marcus Johnson 등 가짜 활동(현재 미렌더)
- `index.html:6` `My Google AI Studio App`, `vite.config.ts` 주석(AI Studio)

**설명문(컬럼·섹션마다 제목 아래 부연)**
- `App.tsx:522-527` 뷰마다 부제(예: "워크플로우 단계를 시각적으로 관리하고 단계를 손쉽게 이동합니다.")
- `TaskBoard.tsx:106,115,124,133` 상태별 `desc` + 노출 `210-212`, `281-283`; 포털 화면 제목 `181-183`("단계를 선택하여 작업을 확인하세요"); `원 카드 하단 "단계 진입 ›"` `216`
- `TaskBoard.tsx:302-304` 빈 상태 "현재 이 워크플로우 단계에 할당된 작업 항목이 없습니다." (제목과 중복)
- `CouplingGraph.tsx:29`, `WeeklyChart.tsx:22`, `WatchedReposPanel.tsx:91-93`(이 둘은 실제 정보성이므로 유지 검토)
- `TaskModal.tsx:62` 플레이스홀더 "(추후 AI 분석에 반영됩니다)"

**장식적 그림자·테두리·모션**
- 우선순위 색 좌측 굵은 테두리+컬러 그림자: `TaskBoard.tsx:50-68`(`border-l-[5px]` + `shadow-emerald-500/5` 등 + urgent는 `ring-1 ring-red-500/20 shadow-md`), `TaskList.tsx:233`
- 컬러 그림자 버튼: `App.tsx:489`(`shadow-blue-600/20`), `Sidebar.tsx:48`(`shadow-blue-500/20`), `TaskBoard.tsx:289`, `TaskList.tsx:52`(`shadow-red-500/20`), `TaskModal.tsx:979,995,1011,1027`(`shadow-lg shadow-*-500/25 ring-4 scale-110`), `1046`(`shadow-lg shadow-emerald-500/10 animate-bounce`), `1063,1073`
- 호버 부유: `TaskBoard.tsx:194`(`hover:-translate-y-1 hover:shadow-md`), `217`(화살표 이동)
- 불필요한 pulse/ping: 긴급 뱃지 `TaskModal.tsx:609`, "대기 중" 뱃지 `634`, 변경 알림 점 `832-833`, 검토 중 버튼 점 `942`
- 모달 `backdrop-blur-sm`(346) / 완료 오버레이 `backdrop-blur-md`(1045)
- 카드 높이 고정 `h-[19.5rem]`(TaskBoard:326), 포털 카드 `h-72`(194) — 내용과 무관한 균일 카드
- 사이드바 활성: `border-r-4` 스트라이프(Sidebar:75), 브랜드 로고 `CheckSquare`를 파란 사각형에 넣은 제네릭 마크(48-50)
- 모든 아이콘 앞/버튼 앞에 lucide 아이콘 병기 — `lucide` 임포트 아이콘 다수가 텍스트를 반복(Calendar, ClipboardCheck, Eye 등)
- "AnalyticsView" KPI 카드: 아이콘 박스 + 대문자 mono 라벨 + 큰 숫자 4개(AnalyticsView:85-134) — 전형적 대시보드 템플릿

---

## 5. 접근성 현황

### 5.1 aria/role 집계 (전체 `*.tsx`)
`aria-label` 10, `aria-hidden` 5, `role="alert"` 3, `aria-pressed` 3, `role="status"` 2, `role="group"` 2, `role="button"` 2, `aria-labelledby` 2, `role="img"` 1, `role="dialog"` 1, `aria-live` 1, `aria-expanded` 1, `aria-busy` 1. (참고: `00-context.md`의 "0건"은 부정확 — 아래 분포 참고.)
- **있는 곳**: `architecture/*`(WeeklyChart·GroupCard·CouplingGraph·ArchitectureView 전부 `aria-pressed/expanded/label`, `focus-visible`, SVG 노드 `tabIndex`+Enter/Space 처리 → 이 영역만 접근성 설계됨), `WatchedReposPanel`(`role="dialog"`, 닫기/삭제 `aria-label`, 오류 `role="alert"`), `App.tsx:499` 토스트 `role="status"`.
- **없는 곳**: `TaskModal`(role/aria 0), `TaskBoard`, `TaskList`, `Sidebar`, `AnalyticsView`, `ActivityFeed`.

### 5.2 키보드·포커스
- **모달 포커스 관리 없음**: `TaskModal`에 `role="dialog"`/`aria-modal`, Esc 닫기, 포커스 트랩, 포커스 복귀, 오버레이 클릭 닫기 모두 없음. `Escape`/`onKeyDown` 핸들러는 전체에서 `CouplingGraph.tsx:62` 하나뿐. `WatchedReposPanel`도 `role="dialog"`만 있고 Esc·트랩은 없음(오버레이 클릭 닫기는 있음, 78).
- **마우스 전용 조작**: `TaskBoard.tsx:191-196` 포털 카드는 `<div onClick>`(button·tabIndex·role 없음) → 키보드로 상태 진입 불가. `TaskBoard.tsx:340-347` 카드 제목/설명 영역도 `<div onClick>`(상세는 별도 Eye 버튼으로 가능). `TaskList.tsx:229-236` 행 전체 `onClick`(행 안 Eye 버튼은 키보드 가능). 클릭 가능한 비버튼 요소는 grep 결과 이 3곳(+모달 오버레이).
- **포커스 표시**: `focus-visible` 사용은 architecture 4파일(합 5곳)뿐. 나머지는 `focus:ring-1 focus:ring-blue-500 outline-none`(입력) 또는 아무 처리 없음; `outline-none` 18곳(App 1, TaskList 3, CouplingGraph 1, WatchedReposPanel 1, TaskModal 12) 중 링으로 대체하지 않은 곳은 미확인.
- **아이콘 전용 버튼**: `title`만 있고 `aria-label` 없음 — App:470/480(감시 레포, 테마), TaskList:310/317, TaskBoard:414/422/431/441(상세/삭제/이동), TaskModal:664/887(리뷰·하위작업 삭제), 모달 닫기 `X`(406-411)는 title·label 모두 없음. 삭제 버튼 hover 시에만 노출(`opacity-0 group-hover/rev:opacity-100`, TaskModal:663, 886) → 키보드 포커스 시 `group-focus` 처리 없음.
- **폼 라벨**: TaskModal의 `<label>` 11개 중 `htmlFor`로 입력과 연결된 것 없음(`<label>`이 input 형제) → 스크린리더 연결 불확실. 리뷰 폼 라벨은 10px. TaskList 필터 라벨은 `<span>`(143, 160). 검색창(App:455)은 placeholder만.
- **상태 전달을 색에만 의존**: 우선순위(좌측 색선, 뱃지색), 상태(`getStatusStyle` 색 배경 select), 아바타(해시색), 차트 막대 — 텍스트 라벨이 함께 있는 곳도 있으나 카드 좌측선은 색만.
- **긴급 뱃지/알림 `animate-pulse`**: `prefers-reduced-motion` 처리 없음(`motion-reduce` 0건).
- 문서 `lang="en"`인데 본문은 한국어(`index.html:2`). 페이지 `<h1>`이 뷰마다 다름: 사이드바 `h1`(브랜드) + 뷰 `h2`; TaskBoard 포털은 또 `h1`(181) → 문서에 h1 중복.
- 색 대비(추측, 미측정): `text-slate-400`(121회)을 `bg-white`/`slate-50` 위 12px 이하 본문·설명으로 다수 사용(예: TaskBoard:210, 344, 설명문) → AA 4.5:1 미달 가능성 큼.

### 5.3 10px 이하 텍스트 위치 (`text-[9px]`/`text-[10px]`, 총 48곳; 9px 9곳, 10px 39곳)
- `AnalyticsView.tsx`: 90, 101, 112, 126 (KPI 라벨)
- `Sidebar.tsx`: 55, 63, 84 (버전 문구, 섹션 라벨, 배지)
- `PrBadge.tsx`: 12 (**9px** "PR" 뱃지)
- `ActivityFeed.tsx`: 44, 59 (미렌더)
- `GroupCard.tsx`: 45 (추세 뱃지)
- `TaskBoard.tsx`: 331(카테고리), 335(**9px** 우선순위 뱃지), 353, 358(**9px** 체크리스트 수), 378(**9px** 아바타 이니셜), 389, 392
- `TaskList.tsx`: 143, 160(필터 라벨), 247(**9px** 우선순위), 256, 294
- `TaskModal.tsx`: 378, 390, 397, 555, 577, 609(**9px**), 614, 629(**9px**), 634(**9px**), 645, 652(**9px**), 681, 698, 711, 722, 735(리뷰 폼 라벨 전부), 836, 923, 960, 986, 1002, 1018, 1032(스텝바 라벨), 1066, 1076
- 추가로 `text-[10.5px]`(TaskBoard:396), `text-[11px]` 28곳. 보기 모드 PR 대기·우선순위 같은 **핵심 정보**(우선순위 뱃지, PR 뱃지, 담당자 이니셜)가 9px.

---

## 6. 로직 구분

### 6.1 재사용 가능(UI와 무관, 그대로 `lib/`·훅으로 이동 가능)
| 로직 | 현재 위치 | 비고 |
|---|---|---|
| 상태 이동 `handleMoveTask`(낙관적 갱신 + PATCH + ETag 무효화) | App.tsx:176-198 | 보드·목록·모달(`handleStatusChangeAndRedirect`)이 각자 호출 방식이 다름. 단일 `moveTask`로 통일. 단, 실패 시 롤백 없음(console.error만) |
| 이전/다음 상태 계산 `moveLeft/moveRight` | TaskBoard.tsx:162-174 | 순수 함수. 상태 순서 배열 1개로 대체 가능 |
| 서버 반영 후 state 병합 `updateTaskInState`, subtask/review CRUD handler | App.tsx:302-416 | 이미 resource별로 분리됨. 훅(`useTasks`)으로 이동 가능 |
| 폴링+조건부 GET(ETag/Last-Modified) | `services/taskSync.ts` 60줄 | 그대로 유지 |
| PR 자동 동기화 `runPrSync` | App.tsx:94-129 | 로직은 재사용 가능, 화면 알림(`syncNotice`)과 결합돼 있어 분리 필요 |
| `postJson`(Idempotency-Key) | `services/apiClient.ts` | 유지(`TaskModal:161`이 이를 직접 호출하는 점만 정리) |
| 감시 레포 API·결과 포맷 | `services/integrationsApi.ts`(+test), `architectureApi.ts`(+test) | 유지 |
| 아키텍처 계산 | `architecture/utils.ts`(+test) | 순수 함수. 색 생성은 토큰 체계와 연동 필요 |
| 필터/정렬 | TaskList.tsx:90-117(상태·담당자·생성일 asc/desc), App.tsx:426-435(제목·설명·카테고리 검색) | 순수 함수로 추출 가능. 단 "내 것" 필터는 없음(`assigneeId` 자유 문자열) |
| 통계 집계 | AnalyticsView.tsx:12-41, App.tsx:160-168 `taskCounts` | 순수 함수. 같은 집계가 2곳에 중복 |
| 아바타 이니셜/색 해시 | TaskBoard:16-43 = TaskList:13-40 = TaskModal:24-51 (동일 3벌) | 즉시 통합 가능 |
| 우선순위 라벨/스타일 매핑 | TaskBoard:45-79(`getPriorityStyles`), TaskList:42-67, TaskModal 내 인라인 | 라벨('낮음/보통/높음/긴급')은 로직, 색은 디자인 → 라벨 매핑만 공용화 |
| `hasUnreflectedReview` 사용 | 서버 계산값을 읽기만(TaskModal:828) | 규칙 유지(서버 계산, UI에서 PATCH 금지). `handleAddReview`/`handleReplaceSubtasks`가 낙관적으로 true/false를 세팅하는 부분은 현행 유지 |
| 날짜 포맷 | `formatCreatedAt`(TaskModal:53), 인라인 `toLocaleDateString`(TaskBoard:400, TaskList:284), `utils.formatDate` | 통합 대상 |

### 6.2 UI와 분리해야 할 로직(현재 컴포넌트에 섞여 있음)
1. **TaskModal이 서버 상태의 복제본을 가짐**: `subtasks`, `roleReviews`를 prop `task`에서 복사한 로컬 state로 들고(94, 97) 낙관적 수정 → App의 `selectedTask`와 이중 진실. `task` prop이 바뀌면 effect가 전체 리셋(109-143)하여 입력 중이던 리뷰 텍스트가 폴링으로 날아갈 위험(`applyTasksFromServer`가 `selectedTask`를 교체, App.tsx:51-64).
2. **AI 체크리스트 호출이 모달 안에 있음**(150-197): 서비스 계층으로 이동. 생성 ID(`Date.now()`), 응답 검증, 오류 메시지도 함께.
3. **"모든 하위작업 완료 → 다음 단계 제안" 규칙**(254-259)이 `toggleSubtask` UI 핸들러에 내장 → 도메인 규칙(`shouldSuggestAdvance(subtasks, status)`)으로 분리.
4. **상태 전환 후 화면 이동**(`onNavigateToStatus`, 삭제 시 `'todo'`로 이동)이 모달→App 콜백으로 결합. 화면 이동 정책은 라우팅 계층 책임.
5. **낙관적 업데이트 + 실패 처리 부재**: 모든 handler가 `console.error`만 하고 UI 롤백/사용자 알림 없음(App 192-194, TaskModal 249-251, 270-282, 312-343). 오류 UX를 설계하려면 먼저 handler 계약(성공/실패 반환)을 정해야 함.
6. **오프라인 폴백이 콜백 안에 중첩**: `handleSaveTask`의 `catch`에서 로컬 임시 task(`'task-'+Date.now()`) 생성(App.tsx:280-296) → 서버 id와 충돌 가능, 정책 결정 필요(제거 vs 유지).
7. **App.tsx가 상태 컨테이너+컨트롤러+뷰를 모두 가짐**(590줄): 최소한 `useTasks`(데이터·mutation), `usePrSync`, `useTheme`로 분리하면 화면 개편 시 UI만 교체 가능.
8. **localStorage 이중 기록**: tasks를 서버+localStorage에 이중 저장(App:141, 305; taskSync:54) — 서버 우선 설계와 충돌(오류 시에만 읽음, 80-81). 개편 시 폴백 필요성 재판단.
9. **필터·정렬 상태가 컴포넌트 내부**(TaskList:75-78): URL/전역 상태로 올릴 때 순수 함수 추출 선행.
10. **"나" 개념 없음**(00-context P0): `assigneeId`가 자유 문자열이고 로그인 사용자·내 GitHub login과의 연결이 UI 어디에도 없음. 감시 레포에는 `githubLogin`이 있으나 보드의 "내 것" 필터와 연결되지 않음(WatchedReposPanel는 별도 모달). 이는 로직 설계가 필요한 항목이며 시각 디자인 이전에 결정 필요.

---

## 7. 디자인·구현 단계에 넘기는 요약

- **유지**: `taskSync`·`apiClient`·`integrationsApi`·`architectureApi`·`architecture/utils`(+테스트), 서버 계산 `hasUnreflectedReview`, `role="status"` 토스트, architecture 영역의 aria/키보드 구현, "그룹별 변경 흐름" 시각화(WeeklyChart/GroupCard/CouplingGraph).
- **제거 후보**: ActivityFeed+initialData+logActivity+미사용 import, TaskBoard 죽은 함수 2개, `v1.0.0 Stable`, 이모지 6곳, 컬러 그림자·좌측 굵은 테두리, `animate-pulse/ping/bounce`, "실시간 동기화"·Sparkles 장식, 무효 클래스 18곳, 뷰별 부제.
- **선결 확인 필요**: (1) `dark:` 변형이 `.dark` 클래스에 반응하는지(Tailwind 4 `@custom-variant` 부재) 실제 렌더 검증, (2) `animate-in`/`fade-in` 동작 여부, (3) `text-slate-400` 대비 실측, (4) `outline-none` 18곳 중 대체 포커스 표시가 없는 곳.
- **토큰화 입력치**: 색 의미 5축(상태 4 + 우선순위 4 + 오류 + 포커스/선택 + 표면/텍스트 단계), 타입 스케일(현재 9/10/10.5/11/12/13.5/14/16/18/20/24/30px 12종 → 6단계 이하로), 간격 스케일(4/8/12/16/24), 모서리 2종(예: 4/8), 그림자 0~1종(모달만).
