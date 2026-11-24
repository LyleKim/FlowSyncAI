# 실행 개요 (2차 조정·검수, 2026-11-24)

7개 계획(`api-contract`, `backend-review-queue`, `frontend-foundation`, `screen-review-queue`, `screen-area-flow`, `screen-all-tasks`, `screen-settings`)을 확정 결정 1~40 기준으로 다시 맞추고, 추적표와 실행 순서를 만든 문서. 제품 코드(`frontend/`, `backend/`)는 수정하지 않았다. 약칭: F=foundation, B=backend, Q=queue, A=area, T=all-tasks, S=settings, C=contract. `F-T7`은 foundation의 Task 7.

## 1. 복구 내역 (이전 에이전트 중단분)

이전 에이전트는 "global sed, contract and backend edits" 중에 멈췄다. 7개 파일을 처음부터 끝까지 읽고 확인한 결과:

| 점검 | 결과 |
|---|---|
| 코드블록 짝(펜스 개수), 표 열 수, 반쯤 치환된 이름, 중복 섹션 | **깨진 곳 없음.** 코드블록 펜스는 모든 파일에서 짝수, 표는 잘리지 않음 |
| `api-contract` | 완결. 결정 37(§4.2 `waitingPullRequests`에 `primaryAreaId/isPrimary/touchedAreas/unmapped/filesTruncated`)·결정 40(후보 로그인 엔드포인트 없음)·결정 30(서버 소프트 삭제 없음)이 이미 반영됨. §4.3 머리말이 "실행 개요의 미결 질문"을 가리킴(→ 6절 Q1에 기록) |
| `backend-review-queue` | 완결. Task 10에 `waiting_prs_for_area`·테스트 `test_detail_includes_pr_touching_non_primary_area`·`test_detail_waiting_prs_rules`, Task 12 ⑨가 이미 있음. 헤더의 결정 범위 "1~40"도 맞음 |
| 나머지 5개 계획 | sed 흔적 없음. 단 결정 36~40은 **반영되지 않은 상태**(아래 2절에서 반영) |
| 정리 | 이전 에이전트의 임시 스크립트(`scratchpad/c.py`, `e1.py`, `g.sh`)는 제품 파일이 아니므로 그대로 둠. 계획 파일에 남은 변경은 없었으므로 되돌린 것도 없음 |

복구 결론: 복원할 손상은 없었고, 이전 에이전트가 끝낸 계약·백엔드 부분은 그대로 유지했다. 이번 변경은 모두 "최소 수정"(문장·시그니처 단위)이다.

## 2. 변경 요약

### A) 보류 항목 반영 (결정 36~40)

| 결정 | 반영 | 위치 |
|---|---|---|
| 36 시각 방향 채택·사용자 렌더 확인 | **신규 F-T17**: 토큰 임시값 교체, Pretendard 자가 호스팅, 남은 `dark:` 쌍 치환, 외부 URL 0건 테스트, 사용자 스크린샷 승인 전 머지 금지. F-T16 가드에 외부 CDN 0건(g2) 추가 | F-T17, F-T16 |
| 37 걸친 PR 필드·recharts 제거·임시값 | 계약·B는 이미 반영. **A에서** `usePrAreas`·`fetchPrAreas`·`PrAreas`·§4.3 호출 삭제, `WaitingPr`에 계약 필드 추가, `WaitingPrTable`이 응답만으로 그림(테스트에서 네트워크 모킹 제거), 충돌 4·질문 4개 해소. recharts 제거는 A-T7 단독으로 확정(F-T5에 명시) | A-T1/T4/T6, F-T5 |
| 38 전체 작업 | Global Constraints에 "새 PR은 큐에서만, 기존 PR Task 유지, 영역 열·필터 없음" 명시. `TasksEmptyAll` 문구·링크를 `/me`로(레포 연결 안내 삭제). 질문·충돌 3 해소. 계약 §6에 "`areaId` 추가 안 함", B-T12에 DECISIONS ⑩ | T-T6/T-Global, C §6, B-T12 |
| 39 큐 | 작성자 표시·한 줄 요약 + 실패 시에만 아래 상세는 기존 구조 확인(질문 해소). `EmptyQueueAreaSummary`에 `repoName` 추가("{레포} 기준이에요"). **사이드바 배지 신규**: `ReviewQueueProvider`(앱 전역 1 인스턴스)·`useReviewBadge`(초안 제외 대기 수, 0이면 숨김)·테스트, F-T10의 `Sidebar`/`useReviewBadge` 자리표시 | Q-T3/T7/T8, F-T10 |
| 40 설정 | 테마 모드 `system|light|dark`를 F-T3 `useTheme`에 추가(OS 변경 `change` 반응, `html.dark`·FOUC 스크립트 동일 규칙), S-T8에 "시스템 설정 따르기" 라디오. 설정의 로그인 변경은 즉시 저장 + 10초 되돌리기(첫 실행은 이전 값이 없어 기존 확인 단계 유지). 후보 엔드포인트 미추가는 이미 반영 | F-T3, S-T4, S-T8 |

### B) 남은 불일치 해소 (소유 계획을 하나로)

| 항목 | 소유 | 나머지 |
|---|---|---|
| `describeRepoError`/`RepoErrorView`/`formatClock`/`formatFetched` | **F-T7**의 `lib/repoCopy.ts`(시그니처는 S의 `title/body/canRetry/retryDisabledReason/adminCopy/canDisconnect` 채택) | Q-T2에서 삭제하고 Q-T6 배너가 import, S-T3은 이관 스텁 |
| `RepoSyncState`/`RepoError`/`RepoErrorKind`, `QueueRepoStatus`/`QueueRepoError` 중복 | **F-T7**의 `types/repoSync.ts` | Q는 `RepoSyncState` 사용(자체 정의 삭제), S-T2는 import |
| 영역 요약 API 중복(`areaSummaryApi` vs 영역 API) | **A-T1**의 `services/areasApi.ts` | `areaSummaryApi.ts` 삭제, Q-T7은 `fetchAreas(repoId,30)` 사용, S-T6은 `fetchAreas`·`fetchAreaAliases` 사용(`listAreaPaths`·`listAreaAliases` 삭제) |
| 레포별 동기화 호출(`requestRepoSync`·`syncRepo`·`syncNow`) | **F-T7**의 `usePrSync.syncNow(repoId?)`+`syncPullRequests(repoId?)` | Q-T3 `retryRepo`는 `syncNow(id)`, S-T5 행 재시도도 `syncNow(id)`, `requestRepoSync`·`syncRepo` 삭제 |
| `/areas` 임시 구간 | F-T10이 구 `ArchitectureView`를 연결하지 않고 자리표시만 둠 → 직접 `localStorage` 접근 노출 구간이 사라짐. 대신 **릴리스 게이트**(A-T5 전 배포 금지, 5절) | A-T5가 교체, A-T7이 삭제 |
| 내 로그인/팀 읽기 | **S-T1**의 `useMyLogin`/`useMyTeams` | Q(`getMyTeams` 임시 추가 삭제)·T(`getMyLogin`)가 훅 사용 |
| 큐 상태의 앱 전역 공유 | Q-T3 `ReviewQueueProvider` | `MyReviewsScreen`과 사이드바가 한 인스턴스 공유(중복 요청 방지 테스트 포함) |
| 로그의 기타(3-4,3-5,3-6) | 3-4(F-T11을 T가 덮어씀)는 의도된 선행 관계, 3-5(T 질문 1)는 결정 38로 해소, 3-6(FK cascade로 연결 해제 시 PR 이력·별칭 소실)은 6절 위험으로 이관 |

### C) 검수에서 고친 것

- Q: 한국어 조사 오타 "작성자 응답 대기으로"→"대기로"(문구 상수·테스트 2곳), `useReviewQueue`가 로그인뿐 아니라 `teams`를 받도록 시그니처 정리, 질문 절 해소, 선행 조건에 S-T1·A-T1·F-T7 명시. 헤더(Goal/Architecture/Tech/Spec/Global Constraints/Review Focus)와 Review Focus 5건에 대응하는 테스트가 모두 있는지 확인함(1=T3(f)·T8(o), 2=T4·T8(k), 3=T6·T7·T8, 4=T6(b)·T5(h)·T9 수동, 5=T2·T5(e)(f)).
- F: `isStorageAvailable` 등 기존 매핑 유지, 외부 CDN 0건 가드 추가, 스펙 커버리지 줄에 결정 36·40.
- 계획 간 이름: `syncNow` 시그니처(F-T7, Q-T3, S-T5·T7·T8 일치), `RepoSyncState`(F-T7, Q, S), `fetchAreas`(A-T1, Q-T7, S-T6), `useMyLogin`(S-T1, Q-T3·T8, T-T2·T7), `ROUTES.me`(F-T10, T-T6).
- 접근성·용어 가드는 F-T16·Q-T9·T-T8·S-T8·A-T7에 이미 각자 있음(중복이지만 파일 범위가 달라 유지).

## 3. 소유권 한눈에

| 산출물 | 소유 | 소비 |
|---|---|---|
| `types/repoSync.ts`, `lib/repoCopy.ts`, `services/syncStatus.ts`, `usePrSync.syncNow(repoId?)` | F-T7 | Q, S |
| `useTheme`(mode) | F-T3 | S-T8 |
| `isPrTask`, `Task.kind/author` 타입 | F-T4 | T, Q |
| `useMyLogin`/`useMyTeams`, `storage.myTeams`, `onStorageChange` | S-T1 | Q-T3, T-T2/T7, S 전부 |
| `test/routeFetch.ts` | S-T2 | Q, A(선택) |
| `types/areas.ts`, `services/areasApi.ts`(영역 GET·별칭 GET) | A-T1 | Q-T7, S-T6 |
| 별칭 쓰기(POST/PATCH/DELETE) | S-T6 | — |
| `ReviewQueueProvider`, `useReviewBadge` 실구현 | Q-T3 | F-T10(자리표시), AppShell |
| `ArchitectureView`·`architecture/*` 삭제, recharts 제거 | A-T7 | — |
| `TaskModal` 삭제 | F-T16 | — |
| 시각 토큰 실제 값·폰트 | F-T17 | 전부(토큰 이름만 사용) |

## 4. 추적표

표기: 구현 / 검증(테스트·수동). 태스크 ID는 위 약칭.

### 4.1 여정·화면 요구사항 (05)

| 항목 | 구현 | 검증 |
|---|---|---|
| J1 처음 설정(첫 사람·합류자·E1·E5) | S-T7(`FirstRunGate/Flow`), S-T4, S-T5, B-T8(409 `existing`), B-T7(`knownLogin`) | S-T7 (a)~(n), B-T8, B-T7 |
| J2 리뷰어의 하루 | Q-T1~T8, B-T3~T7 | Q-T8 (a)~(q), B-T7 |
| J3 영역 진행 파악 | A-T1~T6, B-T9/T10 | A-T5/T6 테스트, B-T10 |
| J4 오류·빈 상태·복구 | Q-T6/T7, S-T5, F-T6/T7, A-T5 | 각 계획의 상태 테스트 |
| S-A 첫 설정/로그인 | S-T4, S-T7 | S-T4, S-T7 |
| S-B 연결된 레포 관리 | S-T5 | S-T5 (a)~(n) |
| S-C 내 리뷰 큐 | Q-T5/T6/T8 | Q-T8 |
| **S-D PR 행 펼침 상세(영역 칩)** | **미구현(의도적 보류).** 데이터는 B-T10(`include=areas`)이 준비 | 6절 Q2 |
| S-E 영역 개요 | A-T5 | A-T5 |
| S-F 영역 상세 | A-T6 | A-T6 |
| S-G 동기화·상태 표시 | F-T7(`SyncStatusLine`), Q-T8 | F-T7, Q-T8(f)(g) |
| S-H 설정 | S-T8(+F-T12 골격) | S-T8 |

### 4.2 07의 P0와 결정 20 설계 제약

| 항목 | 구현 | 검증 |
|---|---|---|
| P0 조용한 동기화 실패 | B-T5(`lastError/lastSuccessAt`), F-T7, Q-T2(`aggregateSyncStatus`)/T6/T8 | B-T5, F-T7(b), Q-T8(f)(g)(j) |
| P0 100개 잘림 | B-T3(250 페이지네이션+`truncated`), Q-T6(+50건 렌더 캡) | B-T3 `test_pagination_and_truncation`, Q-T6(b), Q-T8 |
| P0 낙관적 갱신 롤백 | F-T6, 소비: F-T11/T14/T15, T-T3/T7 | F-T6 (a)(b)(f), T-T7(i) |
| P0 키보드 큐 조작 | Q-T5/T6/T8 | Q-T8(n), Q-T9 가드, Q-T9 수동 |
| P0 대화상자 포커스·Esc | F-T9, F-T13 | F-T9(b)(c)(d), F-T13(a)(b), F-T16 수동(Tab 가둠) |
| 20-1 좁은 폭 320~420 | 모든 화면 | Q-T9, T-T8, A-T7, F-T16, S-T8 수동 |
| 20-2 화면별 URL 딥링크 | F-T10(HashRouter), T-T1(쿼리 직렬화), A-T2 | F-T10 (a)(b), T-T1, A-T2 |
| 20-3 CSS 토큰 테마 | F-T3, F-T17 | F-T3 `tokens.test`, F-T17 `tokenValues.test` |
| 20-4 localStorage 래퍼+try/catch | F-T2, S-T1 | F-T2, F-T16 가드(d), A-T7 가드 |
| 20-5 REST 계약 안정·CDN 제거 | C(계약 문서), F-T16(g2), F-T17 | 가드 테스트(F-T16 g2, F-T17 c) |

### 4.3 결정 1~40

| 결정 | 구현 | 검증 |
|---|---|---|
| 1 "나"=로그인 저장 | F-T2, S-T1/T4 | S-T1, S-T4 |
| 2 다중 리뷰어 PR×리뷰어 | B-T4/T7 | B-T4, B-T7 |
| 3 영역=아키텍처 그룹, PR→영역 | B-T9/T10, A | B-T10 |
| 4 정리(분석 탭·피드·폴백) | F-T5, F-T16 | F-T5 가드 |
| 5 영역별 활동 흐름+대기 수·최장 대기 | B-T10, A-T3/T5 | A-T3, A-T5 |
| 6 첫 메뉴 "내 리뷰 요청", 수동 작업은 전체 작업 | F-T10, T | F-T10 |
| 7 별칭 서버 저장·연결 끊김 | B-T9, S-T6, A-T5 | B-T9, S-T6(b), A-T5(f) |
| 8 빈 큐 → 영역 요약 | Q-T7/T8 | Q-T8(h) |
| 9 용어 변경 | F Global, F-T16 가드 | F-T16 가드(e) |
| 10 라우터·App 분해 | F-T10 | F-T10 |
| 11 팀 서버 공유(unique, 레포별 login) | B-T8, S-T5/T7 | B-T8, S-T7(b) |
| 12 PR 수동 이동 제거, draft 숨김, 정리됨 7일 | F-T11/T13, T-T3, Q-T2/T6, B-T7 | F-T11(e), T-T3, Q-T8(d), B-T7 |
| 13 코멘트 리뷰 잔류 조사 | B-T1(+B-T7은 비의존 설계) | B-T7 `test_comment_review_*`, B-T1 [쓰기 실측 게이트] |
| 14 요청 시각 기준·GraphQL | B-T3/T4 | B-T3, B-T4 |
| 15 `lastSuccessAt/lastError/truncated` | B-T5/T7 | B-T5, B-T7 |
| 16 라벨 변경 | Q Global, A Global | Q-T8, A-T5(c)(e), 가드 |
| 17 10초 되돌리기 | F-T8, 소비: F-T11/T13, S-T5/T6/T4 | F-T8, S-T5(h)(i), S-T4(d0) |
| 18 320px | 전 화면 | 위 20-1 |
| 19 상태 변경 select, 드래그 금지 | T-T3/T5 | T-T3, T-T5(g) |
| 20 이식 제약 | 위 4.2 | 위 4.2 |
| 21 확장 개발 범위 밖 | 해당 없음(`09-`으로 답변 완료) | — |
| 22 결합 그래프→순위 목록 | A-T5 `CouplingRanking`, A-T6 | A-T5, A-T6 |
| 23 "리뷰 대기 중, 활동 없음" | A-T2/T5/T6 | A-T5(c), A-T6(q) |
| 24 동기화 상태 한 곳 | F-T7/T12, Q-T8 | F-T12(d), Q-T8(f), S-T8(e) |
| 25 Impeccable 훅 지적 처리 | F-T17 | F-T17 |
| 26 구현은 서브에이전트, 보고만 | 5절 웨이브 | — |
| 27 HashRouter | F-T1/T10 | F-T10 Step 4, F-T16 가드(f2) |
| 28 네이티브 `<dialog>` | F-T1/T9 | F-T9(a)~(g), F-T16 수동 |
| 29 전체 작업 기본 목록 | F-T11, T-T1 | T-T7(a) |
| 30 10초 지연 DELETE | F-T8, T-T7, S-T5 | F-T8(b), S-T5(h) |
| 31 내 팀 입력 → `teams` | S-T1/T4, Q-T3(`useMyTeams`), B-T7 | S-T4, B-T7 `test_team_requests_only_with_teams_param` |
| 32 걸친 PR은 주 영역에만 집계 | B-T10, A-T6 | B-T10, A-T6(b) |
| 33 PR Task `assigneeId=""`, `author`, 미러 중단 | B-T6/T11/T13, C §6, F-T4 | B-T11 |
| 34 동기화 호출 주체 현행+30초 쓰로틀 | B-T5, F-T7 | B-T5 `test_second_call_within_30s_is_throttled` |
| 35 테스트 레포·게시 전 확인 | B-T1 Step 3(게이트) | 5절 [외부 게시] 표시 |
| 36 시각 방향 채택·재검토 | F-T17(+PRODUCT.md 검토는 5절 게이트) | F-T17 Step 4 |
| 37 걸친 PR 필드·recharts 제거 | C §4.2, B-T10, A-T1/T6/T7 | B-T10(3건), A-T6, A-T7 가드(b) |
| 38 새 PR은 큐에서만, `author`, 필터 "출처", `areaId` 없음 | B-T11/T13, T, C §6 | T-T3~T7, B-T11 |
| 39 큐 표시 | Q-T5/T6/T7/T8/T3 | Q-T5(a), Q-T6, Q-T8(h)(q) |
| 40 설정 | S-T4/T8, F-T3 | S-T4(d0), S-T8(c), F-T3 |

빈 곳 점검 결과: 결정 36(F-T17)·외부 CDN 가드(F-T16 g2)·사이드바 배지(Q-T3)가 추가한 태스크이고, S-D만 의도적 보류(6절 Q2)이다.

## 5. 실행 순서

백엔드(B)는 프런트와 파일이 겹치지 않아 처음부터 병렬. 프런트 계획은 F를 뼈대로 한다. 웨이브 안의 항목은 서브에이전트에 병렬로 맡길 수 있다(같은 열 "충돌 파일"이 겹치는 항목은 직렬).

| 웨이브 | 병렬 가능 항목 | 건드리는 파일 영역(충돌 주의) | 선행 |
|---|---|---|---|
| **W0 (백엔드, 프런트와 병행)** | B-T1(**[외부 게시] Step 3 제외 부분만**), B-T2, B-T11 → B-T3, B-T8, B-T9 → B-T4, B-T10 → B-T5 → B-T6, B-T7(큐 훅은 B-T10 후 마무리) → B-T12 | `backend/integrations/*`(`urls.py`는 5/7/9/10이 각자 한 줄 추가: 줄 병합 충돌만 해결), `backend/tasks/*`(B-T11), `docs/DECISIONS.md`·`CLAUDE.md`(B-T12) | 없음(B 내부 그래프는 B 계획 참고) |
| W1 | F-T1 | `package.json`, `vite.config.ts`, `frontend/src/test/*` | 없음 |
| W2 | 체인 {F-T2 → F-T3 → F-T4 → F-T5} ∥ F-T6 ∥ F-T7 ∥ F-T8 ∥ F-T9 ∥ A-T1 | 체인: `lib/storage.ts`, `taskSync.ts`, `index.css`, `index.html`, `App.tsx`, `Sidebar.tsx`, `TaskBoard/TaskList/TaskModal.tsx`, `types/index.ts` / F-T6·F-T8·F-T9: 새 `hooks/`·`components/common/` 파일 / F-T7: `integrationsApi.ts`, `services/syncStatus.ts`, `types/repoSync.ts`, `lib/repoCopy.ts` / A-T1: `types/areas.ts`, `services/areasApi.ts` | W1 |
| W3 | F-T10 ∥ S-T1(F-T2 후) ∥ S-T2(F-T7 후) ∥ {Q-T1 → Q-T2} ∥ Q-T4 | F-T10: `App.tsx`, `main.tsx`, `routes.tsx`, `Sidebar.tsx`, `screens/*` 스텁 / S-T1: `lib/storage.ts`(F-T2가 끝난 뒤), `hooks/useMyLogin` / S-T2·Q-T1/T2/T4: 새 파일 | W2 전부(F-T10은 F-T2~T9 전부) |
| W4 | F-T11 ∥ F-T12 ∥ F-T13 ∥ {A-T2 → A-T3} ∥ A-T4 ∥ Q-T3 ∥ Q-T5 ∥ Q-T6 ∥ Q-T7 ∥ T-T1 → {T-T3, T-T6} ∥ (T-T2는 S-T1 후) | F-T11: `TasksScreen/TaskBoard/TaskList` / F-T12: `SettingsScreen`, `MyReviewsScreen`, `components/settings/{MyLoginForm,ConnectedReposSection}`, `WatchedReposPanel` 삭제 / F-T13: `components/task/*`, `routes.tsx` / Q-T3: `App.tsx`(1줄), `hooks/useReviewBadge.ts` / 나머지 새 파일 | W3. **같은 파일 충돌 쌍:** F-T11↔T-T4/T5(`TaskBoard/TaskList` — T는 F-T11 이후), F-T12↔S-T4/T5, F-T12↔Q-T8 |
| W5 | F-T14 ∥ F-T15(`TaskDetailDialog.tsx` 삽입 지점 병합) ∥ A-T5 ∥ A-T6 ∥ S-T4 ∥ S-T5 ∥ S-T6 ∥ T-T2 ∥ T-T4 ∥ T-T5 ∥ Q-T8 | F-T14/15: `components/task/*` / A-T5: `AreasScreen`, `components/areas/*` / A-T6: `AreaDetailScreen`(파일 분리) / S-T4: `MyLoginForm`, `SettingsScreen.test` / S-T5: `ConnectedReposSection` / S-T6: `services/areaAliasesApi`, `AreaNamesSection` / T-T4/T5: `TaskList`, `TaskBoard` / Q-T8: `MyReviewsScreen(.test)` | W4(Q-T8은 Q-T3~T7 전부+F-T12, S-T6은 A-T1) |
| W6 | S-T7 ∥ S-T8 ∥ T-T7 ∥ Q-T9 ∥ A-T7 | S-T7: `routes.tsx`, `AppShell.tsx`, `components/firstrun/*` / S-T8: `SettingsScreen` / T-T7: `TasksScreen` / A-T7: 구 `ArchitectureView`·`architecture/*`·`architectureApi` 삭제, `package.json` | W5 |
| W7 (문서·마무리, **직렬**) | F-T16 → A-T7의 문서 부분 → T-T8 | `CLAUDE.md`, `docs/DECISIONS.md`를 F-T16·A-T7·T-T8·B-T12가 모두 편집 → **한 번에 하나씩, 날짜 항목은 아래에 추가만** | W6, F-T11~15 |
| W8 | F-T17 | `index.css`, `public/fonts`, 남은 `dark:` 파일 | W7 + **사용자 렌더 승인 게이트** |
| 게이트 후 | B-T13(미러 중단) | `backend/integrations`, 마이그레이션 | 프런트 배포 + 사용자 승인 |

### 5.1 사용자 확인이 필요한 항목(외부 게시·승인 게이트)

| 항목 | 이유 |
|---|---|
| **[외부 게시] B-T1 Step 3**: `https://github.com/LyleKim/FlowSyncAI`에 PR 생성·리뷰 제출·코멘트(미확인 1~4 실측) | 외부에 게시되는 동작. 실행 전에 사용자에게 다시 확인(결정 35). 승인 전에는 "실측 불가(미승인)"로 기록하고 B-T1의 읽기 전용 부분(introspection, 쿼리 응답 저장)만 수행. 읽기 전용 조회는 허용 |
| B-T1 Step 2 `GITHUB_TOKEN`·`gh auth` 사용 | 토큰 값을 문서·로그에 쓰지 않음 |
| F-T17 | 사용자가 렌더 결과를 본 뒤 승인(결정 36) |
| `PRODUCT.md`(루트, 인터뷰 없이 추론) | 커밋 전 사용자 검토(결정 36) |
| B-T13 | 프런트가 큐로 전환·배포된 뒤 사용자 승인 |
| 릴리스 게이트 | A-T5 완료 전에는 `/areas`가 자리표시이므로 배포 금지 |

## 6. 남은 위험·미결 질문

**미결 질문 (사용자 결정 필요)**

1. **Q1: 계약 §4.3 `GET …/pull-requests/<n>/areas/`를 삭제할까?** 결정 37로 프런트 소비자가 없다. B-T10이 구현·테스트하고 있다. 추천: 삭제(B-T10 테스트 `test_pr_areas_endpoint`와 뷰 제거).
2. **Q2: S-D(PR 행 펼침·영역 칩)를 이번 범위에 넣을까?** 현재 어느 계획에도 없다. `include=areas` 서버 기능(B-T7/T10)만 만들어지고 프런트 소비가 없다. 추천: 이번엔 제외하고 `include=areas`는 유지(비용 낮음) 또는 함께 보류.
3. **Q3: 미러 중단 후 기존 PR Task의 낡음.** 결정 38로 기존 PR Task는 유지되지만 B-T13 이후 머지·닫힘이 반영되지 않는다. 추천: B-T13에서 마지막 한 번 `done` 처리 동기화 후 중단.
4. **Q4: 사이드바 배지 수의 기준.** 초안 제외(기본 화면의 "리뷰 대기 N건"과 같은 수)로 정했다. 초안 포함으로 바꿀지.

**위험**

- 화면 계획 5개의 Interfaces가 서로를 참조하므로 W2~W5에서 이름이 어긋나면 `npm run lint`(tsc)로 즉시 드러난다. 각 웨이브 끝에 `npm test && npm run lint && npm run build`를 돌린다.
- `CLAUDE.md`·`DECISIONS.md` 편집이 4곳에 걸쳐 충돌하기 쉽다(W7 직렬로 완화).
- F-T17: Pretendard 서브셋 설치 경로·용량은 미확인(10 §2.1). `npm pack`이 막히면 시스템 폰트 폴백만으로 동작.
- 연결 해제 시 `PullRequest`·`AreaAlias` FK cascade로 PR 이력·별칭 소실(조정 로그 3-6). 결정 30 범위에서는 허용, 별칭 보존이 필요하면 별도 결정.
- 설정의 로그인 되돌리기는 `useUndo.schedule`을 "즉시 적용+되돌리기"로 쓰는 변형이다(commit은 no-op). `useUndo` 계약이 바뀌면 S-T4가 영향을 받는다.
- `ApiError`(S-T2)와 `AreasApiError`(A-T1)가 서로 다른 오류 클래스로 공존한다. 동작 문제는 없고 통합은 후속 정리.
- Q-T3의 `ReviewQueueProvider`는 로그인이 있으면 어느 화면에서든 3분마다 큐를 폴링한다(배지 때문). 서버 부하는 304와 쓰로틀로 제한됨.
- 모든 수동 검증(Q-T9, S-T8, A-T7, T-T8)은 백엔드 완료 후에만 가능. 백엔드 없이는 "미검증"으로 보고.
- 이 문서는 계획의 정합성만 점검했고 실행 검증은 하지 않았다(코드 없음).
