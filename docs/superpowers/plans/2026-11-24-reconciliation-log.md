# 계획 조정 로그 (2026-11-24)

7개 계획이 서로 독립적으로 쓰여 생긴 불일치 중, **이미 승인된 결정(`docs/ux/00-context.md` 1~35)만으로 해결되는 것**만 고쳤다. 제품 코드(`frontend/`, `backend/`)는 건드리지 않았다. 약칭: foundation = `frontend-foundation`, contract = `api-contract`, backend = `backend-review-queue`, queue = `screen-review-queue`, area = `screen-area-flow`, tasks = `screen-all-tasks`, settings = `screen-settings`.

## 1. 변경 내역

| # | 파일 · 태스크 | 무엇을 | 왜(근거) |
|---|---|---|---|
| 1 | foundation Global Constraints, T1 | 라우터는 HashRouter, 라우터 생성부는 `main.tsx` 한 곳, `window.location.hash`·`#` 앵커 직접 사용 금지, 실제 주소는 `/#/me` 형태로 명시. `renderWithRouter`는 **테스트 전용 `MemoryRouter`**임을 명시(이름·시그니처 불변). T1에 `test/dialogStub.ts`(jsdom용 `showModal/close` 스텁) 추가 | 결정 27, 28 |
| 2 | foundation T9 | 수동 `Dialog`(포털·`inert`·`useFocusTrap`)를 네이티브 `<dialog>.showModal()` 기반으로 재작성. `<Dialog>` props(`open, onClose, title, role, initialFocusRef, size`)는 유지해 T13 등 소비 계획 변경 불필요. 스텁이 못 흉내 내는 Tab 가둠·Esc 실동작은 이벤트 직접 발행 + T16 수동 검증으로 분리. `hooks/useFocusTrap.ts` 삭제 | 결정 28 |
| 3 | foundation T10 | `main.tsx`는 `<HashRouter>`, `App()`은 라우터를 포함하지 않음(테스트는 MemoryRouter). 스킵 링크가 `href="#main"`이면 HashRouter에서 라우트가 바뀌므로 `preventDefault`+`focus()`로 처리. Step 4의 SPA 폴백 curl(`/tasks/abc`)을 `/` + `/#/tasks/abc` 새로고침 확인으로 교체. 커밋 문구에 HashRouter 반영 | 결정 27 (딥링크 문구 파급) |
| 4 | foundation 리뷰 포커스·T16 수동 검증, 말미 질문 절 | 딥링크 예시를 `/#/…`로. `BrowserRouter` 참조 금지 가드 추가. 말미 "사용자 결정이 필요한 질문" 4개를 확정(27~30)으로 교체 | 결정 27~30 |
| 5 | foundation T2, T10, T16 · area T7(책임 확정) | foundation이 `ArchitectureView.tsx`·`architecture/*`를 수정하지 않도록 변경: T2의 직접 `localStorage`/`REPO_URL_KEY` 교체 삭제, T16의 `animate-pulse` 제거 삭제, T10은 `AreasScreen`에서 그대로 감싸기만, T16 가드는 두 경로를 검사에서 제외. 삭제는 area T7 단독 책임(area 충돌 목록 2·3번을 해결 표기) | 사용자 지시 3 (area T7이 삭제) |
| 6 | foundation T4, Global Constraints | `isPrTask(t: Pick<Task,'id'\|'kind'>)`로 변경: `kind` 우선, 없으면 `id` 접두사 `pr-`, `sourceUrl`로 판정하지 않음. 테스트를 id/kind 기준으로 재작성. `Task.kind?`/`author?` 타입 추가를 T4(`types/index.ts`)가 소유 | contract §6 `kind`(id 접두사)가 기준, 사용자 지시 4 |
| 7 | tasks T1 | `types/index.ts`·`lib/taskLabels.ts` 수정 삭제(foundation T4가 소유), `isPrTask`·`kind`·`author`는 소비만. 테스트(l)와 실행 명령 정리. 충돌 목록 1·2·5번과 질문 2를 해결/미결로 갱신 | 사용자 지시 2, 4 |
| 8 | contract §6 | `kind`는 `pr-` 접두사 id일 때만 `pr`(기존의 "또는 PR URL" 삭제 — backend T11·tasks와 일치). **`author` 필드 추가**: PR Task는 작성자 GitHub 로그인(알 수 없으면 `""`), 수동 Task는 `null`. 미러 중단 시점을 "프런트 화면 배포 후"로 | 결정 33 |
| 9 | backend T11 | `author` 직렬화(PR: `task.creator`, 수동: `None`) 및 테스트 2건(`author=='alice'`/수동 `None`, creator 빈 값이면 `''`), 제목·커밋 메시지·파일표·DECISIONS 항목에 반영 | 결정 33 |
| 10 | foundation T13 | `TaskSummary`의 PR "작성자" 값 출처를 `task.author`로 명시 | 결정 33 (PR Task `assigneeId`는 `""`) |
| 11 | contract §3, backend T2·T5·T7·T8·T9·T10·T12·상수·파일표 | **서버 논리 삭제·`restore` 엔드포인트·`deleted_at`·`WatchedRepo.active()`·24시간 보관 제거**. 삭제는 즉시 실삭제, 되돌리기는 클라이언트의 10초 지연 DELETE. 관련 테스트(`test_restore_*`, `test_post_same_url_revives…`, `test_alias_survives_repo_soft_delete…` 등) 삭제·단순화 | 결정 30 ("서버 소프트 삭제는 이번 범위 밖"; settings T5는 이미 지연 DELETE 사용) |
| 12 | queue Global Constraints·T4·T6·T8 | 그룹명 "내가 리뷰함 · 작성자 응답 대기"를 **"작성자 응답 대기"**로(변경 안내 문구·요약·테스트 포함) | 결정 16 |
| 13 | foundation T7, queue T2 | `SyncStatusInfo`/`toSyncStatus`/`mockSyncStatus`의 export 위치를 `services/syncStatus.ts`로 명시, queue의 "위치 불명(`?`)" 표기 해소 | 이름 소비 일관성 |
| 14 | settings T1·T2·T6, queue 제약·T1, area T1 | 헬퍼·타입 소유 정리: `test/routeFetch.ts` = settings T2 소유(다른 계획은 재사용, 먼저 필요하면 같은 시그니처로 생성), `AreaAlias` = `types/areas.ts`(area T1 소유, settings는 import만), `getMyTeams`/`STORAGE_KEYS.myTeams` = settings T1(queue T1의 조건부 임시 추가는 settings가 교체, 중복 정의 금지) | 사용자 지시 5 |
| 15 | foundation·contract·backend 헤더 | 참조 결정 범위 "1~26"을 "1~35"로 | 결정 27~35 반영 |
| 16 | settings 수동 검증 | `/#/me` 주소 표기 | 결정 27 |

테스트 헬퍼 파일명 충돌 점검 결과: 같은 경로를 두 계획이 만드는 경우는 없었다(`test/routeFetch.ts`는 settings만, `test/fixtures/reviewQueue.ts`는 queue만, `test/setup.ts`·`render.tsx`·`dialogStub.ts`는 foundation만). 위 14번은 이름 중복 방지를 위한 소유권 명시다.

## 2. 보류 (승인 대기 — 계획에 적힌 그대로 둠)

| 항목 | 현재 계획의 상태 | 위치 |
|---|---|---|
| 영역 상세의 '걸친 PR' 필드를 계약에 추가 | contract §4.2에 없음. area가 PR마다 §4.3을 호출해 보완 | area T4·T6, 질문 1·2 |
| Task API에 `areaId` 추가 | 없음. tasks가 영역 열·필터를 만들지 않음 | tasks 충돌 3, 질문 2 |
| '요청자 vs 작성자' 표시 | 모든 화면이 "작성자"로 표시 | queue 질문 1, tasks Global Constraints |
| 실패 배너 위치 | 제목 줄 바로 아래 `RepoFailureBanner` | queue 질문 2 |
| 영역 요약의 첫 레포 정책 | 빈 큐 영역 요약은 성공 이력 있는 첫 레포 | queue T8, 질문 3 |
| 사이드바 대기 배지 | 미구현(`reviewBadge` prop만) | foundation T10, queue 질문 4 |
| recharts 제거 여부 | area T7이 제거를 포함, foundation T5는 그때까지 유지 | area T7, 질문 3 |
| 로그인 후보 엔드포인트 | 없음, `githubLogin` 응답 값으로만 칩 | settings T4·T7 |
| 테마의 '시스템 설정 따르기' 모드 | 만들지 않음(밝게/어둡게만) | settings T8 |
| 로그인 변경 확인 방식 | 확인 대화상자 없음 + 오타 안전장치(인라인) | settings T4·"하지 않은 것" |
| 시각 방향(10-visual-direction.md)·토큰 실제 값 | 임시값 `/* TEMP: Impeccable */`, 토큰 이름만 | foundation T3 |

## 3. 남은 불일치 (사용자 결정이 필요하거나 이번 범위 밖)

1. `describeRepoError`/`RepoErrorView`/`formatClock`이 queue(`lib/reviewQueue.ts`, 필드 `headline/detail/retry`)와 settings(`lib/repoCopy.ts`, 필드 `title/body/canRetry`)에 시그니처가 다르게 이중 정의됨. 같은 07 §3.2 표를 구현하므로 한쪽으로 통합하는 것이 좋으나 어느 쪽을 기준으로 할지 승인되지 않아 두었음. 레포 상태 타입도 중복(`RepoSyncState`/`RepoError` vs `QueueRepoStatus`/`QueueRepoError`).
2. queue T7의 `services/areaSummaryApi.ts`가 area T1의 `fetchAreas`와 같은 엔드포인트를 중복 호출함. queue 계획이 "area가 정의하면 교체·삭제"로 적어 두었으나 실행 순서가 정해지지 않음.
3. foundation T10이 `/areas`에 임시로 `ArchitectureView`를 연결하는 동안(area T5 이전), 이 파일의 직접 `localStorage` 접근은 래퍼 규칙 밖이다(저장소 차단 시 `/areas`에서 예외 가능성은 추측이며 미확인). 두 계획 사이에 `/areas`가 공개되지 않도록 순서를 맞추는 것이 안전.
4. `foundation T11`의 `TasksScreen`/`TaskList`/`TaskBoard`는 tasks 계획이 덮어씀(의도된 선행 관계). foundation T11 테스트 (c)는 tasks T7이 대체함은 tasks 계획에 이미 기록됨.
5. 백엔드 Task 13(미러 중단)과 프런트 전환 시점은 결정 33에 따라 "화면 배포 후"로 정리했으나 tasks 질문 1(전체 작업의 PR 행 출처)은 미결.
6. 백엔드 `PullRequest`·`AreaAlias`의 `repo` FK cascade는 즉시 삭제로 바뀐 §3에서도 유지됨(연결 해제 시 PR 이력·별칭 소실). 결정 30 범위에서는 허용되나 별칭 보존이 필요하면 별도 결정 필요.

## 4. 2차 조정 결과

보류 11건과 남은 불일치 6건은 `2026-11-24-execution-overview.md`에서 결정 36~40으로 모두 해소·이관했다(미결 질문 4건만 그 문서 6절에 남음).
