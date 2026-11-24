# 데이터 타당성 조사 (02)

범위: 읽기 전용 조사. 제품 코드는 수정하지 않았다. 경로는 `backend/` 또는 `frontend/src/` 기준이다. 추측은 "(추측)"으로 표시했다.

## 요약

| 질문 | 결론 |
|---|---|
| Q1 내가 리뷰어인 PR 모으기 | 부분 가능. 서버가 "내 리뷰 요청 PR"을 이미 Task로 만든다. 그러나 PR 메타데이터(요청자 외 전부)는 저장하지 않는다. "나"는 사람 단위가 아니라 감시 레포 단위로만 존재한다. 대기 시간은 `createdAt`으로 근사할 수 있다. 변경 규모와 내 승인 여부는 데이터가 없고 새로 가져와야 한다. |
| Q2 기능 영역 단위 | `ArchitectureView`의 파일 경로 기반 그룹이 가장 신뢰할 만하고 유지 비용도 0이다. 다만 지금은 Task/PR과 연결돼 있지 않다. 추천은 아키텍처 그룹을 영역으로 쓰고, PR이 건드린 파일 경로를 같은 `Locator`로 매핑해 연결하는 방식이다. |

## Q1. "내가 리뷰어로 지정된 PR" 데이터 현황

### 1-1. 현재 데이터 흐름

1. `WatchedRepo`는 `url`(unique), `owner`, `name`, `github_login`, `last_synced_at`을 가진다. `integrations/models.py:4-14`
2. `SeenPullRequest`는 `(repo, number)` 쌍만 저장한다. 목적은 삭제하거나 완료한 Task가 다시 생기지 않게 하는 것이다. `integrations/models.py:17-24`
3. `sync_review_requests()`가 모든 `WatchedRepo`를 순회한다. `integrations/pr_sync.py:43-58`
4. `_sync_repo`는 `repo.github_login`을 쓰고, 비어 있으면 서버 `GITHUB_TOKEN`의 `GET /user` 결과를 쓴다. `integrations/pr_sync.py:11`
5. 검색은 `is:pr is:open review-requested:{login} repo:o/n`, `per_page=100`이다. `integrations/github_client.py:58-79`
6. 새 PR마다 Task를 만든다. `integrations/pr_sync.py:25-38`
   - id는 `pr-{owner}-{name}-{number}`
   - title은 `[PR] #N 제목 (draft)`
   - description은 URL, `Author: x`, 안내 문구
   - `creator`는 PR 작성자, `category`는 `'Review'`, `status`는 `todo`
   - `source_url`은 PR URL
7. 호출 시점은 프론트의 마운트 시점과 3분 폴링, 그리고 수동 `POST /integrations/sync-prs/`이다. `App.tsx:100-128`, `views_prs.py:67-70`
   - 감시 레포가 0개면 건너뛴다. `App.tsx:106`

### 1-2. 항목별 현황

| 필요 데이터 | 있는가 | 근거와 비고 |
|---|---|---|
| 내 GitHub 로그인 | 부분 | `WatchedRepo.github_login`(레포 단위, 선택값)이 있다. 비면 서버 토큰 소유자 로그인이 쓰인다. 프론트의 `githubLogin`은 `WatchedReposPanel`에서 레포를 추가할 때만 입력받는다 (`WatchedReposPanel.tsx:32,53,98`). 사용자 단위 설정은 없다. |
| 리뷰 요청 여부 | 있음 (생성 시점만) | 검색 조건 자체가 `review-requested`다. Task에는 이를 나타내는 필드가 없다. 구분은 `category==='Review'` 또는 `sourceUrl` 유무(`PrBadge`)와 id 접두사 `pr-`에 의존한다. 이후 요청이 취소되거나 리뷰를 마쳐도 갱신되지 않는다 (`SeenPullRequest`가 재처리를 막는다). |
| PR 상태 (open/draft/merged) | 부분 | 검색 결과에는 `draft`가 있지만 title 문자열 ` (draft)`에만 섞여 들어간다 (`pr_sync.py:19`). 이후 상태 변화(머지, 닫힘)는 추적하지 않는다. 검색이 `is:open`이라 머지된 PR은 보이지 않을 뿐, 이미 만든 Task는 그대로 남는다. |
| 대기 시간 | 근사 가능 | 검색 결과의 `created_at`/`updated_at`(PR 생성 시각)은 `github_client.py:75-76`에서 가져오지만 버려진다. Task의 `createdAt`은 동기화 시각(최대 3분 지연)이다. "리뷰 요청된 시각"은 이벤트 API(`review_requested` timeline)가 필요하고 지금은 없다. 추측: 실용적으로는 PR `created_at`으로 대체해도 충분하다. |
| 요청자(PR 작성자) | 있음, 구조화 안 됨 | `Task.creator`와 description 문자열 `Author: x`에 있다. 직렬화에서 `assigneeId = task.creator or task.assignee_id`로 합쳐진다 (`tasks/serializers.py:44`). 즉 PR Task의 `assigneeId`는 담당자가 아니라 PR 작성자를 뜻한다. "내 것" 필터를 `assigneeId`로 만들면 의미가 반대가 된다. |
| 변경 규모 (additions/deletions/changed files) | 없음 | 검색 API(`/search/issues`)는 이 값을 주지 않는다. `GET /repos/{o}/{n}/pulls/{n}`이 필요하며 `github_client`에 해당 함수가 없다. |
| 내가 이미 승인했는지 | 없음 | `GET /pulls/{n}/reviews`가 필요하다. 로컬 `RoleReview.is_accepted`가 있지만 앱 안의 역할 리뷰이지 GitHub 리뷰와 무관하다 (`reviews/models.py:10`). 두 개념을 섞으면 안 된다. |
| PR이 건드린 파일 | 없음 (함수는 있음) | `GET /pulls/{n}/files`가 필요하다. 기존 `get_commit_files`는 커밋 단위 (`github_client.py:121-123`). |
| 레포/PR 번호 구조화 | 없음 | Task에 repo/number 컬럼이 없다. id 문자열 `pr-owner-name-N`과 `source_url`을 파싱해야 한다. owner/name에 `-`가 들어 있으면 id 파싱이 모호하므로 `source_url` 파싱이 안전하다 (추측). |

### 1-3. 눈에 띄는 구조적 한계

- **팀원 여러 명이 쓰는 모델이 아니다.** `WatchedRepo.url`이 unique다 (`models.py:5`). 같은 레포를 팀원 A와 B가 각자 login으로 등록할 수 없다. 두 번째 등록은 409다 (`views_prs.py:55-56`). 한 레포에는 `github_login`이 하나만 묶이므로, 사실상 "레포 하나 = 사람 하나"다.
- **Task는 전역 공유다.** `GET /tasks/`는 누구에게나 같은 목록을 준다. 어떤 PR Task가 누구의 리뷰 요청인지 구분하는 필드가 없다. 팀원 A의 요청으로 생긴 Task가 B의 보드에도 보인다.
- **PR 한 건에 Task 한 개다.** `SeenPullRequest(repo, number)`가 unique다. 한 PR에 리뷰어가 A와 B 둘이면 먼저 동기화된 한 사람의 몫으로만 생기고 다른 사람 몫은 `skipped`된다. 이 경우 두 사람 모두에게 "내 할 일"로 보일 수는 있지만, 개인별 상태(내가 승인함)를 담을 곳이 없다.
- **서버 토큰 한 개 전제.** `GITHUB_TOKEN`은 서버 환경변수다 (`github_client.py:25`). login을 비우면 토큰 소유자로 검색되므로 "내 것"이 토큰 주인 것이 된다.
- 위 항목들은 "여러 사람이 각자 로그인 없이 쓴다"는 목적 1과 구조적으로 충돌한다. 최소한 `viewer login`을 요청 단위로 전달하고, 팀 단위 감시 레포 목록과 사용자 로그인을 분리해야 한다.

### 1-4. "나"를 인증 없이 식별하는 현실적 방법

**권장: 브라우저 로컬 설정의 `githubLogin`** (예: `localStorage['githubLogin']`, 최초 1회 선택 또는 입력).

방식:
1. 첫 진입 시 "당신의 GitHub 로그인"을 입력받는다. 후보 목록은 `WatchedRepo.githubLogin`, PR 작성자(`Task.creator`), 커밋 `authors`(`ArchGroup.authors`)에서 뽑은 로그인으로 채우면 오타를 줄일 수 있다.
2. 값을 `localStorage`에 저장한다. 브라우저 단위이며 서버에는 저장하지 않는다. 기존 패턴은 `ArchitectureView.tsx`의 `REPO_URL_KEY`와 같다. 읽고 쓸 때 try/catch로 감싼다.
3. 프론트에서는 "내 PR" 필터에 쓴다. 서버가 필요하면 쿼리 파라미터(`?login=`)로 전달한다.

한계:
- **신원 증명이 없다.** 아무나 다른 사람의 login을 선택해 그 사람의 목록을 볼 수 있다. 내부 협업 도구이고 PR 정보는 GitHub에서 이미 팀에 공개된 정보라 위험은 낮다 (00-context 가정). 다만 쓰기 권한(상태 변경)과 연결하면 위조가 가능하다.
- 브라우저나 기기를 바꾸면 다시 선택해야 한다 (기기 간 동기화 없음).
- 로그인 대소문자와 오타 문제가 있다. GitHub login은 대소문자를 구분하지 않으므로 비교 시 소문자로 정규화한다.
- 서버가 알려면 요청마다 login을 보내야 한다. 서버에서 "내 것"을 계산하려면 폴링 ETag와 별개로 캐시 키에 login을 포함해야 한다.

대안과 비교:

| 방법 | 장점 | 단점 |
|---|---|---|
| 로컬 `githubLogin` (권장) | 구현 최소, 사용자 데이터 수집 없음 | 위조 가능, 기기별 설정 |
| 서버에 사용자 테이블 + 선택 쿠키 | 기기 간 공유 가능 | 인증 없는 계정이라 의미가 약하고 모델이 늘어남 |
| GitHub OAuth | 실제 신원 증명, 승인 여부 조회도 사용자 토큰으로 가능 | 범위가 큼. "인증 없음" 전제를 깨고 DB, 세션, 앱 등록이 필요 |
| 서버 `GITHUB_TOKEN` 소유자 | 이미 동작 | 한 명만 "나"가 됨 |

## Q2. 기능 영역(feature area) 단위

### 2-1. 후보별 현황

| 후보 | 데이터 위치 | 신뢰도 | 수작업 유지 비용 | 필요한 백엔드 변경 (최소) |
|---|---|---|---|---|
| A. `Task.category` | `tasks/models.py:17`, 직렬화 `serializers.py:43`. 폼은 자유 텍스트 `required` (`TaskModal.tsx:482`) | 낮음. 자유 입력이라 `Dev`/`Development`/`개발`이 갈린다. 기본값은 모달에서 `'Development'`/`'General'`로 엇갈린다 (`TaskModal.tsx:92,118`). PR 동기화 Task는 전부 `'Review'`라서 영역 정보가 아니라 작업 유형이다. | 높음. 팀원이 매번 일관되게 입력해야 하고 PR은 자동 생성이라 입력 기회조차 없다. | 영역으로 쓰려면 PR 동기화에서 category를 파일 경로 기반으로 채우거나 허용 값 목록을 만들어야 한다. 이 경우 후보 C와 같아진다. |
| B. 아키텍처 분석 그룹 (`architecture` 서비스, `ArchGroup`) | `integrations/architecture.py` `group_paths`/`Locator`, 응답 `ArchGroup` (`types/index.ts:73-85`), 엔드포인트 `GET /integrations/architecture/` (`views_arch.py`) | 중상. 디렉터리 규칙 기반이라 결정적이고 코드 구조를 반영한다. 반면 규칙이 휴리스틱이라 "기능"이 아니라 "폴더"에 가깝다. 모노레포 외 구조에서는 `Misc`/`Root`가 커질 수 있다 (추측). 현재 레포 하나 단위이며 기본 최근 30일, 커밋 최대 60개까지만 분석한다 (`activity.py:9`, `views_arch.py:22`). | 0. 사람이 유지할 것이 없다. 단 사람이 읽기 좋은 이름이 아니다 (`Integrations`, `Tasks` 등 폴더명이 그대로 나옴). | 현재는 Task/PR과 연결되지 않는다. 연결하려면 C 필요. 화면에서 분석할 레포 URL은 `ArchitectureView`가 `localStorage`에서 직접 받는다. 감시 레포 목록과 연동하지 않는다. |
| C. PR이 건드린 파일 경로 → B의 `Locator`로 영역 매핑 | 현재 없음. `GET /pulls/{n}/files`가 필요하다 (`get_commit_files` 유사). `Locator.__call__`이 삭제된 경로까지 매핑해 준다 (`architecture.py:181-209`) | 중상~상. 실제 변경 파일에서 나오므로 PR이 어느 영역에 영향을 주는지 사실을 말해 준다. PR 하나가 여러 영역에 걸치면 다중 소속이거나 주 영역 하나를 골라야 한다 (정책 필요). | 0 (자동). | 중간. 아래 3절 참고. `github_client`에 PR 파일 조회 함수 1개, Task에 영역 저장 필드(또는 PR 메타 모델) 추가. |
| D. 라벨 | 현재 없음. 검색 결과 `labels`를 `github_client.py:67-77`에서 버리고 있다 (GitHub 응답에는 존재) | 팀이 라벨 규칙을 지킬 때만 높음. 추측: 소규모 팀 레포는 라벨을 거의 안 쓴다. | 높음. 팀원이 PR마다 라벨을 붙여야 한다. | 낮음. `labels[].name`을 저장하는 것은 쉽지만 규칙이 없으면 빈 값이 된다. |

### 2-2. 비교 결론

- **신뢰도**: C(파일 경로) ≈ B(그룹) > D(라벨, 팀 규율 의존) > A(category)
- **유지 비용**: B와 C는 0이다. A와 D는 팀원이 매번 해야 한다. 소규모 팀에서는 입력 누락이 거의 확실하다.
- **연결성**: B는 "영역의 정의"를, C는 "PR/Task가 어느 영역에 속하는지"를 제공한다. 둘은 따로가 아니라 한 쌍이다.

### 2-3. 추천안

**영역 = 아키텍처 그룹(B), PR/Task와의 소속은 PR 변경 파일을 `Locator`로 매핑해서 계산(C).** `category`와 라벨은 보조 정보로만 쓴다.

근거:
1. 이미 구현된 규칙 엔진이 있다 (`group_paths`, `Locator`). 새 분류 체계를 만들지 않는다. `ArchitectureView`의 "그룹별 변경 흐름"이 목적 2의 씨앗이라는 00-context의 판단과도 맞는다.
2. 팀원이 라벨이나 category를 수작업으로 관리할 필요가 없다.
3. 영역별 진행 상황은 두 가지 신호로 구성할 수 있다. 어느 쪽도 새 입력이 필요 없다.
   - 코드 활동: `weekly`, `trend`, `lastChangeAt`, `authors` (이미 `ArchGroup`에 있음)
   - 작업 흐름: 그 영역에 속한 PR/Task의 `status`별 개수와 대기 시간 (C로 연결한 뒤 집계)

주의할 점 (과장하지 않기):
- 그룹 이름은 폴더명에서 나온다. 사용자가 "기능 영역"으로 이해하기엔 거칠 수 있다. 화면 표시용 별칭을 로컬 설정(예: `localStorage`)에 두는 선택지는 있지만 팀원 간 공유가 되지 않는다. 필요해지면 그때 서버 저장을 검토한다 (지금은 만들지 않는다).
- 아키텍처 분석은 레포 하나 단위이며 분석에 쓰는 커밋이 최대 60개다 (`activity.py:9`). 여러 레포를 감시하면 영역 ID가 레포마다 따로다 (`{repoKey}:{groupId}` 형태의 접두사 필요, 추측).
- 규칙 분류의 정확도는 실제 레포로 검증하지 않았다 (코드 리딩만).

## 3. 프론트가 쓸 수 있는 현재 API

모든 경로는 `/api/v1/` 아래다.

| 메서드 | 경로 | 용도 | 비고 |
|---|---|---|---|
| GET | `tasks/` | Task 목록 (roleReviews, subtasks, sourceUrl 포함) | ETag/Last-Modified 304 (`tasks/views.py:26-30`). 3분 폴링 (`taskSync.ts:5`) |
| POST | `tasks/` | Task 생성 | Idempotency-Key |
| GET/PATCH/DELETE | `tasks/<pk>/` | 단건 | 스칼라 필드만 |
| GET/POST/PUT | `tasks/<id>/subtasks/` | 체크리스트 | PUT은 전체 교체 |
| PATCH/DELETE | `tasks/<id>/subtasks/<sid>/` | 체크리스트 항목 | |
| GET/POST | `tasks/<id>/reviews/` | 앱 내 역할 리뷰 | 첫 리뷰 시 상태가 `inprogress`로 바뀐다 |
| PATCH/DELETE | `tasks/<id>/reviews/<rid>/` | | |
| POST | `generate-checklist/` | AI 체크리스트 | 저장하지 않는다 |
| GET | `integrations/watched-repos/` | 감시 레포 목록 (`githubLogin`, `lastSyncedAt`) | `views_prs.py:17-33` |
| POST | `integrations/watched-repos/` | 감시 레포 추가 | url unique, 중복이면 409 |
| DELETE | `integrations/watched-repos/<id>/` | 삭제 | |
| POST | `integrations/sync-prs/` | 수동 PR 동기화 -> `{created, skipped, errors}` | 결과에 PR 내용이 없다 |
| GET | `integrations/architecture/?url=&days=&refresh=` | 영역별 활동(`groups`, `couplings`) | 5분 서버 캐시, ETag (`views_arch.py:10-37`) |

활동 로그 `ActivityLog`는 모델만 있고 엔드포인트가 없다 (CLAUDE.md의 설명과 같다).

## 4. 추가가 필요한 API와 필드 (최소 범위)

우선순위는 Q1 완성, 그다음 Q2 연결 순서다.

### 4-1. 필수 (목적 1: 내 리뷰 PR 모으기)

1. **PR 메타 저장**: `SeenPullRequest`를 확장하거나(권장, 이미 repo+number를 가짐) 새 `PullRequestInfo`를 둔다.
   - 필드: `author`, `title`, `html_url`, `draft`, `pr_created_at`(대기 시간), `additions`, `deletions`, `changed_files`, `state`(open/closed/merged), `last_checked_at`
   - 채우는 곳: `pr_sync._sync_repo`. 검색 결과에 이미 있는 값(`author`, `created_at`, `draft`)은 추가 호출 없이 저장 가능하다. 변경 규모는 PR당 `GET /pulls/{n}` 호출이 1회 추가된다.
2. **내 승인 여부**: `GET /repos/{o}/{n}/pulls/{n}/reviews`에서 `login`의 최신 `state`(APPROVED, CHANGES_REQUESTED, COMMENTED)를 읽는다. 사용자별 값이므로 PR 모델에 저장하지 말고 요청 시점 `viewer login` 기준으로 계산하거나, `(pr, reviewer_login)` 단위로 저장한다. 호출 수가 많아지므로 동기화 때 한 번에 가져와 저장하는 쪽이 현실적이다 (추측).
3. **Task 응답에 PR 정보 노출**: `serialize_task`에 `pr: {repo, number, author, draft, state, waitingSince, additions, deletions, changedFiles}`를 선택 필드로 추가한다 (PR Task에만 값이 있다). `types/index.ts`의 `Task`도 맞춘다. 문자열 `Author:` 파싱과 title의 `(draft)` 의존은 없앤다.
4. **사용자별 구분**: 둘 중 하나가 필요하다. 필수 변경은 아니지만 없으면 팀 전체에서 "내 PR"이 안 나뉜다.
   - 안 1(권장, 작음): PR 정보에 `requested_reviewers`(login 목록)를 저장하고 프론트가 로컬 `githubLogin`으로 필터한다. 동기화는 감시 레포마다 `review-requested:{login}` 한 번이 아니라, 레포의 열린 PR 전체에서 `requested_reviewers`를 읽는 방식(`GET /pulls?state=open`)으로 바꿔야 한다.
   - 안 2: `WatchedRepo`의 `url` unique를 `(url, github_login)` unique로 풀고 PR 한 건에 여러 Task를 허용한다. 모델 변경이 더 크다.
5. **감시 레포와 로그인 분리**: `github_login`은 사용자 설정이어야 한다. 감시 레포 단위 필드로 두면 한계가 계속된다. 최소 대응은 안 1처럼 PR에 요청된 리뷰어 목록을 저장하는 것이다.
6. 리뷰 요청이 취소되거나 PR이 닫히거나 머지되면 Task 상태가 자동으로 정리되도록, 동기화 때 `state`를 갱신한다 (현재는 갱신 경로가 없다).

### 4-2. 영역 시각화 (목적 2)

1. **PR 변경 파일 -> 영역**: `github_client`에 `get_pull_files(owner, name, number)` 함수 1개를 추가한다 (`GET /pulls/{n}/files`, 페이지네이션 주의). 매핑은 `Locator`를 재사용한다.
2. **영역 요약 엔드포인트** (프론트 단순화를 위해 권장): `GET /integrations/areas/?repo=<url>` -> 영역별 `{id, name, kind, lastChangeAt, trend, weekly[], openPrs, waitingPrs, maxWaitingHours, doneTasks}`. 기존 `architecture` 응답에 `prs` 요약만 덧붙이는 방법도 있다. 신규 엔드포인트가 없어도 프론트에서 `architecture`와 `tasks`를 합쳐 계산할 수는 있지만, PR-영역 매핑은 서버(`Locator`)에서만 가능하다.
3. 영역 이름 별칭은 지금 만들지 않는다 (필요가 확인될 때 추가).

### 4-3. 선택 (우선순위 낮음)

- 라벨 저장: 검색 응답의 `labels` 보존. 팀이 라벨을 쓰는 경우에만 의미가 있다.
- `ActivityLog` 엔드포인트 노출 (현재 활동 피드는 `localStorage` 전용).
- 감시 레포 목록 -> `ArchitectureView` 자동 연결 (지금은 URL을 직접 입력).

## 5. 사용자 결정이 필요한 점

1. 같은 PR에 리뷰어가 여러 명일 때, 팀원 각자에게 "내 할 일"로 보여야 하는가 (안 1)? 아니면 PR당 한 건으로 충분한가?
2. "대기 시간"의 기준은 PR 생성 시각으로 충분한가, 아니면 리뷰 요청 시각이 꼭 필요한가 (후자는 추가 API 호출이 필요함)?
3. 영역 이름이 폴더명 그대로여도 괜찮은가?
