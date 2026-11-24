# 리뷰 큐 · 영역 백엔드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `2026-11-24-api-contract.md`의 REST 계약(내 리뷰 요청 큐, 레포별 동기화 상태, 팀 공용 연결 레포, 영역·별칭·PR→영역 매핑)을 구현한다.

**Architecture:** 서버가 레포당 GraphQL 쿼리 1개로 열린 PR(리뷰어·내 최신 리뷰·규모·파일·요청 시각)과 최근 머지/닫힘 PR을 가져와 `PullRequest*` 테이블에 저장하고, "내 것" 판정은 읽기 시점에 `login`으로 거른다. 큐 그룹 판정은 GitHub 요청 목록 잔류 여부(08 미확인)가 아니라 `요청 시각 vs 내 최신 리뷰 시각`으로 계산한다. 영역은 기존 `architecture.py`의 `group_paths`/`Locator`를 재사용하고, PR 파일은 저장해 두었다가 읽을 때 매핑한다.

**Tech Stack:** Django 4.2(DRF 없음, 손으로 쓴 view + `@api_view`), `requests`로 GitHub GraphQL, Django `TestCase`(unittest 러너).

**Spec:** `docs/ux/00-context.md`(확정 결정 1~40), `docs/ux/01-strategy.md`, `docs/ux/02-data-feasibility.md`, `docs/ux/03-current-ui-inventory.md`, `docs/ux/04-information-architecture.md`, `docs/ux/05-user-journeys.md`, `docs/ux/06-wireframes.md`, `docs/ux/07-fortify-include-review.md`, `docs/ux/08-research-github-review-requests.md`, `docs/ux/09-orca-hedr-extension-research.md`. 계약: `docs/superpowers/plans/2026-11-24-api-contract.md`(이 계획의 테스트가 인용하는 기준).

## Global Constraints

- DRF 금지. 새 엔드포인트는 `@api_view` + `@require_http_methods` view, JSON 변환은 모듈 안 `serialize_*` 함수(camelCase)로 직접 한다. 오류는 `api.http.json_error`(+`code` 키 추가).
- GET은 `api.http.conditional_json_response`(ETag/304). 응답 본문에 경과 시간·응답 생성 시각을 넣지 않는다(ETag 안정성). POST 생성은 `api.idempotency`의 `replay_idempotent_response`/`finalize_idempotent_response`, scope 문자열은 엔드포인트마다 고유(`integrations:<리소스>:POST`).
- `docs/DECISIONS.md`의 기존 항목을 고치지 않는다. 새 결정은 **날짜(2026-11-24)를 붙여 아래에 추가**한다. 특히 "`RoleReview`/`ActivityLog`는 Task에 FK 없음" 결정은 건드리지 않는다(새 모델의 FK는 `integrations` 내부 `WatchedRepo`/`PullRequest`뿐).
- GitHub 호출은 `integrations/github_client.py`만 한다(테스트는 `mock.patch('integrations.github_client.requests.get/post')` 또는 이 모듈 함수 patch). 토큰은 서버 `GITHUB_TOKEN`; GraphQL은 토큰 필수.
- 레포는 팀 공용(`WatchedRepo.url` unique 유지), 로그인은 개인(읽기 시점 `login` 파라미터). `github_login` 컬럼은 삭제하지 않는다(폐기 예정, 동기화에 쓰지 않음).
- GraphQL 응답에 `errors`가 있으면 `data`가 부분적으로 와도 **그 레포 동기화는 실패 처리**하고 저장하지 않는다.
- 상수: 열린 PR 상한 레포당 250(페이지 50 × 최대 5), 최근 머지/닫힘 조회 30건, PR 파일 저장 상한 100, 동기화 최소 간격 30초, 별칭 이름 최대 80자, 큐 보관 기본 7일(1~30).
- 제품 코드의 시각은 `django.utils.timezone`(USE_TZ=True), 응답은 UTC `Z`. 로그인 비교는 소문자(`login_key`).
- 테스트 실행: **pytest 아님.** `cd backend && python manage.py test <label> --settings=config.settings_test`(sqlite in-memory). 현재 환경엔 Django가 없을 수 있다: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` 후 `.venv/bin/python`을 쓴다. 베이스라인(`python manage.py test --settings=config.settings_test`)이 통과한 뒤 시작한다.
- 각 Task는 한 커밋. 커밋 메시지는 저장소 관례(한국어 허용, `feat:`/`fix:`/`refactor:`/`docs:` 접두사).

## Review Focus

각 줄의 테스트는 소유 Task에 들어 있다.

1. 로그인 `Minji-Park `(대소문자·공백)과 `minji-park`가 같은 사람으로 처리되는가 — Task 7.
2. 코멘트만 남긴 리뷰 후 요청 목록에 **남아 있는** 경우와 **빠진** 경우가 같은 `group`(`awaiting_author`)을 내는가, 재요청 후엔 다시 `waiting` — Task 7.
3. 오래 방치된 뒤 첫 동기화에서 추적 중이던 PR이 열린 목록에도 "최근 닫힘 30건"에도 없을 때 개별 조회로 머지/닫힘을 반영하는가 — Task 4.
4. 한 레포가 실패(권한·한도·GraphQL 부분 오류)해도 다른 레포는 저장되고, 실패 레포의 직전 데이터는 지워지지 않으며 `lastSuccessAt`이 앞으로 가지 않는가 — Task 5.
5. 작성자가 삭제된 계정(`author: null`), 봇·삭제된 리뷰어, 파일 0개/삭제만 있는 PR, 파일 100개 초과, 직접+팀 중복 요청에서 500이 나지 않는가 — Task 3/4/7.
6. 업그레이드 직후 과거 PR 수십 건이 한 번에 `closed`가 되어도 `closedWithinDays` 밖은 큐에서 제외되고, 첫 동기화가 같은 PR을 두 번 만들지 않는가 — Task 4/7.

---

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `backend/integrations/models.py` (수정) | `WatchedRepo` 필드 추가, 신규 `PullRequest`, `PullRequestReviewer`, `PullRequestReview`, `AreaAlias` | 2 |
| `backend/integrations/migrations/0003_*.py` | 위 스키마(자동 생성) | 2 |
| `backend/integrations/github_client.py` (수정) | `GitHubError.kind/reset_at`, GraphQL `fetch_repo_pull_requests`, `get_pull_files`는 만들지 않는다 | 3 |
| `backend/integrations/pr_ingest.py` (신규) | 정규화된 스냅샷 → DB upsert, 요청 취소·상태 갱신 | 4 |
| `backend/integrations/pr_sync.py` (재작성) | 레포 단위 claim/쓰로틀/오류 기록/저장 오케스트레이션 | 5 |
| `backend/integrations/views_sync.py`, `urls_sync.py` (신규) | `POST sync-prs/` | 5 |
| `backend/integrations/task_mirror.py` (신규) | 레거시 PR→Task 미러(상태 갱신 버그 수정) | 6 |
| `backend/integrations/review_queue.py`, `views_queue.py`, `urls_queue.py` (신규) | 큐 계산·엔드포인트 | 7 |
| `backend/integrations/views_prs.py` (수정) | 연결 레포 CRUD(상태 필드, 409 `existing`) | 8 |
| `backend/integrations/areas.py` (신규) | 트리·그룹 캐시, `pathPrefix`, 별칭 적용, PR→영역 매핑 | 9, 10 |
| `backend/integrations/views_aliases.py`, `urls_aliases.py` (신규) | 별칭 CRUD | 9 |
| `backend/integrations/views_areas.py`, `urls_areas.py` (신규) | 영역 목록/상세, PR→영역 | 10 |
| `backend/integrations/activity.py`, `views_arch.py` (소폭 수정) | 캐시된 경로 재사용 | 10 |
| `backend/tasks/serializers.py`, `services.py`, `views.py` (수정) | `kind`, `author`, PR Task `assigneeId`, `?kind=` | 11 |
| `backend/scripts/probe_github_review_semantics.py`, `docs/ux/08-probe-results.md`, `backend/integrations/testdata/*.json` | 08 미확인 실측 | 1 |
| `docs/DECISIONS.md`, `CLAUDE.md` (수정) | 날짜 붙은 결정 추가, 테스트·URL 표 갱신 | 12 |
| 각 Task의 `backend/integrations/tests_*.py` | 테스트(기존 `tests.py`/`tests_prs.py`/`tests_arch.py`와 같은 폴더) | 각자 |

`integrations/urls.py`에는 Task 5/7/9/10이 각자 `path('', include('integrations.urls_xxx'))` 한 줄씩 추가한다(병렬 시 충돌은 모든 줄을 남기는 것으로 해소).

---

### Task 1: 08 미확인 항목 실측 + GraphQL 응답 고정

**Files:**
- Create: `backend/scripts/probe_github_review_semantics.py`, `docs/ux/08-probe-results.md`, `backend/integrations/testdata/graphql_repo_prs.json`

**Interfaces:**
- Produces: (a) `graphql_repo_prs.json` — 실제 GraphQL 응답 1건(공개 레포, 열린 PR 2~3건 + `recent` alias). Task 3/4의 테스트 픽스처. (b) `08-probe-results.md` — 아래 항목별 "확인됨/아님/실측 불가"와 근거 명령. 필드명이 계획의 쿼리와 다르면 이 파일이 정답이며 Task 3이 따른다.

이 Task는 제품 로직을 바꾸지 않는다. 결과가 어떻든 큐 로직은 의존하지 않도록 설계돼 있다(Task 7). 결과는 `requestedAt`/`reRequested` 문구와 쿼리 필드 이름만 바꾼다.

- [ ] **Step 1: 스크립트 작성.** `python backend/scripts/probe_github_review_semantics.py --schema <owner/name>`는 읽기 전용 GraphQL 호출만 하고, 아래를 출력한다: (i) `PullRequest.reviewRequests`/`latestReviews`/`timelineItems(itemTypes: REVIEW_REQUESTED_EVENT)`와 `ReviewRequestedEvent.createdAt/requestedReviewer` 필드 존재(introspection `__type`), (ii) `Repository.pullRequests(states:, orderBy:)` 인자, (iii) 위 필드를 쓰는 계획의 쿼리(Task 3 본문과 동일)를 해당 레포에 실행한 원본 응답을 `testdata/graphql_repo_prs.json`으로 저장(토큰 문자열이 들어간 헤더는 저장하지 않는다), (iv) `rateLimit{cost remaining resetAt}` 비용, (v) 응답에 `ETag` 헤더가 오는지와 `If-None-Match` 재요청이 304인지(미확인 7).
- [ ] **Step 2: 실행** `GITHUB_TOKEN=... python backend/scripts/probe_github_review_semantics.py --schema <공개 레포>` 기대: 위 5개 항목이 표로 출력, 파일 생성.
- [ ] **Step 3: 쓰기 실험 [외부 게시 동작 — 사용자 확인 필요, 결정 35] (실행 전에 반드시 사용자에게 다시 확인).** `https://github.com/LyleKim/FlowSyncAI`에 PR 생성·리뷰 제출·코멘트를 올리는 단계라 에이전트가 임의로 하지 않는다. 사용자가 승인하기 전에는 이 Step을 건너뛰고 "실측 불가(미승인)"로 기록한다. 토큰 값은 문서·로그에 쓰지 않는다. 승인된 경우에 한해 테스트 레포에서 사람이 하는 절차를 스크립트가 `--guide`로 안내만 하고, 각 단계 뒤 `GET .../requested_reviewers`와 GraphQL `reviewRequests`를 비교 출력한다: ① `COMMENT` 리뷰 제출 후 요청 목록 잔류(미확인 1) ② 재요청 시 재등장과 새 `ReviewRequestedEvent`(미확인 2) ③ 팀 요청 후 팀원 1명 리뷰 시 팀 요청 잔류(미확인 3) ④ 팀 멤버 API 필요 권한(미확인 4). 테스트 레포·토큰이 없으면 "실측 불가"로 기록하고 진행한다.
- [ ] **Step 4:** `docs/ux/08-probe-results.md`에 항목 1~8을 08의 번호 그대로 "결과 / 근거(명령·응답 발췌) / 설계 영향" 3열로 기록한다. 08 원문은 수정하지 않는다.
- [ ] **Step 5: 베이스라인 확인** `cd backend && python manage.py test --settings=config.settings_test` 기대: 기존 테스트 전부 통과(실패가 있으면 기록만 하고 이후 Task에서 건드리지 않는다).
- [ ] **Step 6: Commit** `git add backend/scripts docs/ux/08-probe-results.md backend/integrations/testdata && git commit -m "docs: GitHub 리뷰 요청 동작 실측 결과와 GraphQL 응답 픽스처 추가"`

---

### Task 2: 모델과 마이그레이션

**Files:**
- Modify: `backend/integrations/models.py`
- Create: `backend/integrations/migrations/0003_*.py`(makemigrations 산출물), `backend/integrations/tests_models.py`

**Interfaces:**
- Produces(모두 `integrations.models`):
  - `WatchedRepo`에 추가: `last_attempt_at: DateTimeField(null)`, `last_error_kind: CharField(20, blank)`, `last_error_message: TextField(blank)`, `last_error_reset_at: DateTimeField(null)`, `truncated: BooleanField(default=False)`, `updated_at: DateTimeField(auto_now)`. `last_synced_at`은 **그대로 두고 "마지막 성공 시각"으로 쓴다**(컬럼·데이터 이전 없음). 서버 논리 삭제(`deleted_at`)·`restore`는 만들지 않는다(결정 30: 되돌리기는 클라이언트의 10초 지연 DELETE).
  - `PullRequest(repo FK→WatchedRepo related_name='prs', number, title, url, author, is_draft, state in {'open','merged','closed'}, pr_created_at, pr_updated_at, closed_at null, merged_at null, additions, deletions, changed_files, files TextField(JSON 리스트), files_truncated, synced_at auto_now)`, unique `(repo, number)`.
  - `PullRequestReviewer(pr FK related_name='reviewers', login, login_key(db_index), team_slug(blank, 'org/slug'), requested_at, is_active, removed_at null)`, unique `(pr, login_key, team_slug)`. 팀 요청 행은 `login=''`.
  - `PullRequestReview(pr FK related_name='reviews', login, login_key, state, submitted_at)`, unique `(pr, login_key)`(= 사람별 최신 1건).
  - `AreaAlias(repo FK related_name='area_aliases', path_prefix, display_name(80), created_at, updated_at auto_now)`, unique `(repo, path_prefix)`.
  - `SeenPullRequest`는 유지(Task 13 전까지 미러가 사용).

- [ ] **Step 1: 실패하는 테스트** `tests_models.py::ModelConstraintTests`: `test_watched_repo_url_still_unique`(IntegrityError), `test_pr_unique_per_repo_number`, `test_reviewer_unique_per_login_and_team`(같은 login 직접+팀 행 2개는 허용, 같은 (login, team) 중복은 IntegrityError), `test_alias_unique_per_prefix`, `test_cascade_delete_repo_removes_prs_reviewers_aliases`.
- [ ] **Step 2:** `python manage.py test integrations.tests_models --settings=config.settings_test` 기대: FAIL(모델 없음).
- [ ] **Step 3:** 위 시그니처대로 `models.py` 수정, `python manage.py makemigrations integrations --settings=config.settings_test`로 `0003` 생성. 기존 `WatchedRepo` 행은 새 컬럼이 null/빈 값으로 채워지는 것만 확인(데이터 마이그레이션 없음).
- [ ] **Step 4:** `python manage.py test integrations --settings=config.settings_test` 기대: 신규+기존 모두 PASS. `python manage.py makemigrations --check --settings=config.settings_test` 기대: "No changes".
- [ ] **Step 5: Commit** `git add backend/integrations && git commit -m "feat: PR·리뷰어·리뷰·영역 별칭 모델과 레포 동기화 상태 필드 추가"`

---

### Task 3: GitHub GraphQL 클라이언트와 오류 분류

**Files:**
- Modify: `backend/integrations/github_client.py`
- Test: `backend/integrations/tests.py`(기존 `ClientTests` 옆에 `GraphQLClientTests` 추가)

**Interfaces:**
- Consumes: Task 1의 `testdata/graphql_repo_prs.json`과 `08-probe-results.md`(쿼리 필드명의 기준).
- Produces:
  - `GitHubError(status, message, kind='unknown', reset_at=None)` — 기존 두 인자 호출은 그대로 동작. `kind in {'auth','rate_limit','not_found','upstream','unknown'}`. `reset_at: datetime|None`.
  - `fetch_repo_pull_requests(owner: str, name: str, tracked_open: Iterable[int] = (), max_open: int = 250, recent_closed: int = 30) -> dict` → `{'prs': [PRDict], 'truncated': bool}`. `prs`는 열린 PR + 최근 머지/닫힘 + `tracked_open` 중 앞의 둘에 없는 번호의 개별 조회(별도 쿼리, 없을 때만 호출) 합집합(번호 중복 제거).
  - `PRDict`: `number, title, url, author(str, 삭제 계정이면 ''), is_draft, state('open'|'merged'|'closed'), created_at, updated_at, closed_at, merged_at, additions, deletions, changed_files, files(list[str], 최대 100), files_truncated, review_requests: [{'kind':'user'|'team','login','team_slug','requested_at'}], latest_reviews: [{'login','state','submitted_at'}]`. 시각은 ISO 문자열 그대로(파싱은 Task 4).
  - 기존 `search_review_requested_prs`, `get_authenticated_login`은 Task 5가 호출을 없앤 뒤 같은 커밋에서 삭제한다(이 Task에서는 유지).

쿼리 형태(`github_client.py`의 모듈 상수 `PR_QUERY`): `repository(owner,name){ open: pullRequests(states:OPEN, first:50, after:$after, orderBy:{field:UPDATED_AT,direction:DESC}){ pageInfo{hasNextPage endCursor} nodes{...PRFields} } recent: pullRequests(states:[MERGED,CLOSED], first:$recent, orderBy:{field:UPDATED_AT,direction:DESC}){ nodes{...PRFields} } }`, `PRFields`는 `number title url isDraft state createdAt updatedAt closedAt mergedAt additions deletions changedFiles author{login} files(first:100){nodes{path} pageInfo{hasNextPage}} reviewRequests(first:30){nodes{requestedReviewer{__typename ... on User{login} ... on Team{slug organization{login}}}}} latestReviews(first:30){nodes{author{login} state submittedAt}} timelineItems(itemTypes:[REVIEW_REQUESTED_EVENT], last:30){nodes{... on ReviewRequestedEvent{createdAt requestedReviewer{...}}}}`. 열린 PR 페이지네이션은 `hasNextPage`가 거짓이거나 `max_open`에 닿을 때까지; 닿았는데 다음 페이지가 있으면 `truncated=True`. `requested_at`은 같은 리뷰어의 가장 늦은 `ReviewRequestedEvent.createdAt`(없으면 None).

- [ ] **Step 1: 실패하는 테스트**(모두 `requests.post` patch, 픽스처 JSON 사용):
  - `test_normalizes_fixture` — 픽스처에서 `number/author/files/review_requests[].requested_at/latest_reviews[]`가 위 `PRDict`로 정규화된다. `state`가 `MERGED`→`'merged'`.
  - `test_pagination_and_truncation` — 첫 페이지 `hasNextPage:true`를 `max_open=1`로 호출하면 `truncated is True`, 호출 수는 1; `max_open=250`이고 2페이지에서 끝나면 호출 2회, `truncated False`.
  - `test_ghost_author_and_null_reviewer` — `author: null`→`author==''`, `requestedReviewer: null`·`Bot`/`Mannequin` 타입 리뷰어는 `review_requests`에서 제외.
  - `test_files_truncated_flag` — `files.pageInfo.hasNextPage`→`files_truncated True`, `files` 길이 100.
  - `test_tracked_missing_triggers_single_extra_query` — `tracked_open=[9]`이고 9가 첫 응답에 없으면 `requests.post` 총 2회, 9가 응답에 있으면 1회.
  - `test_graphql_errors_array_raises` — HTTP 200에 `{"errors":[...], "data": {...부분}}`이면 `GitHubError`(부분 `data`는 버린다).
  - `test_error_kinds` — 401→`auth`, 403+`X-RateLimit-Remaining: 0`(`X-RateLimit-Reset` 에폭)→`rate_limit`+`reset_at` 설정, GraphQL `errors[0].type=="RATE_LIMITED"`→`rate_limit`, `NOT_FOUND`/404→`not_found`, 5xx→`upstream`, 그 외→`unknown`. 토큰 없으면 호출 전에 `GitHubError(401, ..., kind='auth')`.
- [ ] **Step 2:** `python manage.py test integrations.tests --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** 위 시그니처대로 구현. `_post_graphql(query, variables) -> dict`를 두어 헤더(`Authorization: Bearer`)·타임아웃(`TIMEOUT` 재사용)·오류 분류를 한 곳에 모은다. 기존 `_get`의 오류도 `kind`를 채운다(기존 메시지 문구는 바꾸지 않는다).
- [ ] **Step 4:** 같은 명령 기대: PASS(기존 `ClientTests` 포함).
- [ ] **Step 5: Commit** `git commit -am "feat: 레포당 GraphQL 쿼리로 PR·리뷰어·리뷰·파일을 가져오는 GitHub 클라이언트"` (테스트 파일 포함해 `git add` 먼저)

---

### Task 4: 스냅샷 저장(ingest)과 상태 갱신

**Files:**
- Create: `backend/integrations/pr_ingest.py`, `backend/integrations/tests_ingest.py`

**Interfaces:**
- Consumes: Task 2 모델, Task 3 `PRDict`.
- Produces: `ingest_prs(repo: WatchedRepo, prs: list[dict], now: datetime) -> IngestResult`, `IngestResult(created: int, updated: int)`(dataclass). `tracked_open_numbers(repo) -> list[int]`(DB에서 `state='open'`인 PR 번호; Task 5가 `fetch_repo_pull_requests(tracked_open=...)`에 넘긴다).

규칙(알고리즘이 시그니처로 정해지지 않는 부분):
- PR은 `(repo, number)`로 upsert. `files`는 JSON 문자열로 저장.
- 리뷰어: 스냅샷의 열린 PR에 대해 `(login_key, team_slug)` 단위로 upsert하고 `is_active=True`, `requested_at = review_request.requested_at or pr.created_at`(새 행) — 기존 행이 비활성→활성으로 돌아오면(재요청) `requested_at`을 새 값으로 갱신, 활성 상태가 유지되면 `requested_at`을 **바꾸지 않는다**(이벤트가 윈도 밖으로 밀려나도 안정). 스냅샷에 없는 기존 활성 행은 `is_active=False`, `removed_at=now`. 머지/닫힘 PR의 리뷰어 행은 그대로 둔다(큐의 "정리됨"이 사용).
- 리뷰: `latest_reviews`를 `(pr, login_key)`로 upsert(스냅샷에 없는 기존 행은 지우지 않는다). DISMISSED도 저장.
- 스냅샷에 PR이 아예 안 오면(= 빠진 PR) 건드리지 않는다. 상태 전환은 PR이 `merged/closed`로 다시 와야 반영된다 — 그 보장은 Task 3의 `tracked_open` 개별 조회가 한다.

- [ ] **Step 1: 실패하는 테스트**(`TestCase`, 클라이언트 호출 없이 `PRDict` 직접 구성):
  - `test_creates_pr_reviewers_reviews` — PR 1건(리뷰어 a·b, a의 리뷰 있음) 저장 후 행 수와 `files` 왕복(`json.loads`)이 맞고 `IngestResult(created=1, updated=0)`.
  - `test_second_ingest_updates_not_duplicates` — 같은 번호 재저장 시 `created=0, updated=1`, `title`·`additions` 갱신.
  - `test_requested_at_stable_when_still_active` — 첫 저장 `requested_at=T1`; 이벤트 없이(None) 재저장해도 T1 유지.
  - `test_reviewer_removed_marks_inactive` — 둘째 스냅샷에서 b가 빠지면 b의 행 `is_active False`, `removed_at==now`, a는 활성.
  - `test_rerequest_reactivates_with_new_requested_at` — b가 빠졌다가 새 `requested_at=T3`로 돌아오면 `is_active True, requested_at==T3, removed_at None`.
  - `test_state_transition_open_to_merged` — 같은 PR이 `state='merged', merged_at=...`로 오면 갱신되고 리뷰어 행은 그대로.
  - `test_team_and_direct_rows_coexist` — 같은 PR에 직접(a)과 팀(`acme/backend`) 요청이 각각 행 1개.
  - `test_tracked_open_numbers` — 열린 PR 번호만 반환.
- [ ] **Step 2:** `python manage.py test integrations.tests_ingest --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** `ingest_prs`, `tracked_open_numbers` 구현(`transaction.atomic` 레포 단위 1회). 시각 문자열은 `django.utils.dateparse.parse_datetime`.
- [ ] **Step 4:** 같은 명령 기대: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: GitHub PR 스냅샷을 저장하고 요청 취소·재요청·머지를 반영"`

---

### Task 5: 동기화 오케스트레이션과 `POST sync-prs/`

**Files:**
- Rewrite: `backend/integrations/pr_sync.py`
- Create: `backend/integrations/views_sync.py`, `backend/integrations/urls_sync.py`, `backend/integrations/tests_sync.py`
- Modify: `backend/integrations/views_prs.py`(구 `sync_prs` view와 `pr_sync` import 삭제), `backend/integrations/urls_prs.py`(`sync-prs/` 줄 삭제), `backend/integrations/urls.py`, `backend/integrations/github_client.py`(`search_review_requested_prs`, `get_authenticated_login` 삭제), `backend/integrations/tests_prs.py`(`SyncTests` 삭제 — 같은 의미의 테스트가 `tests_sync.py`/`tests_mirror.py`로 이동)

**Interfaces:**
- Consumes: Task 3 `fetch_repo_pull_requests`/`GitHubError`, Task 4 `ingest_prs`/`tracked_open_numbers`, Task 2 모델.
- Produces: `sync_repos(repo_id: int | None = None, now: datetime | None = None) -> dict` — 계약 §2 응답(`created, skipped, errors, throttled, repos`). `serialize_repo_status(repo) -> dict`(`repoId, repo, lastAttemptAt, lastSuccessAt, lastError, truncated`) — Task 7이 재사용. 끝에서 Task 6의 훅 `task_mirror.mirror_repo(repo)`를 호출하는 자리(Task 6 전에는 no-op import 가드 없이 Task 6이 이 호출을 추가한다).
- 호환: 기존 `sync_review_requests()`를 `sync_repos()`로 바꾸되 **이름 `sync_review_requests`도 남긴다**(`return sync_repos()` 한 줄 래퍼) — 외부 호출자가 있을 수 있으므로.

규칙:
- 대상: 모든 `WatchedRepo`(또는 `repo_id`).
- claim: `WatchedRepo.objects.filter(pk=repo.pk).filter(Q(last_attempt_at__isnull=True)|Q(last_attempt_at__lt=now-30s)).update(last_attempt_at=now)`의 반환값이 1일 때만 진행(DB가 중복 호출을 직렬화, MySQL·sqlite 모두 동작). 0이면 `throttled`에 id.
- 성공: ingest 후 `last_synced_at=now`, `last_error_*` 비움, `truncated` 반영. 실패(`GitHubError`): `last_error_kind/message/reset_at`만 기록하고 **`last_synced_at`·PR 데이터는 건드리지 않는다**. `errors`에 `f'{owner}/{name}: {message}'`.
- 항상 예외 없이 dict 반환.

- [ ] **Step 1: 실패하는 테스트**(`mock.patch('integrations.pr_sync.github_client.fetch_repo_pull_requests')`):
  - `test_success_records_status_and_saves` — 반환 `{'prs':[pr(1)],'truncated':False}` → `repos[0]['lastSuccessAt']` 설정, `lastError is None`, `PullRequest` 1행, 응답에 기존 키 `created=1, skipped=0, errors=[]` 존재.
  - `test_second_call_within_30s_is_throttled` — `now` 주입, 같은 레포 두 번째 호출은 fetch 미호출(`assert_called_once`), `throttled==[repo.id]`; 31초 뒤엔 호출됨.
  - `test_failure_keeps_last_success_and_data` — 성공 후 `GitHubError(403,'x',kind='rate_limit',reset_at=R)`로 재호출 → `lastSuccessAt` 불변, `lastError=={'kind':'rate_limit','message':'x','resetAt':R}`, PR 행 그대로, `errors`에 문자열 1개.
  - `test_one_repo_failure_does_not_block_other` — 두 레포 중 하나만 실패, 다른 하나는 저장·성공 기록.
  - `test_success_after_failure_clears_error` — 다음 성공에서 `lastError None`.
  - `test_truncated_flag_stored` — `truncated=True` 반환이 레포와 응답에 반영.
  - `test_repo_id_filter` — `repo_id` 지정 시 그 레포만.
  - `test_endpoint_post_returns_contract_shape` — `POST /api/v1/integrations/sync-prs/`(본문 없음/`{"repoId":N}`/잘못된 JSON→400)이 200 + 계약 키.
  - `test_tracked_open_passed_to_client` — fetch가 `tracked_open=[이미 저장된 열린 PR 번호]`로 호출됨.
- [ ] **Step 2:** `python manage.py test integrations.tests_sync --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** 구현. `views_sync.sync_prs`는 `@api_view`+POST, 본문 파싱은 `parse_json_body`(빈 본문 허용).
- [ ] **Step 4:** `python manage.py test integrations --settings=config.settings_test` 기대: PASS(삭제된 `SyncTests` 제외, `EndpointTests`·`tests_arch` 포함 모두 통과).
- [ ] **Step 5: Commit** `git commit -m "feat: 레포 단위 동기화 상태 기록·쓰로틀과 sync-prs 응답 확장"`

---

### Task 6: 레거시 PR→Task 미러와 "최초 1회만 생성" 버그 수정

**Files:**
- Create: `backend/integrations/task_mirror.py`, `backend/integrations/tests_mirror.py`
- Modify: `backend/integrations/pr_sync.py`(성공 시 `mirror_repo(repo)` 호출 한 줄)

**Interfaces:**
- Consumes: Task 4가 채운 `PullRequest`/`PullRequestReviewer`, Task 2 `SeenPullRequest`, `tasks.models.Task`.
- Produces: `mirror_repo(repo: WatchedRepo) -> None`. 프런트가 큐로 전환하기 전까지 현재 프런트의 칸반이 PR을 계속 보게 하는 호환 계층이다(Task 13에서 제거).

규칙: 미러 대상 PR = `repo.github_login`(레거시, 비어 있지 않음)이 **활성 직접 리뷰어**인 PR. 기존과 같은 id `pr-{owner}-{name}-{number}`, 같은 필드(`category='Review'`, `source_url`, `creator`=작성자, `status='todo'`). 신규 생성은 `SeenPullRequest`로 중복·삭제 후 재생성을 막는다(기존 동작 유지). **새로 하는 일(버그 수정)**: 이미 있는 Task에 대해 (a) 제목의 `(draft)` 접미를 PR 현재 `is_draft`로 맞추고, (b) PR이 `merged`/`closed`가 되면 `status='done'`으로(이미 `done`이면 무변경), (c) 열린 상태에서는 사용자가 바꾼 `status`를 덮어쓰지 않는다. 레포의 `github_login`이 비어 있으면 미러는 아무것도 하지 않는다(서버 토큰 소유자 대체 로직 폐지).

- [ ] **Step 1: 실패하는 테스트**(기존 `tests_prs.py`의 `SyncTests` 의도를 이식):
  - `test_creates_task_with_legacy_fields` — 기존 단언 그대로(`title '[PR] #1 Fix bug'`, `creator 'alice'`, `category 'Review'`, `status 'todo'`, `source_url`, description 문구 `Auto-created from GitHub review request`).
  - `test_idempotent_and_deleted_task_not_recreated` — 두 번 호출해도 Task 1개; Task 삭제 후 재호출해도 재생성 없음, `SeenPullRequest` 1행.
  - `test_draft_suffix_follows_pr_state` — draft로 생성 후 `is_draft=False` 갱신 → 제목에서 ` (draft)` 제거.
  - `test_merged_pr_marks_task_done` — `state='merged'`로 갱신된 PR의 Task `status=='done'`; `closed`도 동일.
  - `test_open_pr_status_not_overwritten` — 사용자가 `inprogress`로 옮긴 Task는 열린 PR 동기화 후에도 `inprogress`.
  - `test_ignores_prs_without_legacy_login_reviewer` — `github_login=''`이거나 해당 로그인이 리뷰어가 아니면 Task 미생성.
- [ ] **Step 2:** `python manage.py test integrations.tests_mirror --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** 구현 + `pr_sync`에서 호출. 대소문자 비교는 `login_key`.
- [ ] **Step 4:** `python manage.py test integrations tasks --settings=config.settings_test` 기대: PASS.
- [ ] **Step 5: Commit** `git commit -m "fix: 이미 만든 PR 작업이 머지·닫힘·draft 변화를 따라가지 않던 문제 수정"`

---

### Task 7: 내 리뷰 요청 큐 API

**Files:**
- Create: `backend/integrations/review_queue.py`, `backend/integrations/views_queue.py`, `backend/integrations/urls_queue.py`, `backend/integrations/tests_queue.py`
- Modify: `backend/integrations/urls.py`

**Interfaces:**
- Consumes: Task 2 모델(테스트는 DB에 직접 행을 만든다 — Task 4 비의존), Task 5 `serialize_repo_status`는 Task 5 전이면 이 Task 안에서 임시 구현하지 말고 **Task 5 완료 후** 병합한다(의존 그래프 참고). Task 10의 `areas.map_pr_files`는 `include=areas`일 때만 지연 import.
- Produces: `build_queue(login: str, teams: list[str], closed_within_days: int, include_areas: bool, now: datetime) -> dict`(계약 §1 본문). `queue_list(request)` view. ETag는 `build_queue` 결과에 `now`가 새지 않으므로 안정; `last_modified`는 `max(PullRequest.synced_at, WatchedRepo.last_attempt_at)`.

계산 규칙(계약 §1의 판정을 코드로): 한 `(pr, login_key)` 후보 = 해당 `login_key`의 `PullRequestReviewer` 행(직접) ∪ 요청된 `teams`에 속하는 팀 행. 직접과 팀이 겹치면 직접으로 합침. `requestedAt` = 활성 행의 `requested_at`(비활성이면 마지막 `requested_at`). `waiting` ⇔ PR 열림 ∧ 활성 ∧ (내 리뷰 없음 ∨ 내 리뷰 `submitted_at` < `requestedAt`). `awaiting_author` ⇔ PR 열림 ∧ 내 리뷰 있음 ∧ not waiting. 열림 ∧ 요청 비활성 ∧ 내 리뷰 없음 → `closed`(`request_withdrawn`). 머지/닫힘 PR은 `mergedAt or closedAt >= now - closedWithinDays`일 때만. `login`은 `strip().lower()`, 비면 400 `login_required`. `closedWithinDays`가 정수가 아니거나 범위 밖이면 400 `invalid_closed_within_days`. `knownLogin` = 어떤 PR의 `author`(소문자)·리뷰어·리뷰에 등장.

- [ ] **Step 1: 실패하는 테스트**(헬퍼 `make_pr(repo, n, state='open', reviewers=[...], reviews=[...])`로 DB 구성, 응답 키는 계약 예시와 동일):
  - `test_waiting_item_shape_and_order` — 요청 2건(오래된 것 먼저)이 `group=='waiting'`, 계약의 모든 키 존재(`areas None`), `size`, `requestedAtSource`.
  - `test_login_case_and_whitespace_insensitive` — `login=' Minji-Park '`과 `minji-park` 결과 동일, 응답 `login`은 정규화 전 GitHub 표기(`PullRequestReviewer.login`)로.
  - `test_comment_review_with_request_still_listed_is_awaiting_author` — 내 `COMMENTED` 리뷰가 요청 시각보다 늦고 요청이 아직 활성 → `awaiting_author`.
  - `test_comment_review_with_request_removed_is_awaiting_author` — 같은 리뷰, 요청 비활성 → `awaiting_author`(위와 동일 그룹).
  - `test_rerequest_after_review_is_waiting_and_flagged` — 리뷰 후 `requested_at`이 리뷰보다 늦음 → `waiting`, `reRequested True`, `myReview` 채워짐.
  - `test_request_withdrawn_without_review` — 비활성+리뷰 없음 → `closed`, `closedReason 'request_withdrawn'`.
  - `test_merged_within_window_and_mergedWithoutMyReview` — 머지 PR: 내 리뷰 없음→`mergedWithoutMyReview True`, 있음→False; 8일 전 머지는 기본 7일에서 제외, `closedWithinDays=30`이면 포함.
  - `test_draft_always_included_with_flag` — draft PR 포함, `isDraft True`.
  - `test_team_requests_only_with_teams_param` — 팀 행은 `teams` 없으면 미포함, `teams=acme/backend`면 `requestKind 'team', viaTeam`; 직접+팀 동시 요청은 `direct` 한 행.
  - `test_counts_equal_items_by_group` — `counts`가 `items` 그룹별 개수와 같음.
  - `test_repos_block_reports_status` — 성공 레포와 `lastError rate_limit`+`resetAt` 레포가 `repos[]`에 계약 형태로 나옴; 레포 0개면 `repos [] items []` 200.
  - `test_unknown_login_flag` — 모르는 로그인: `items []`, `knownLogin False`; 알려진 작성자 로그인: `knownLogin True`.
  - `test_etag_304_and_changes` — 같은 요청 두 번째에 `If-None-Match`로 304; PR 하나 변경 후엔 200+다른 ETag; 응답 본문에 `generatedAt`/경과 시간 키 없음.
  - `test_400s` — `login` 없음/빈 값 → 400 `login_required`; `closedWithinDays=abc`.
  - `test_no_n_plus_one` — `assertNumQueries`로 PR 50건·리뷰어 100행에서 쿼리 수가 PR 수에 비례하지 않음(`select_related`/`prefetch_related` 사용).
- [ ] **Step 2:** `python manage.py test integrations.tests_queue --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** 구현. `include=areas`는 이 Task에서 `areas: None`만 반환하고 파라미터를 받아 두며, 실제 채움은 Task 10에서 `build_queue`의 훅(`_areas_for(pr)`)으로 연결한다.
- [ ] **Step 4:** 같은 명령 기대: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: 내 리뷰 요청 큐 API(PR×리뷰어, 요청 시각, 내 리뷰 상태, 정리됨)"`

---

### Task 8: 연결된 레포 API (팀 공용, 상태 필드)

**Files:**
- Modify: `backend/integrations/views_prs.py`, `backend/integrations/urls_prs.py`, `backend/integrations/tests_prs.py`(`EndpointTests` 확장)

**Interfaces:**
- Consumes: Task 2 필드. (`serialize_repo_status`는 Task 5 것을 쓰지 않고 `serialize_repo`가 계약 §3 객체를 모두 낸다.)
- Produces: `serialize_repo(repo) -> dict`(계약 §3 객체, 기존 키 불변+`lastAttemptAt, lastSuccessAt, lastError, truncated, updatedAt`; `lastSyncedAt`은 `lastSuccessAt`과 같은 값). 삭제는 기존대로 즉시 실제 삭제(논리 삭제·`restore` 없음, 결정 30).

- [ ] **Step 1: 실패하는 테스트**(`EndpointTests` 기존 `test_crud` 단언 유지 + 추가):
  - `test_response_has_new_status_fields` — 기존 6키와 신규 키 전부, `lastSyncedAt == lastSuccessAt`, `lastError None`.
  - `test_duplicate_returns_409_with_existing` — 두 번째 POST는 409, 본문 `code=='already_connected'`, `existing.id`가 첫 레포.
  - `test_delete_is_hard_and_second_delete_404` — DELETE 204 후 목록에서 빠지고 DB 행도 없음(기존 `test_crud`의 두 번째 delete 404 유지).
  - `test_idempotency_key_replays_201` — 같은 키 두 번 POST가 같은 201 본문(레포 1개).
  - `test_github_login_accepted_but_ignored` — `githubLogin:'me'`를 보내면 응답에 그대로 나오고(저장), 큐·동기화 결과엔 영향 없음은 Task 5/7이 보증(여기선 저장·응답만).
  - `test_invalid_url_400_code` — 잘못된 URL → 400 `code 'invalid_url'`.
- [ ] **Step 2:** `python manage.py test integrations.tests_prs --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** 구현. 기존 `IntegrityError` 409 경로에 `existing`/`code` 추가.
- [ ] **Step 4:** 같은 명령 기대: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: 연결된 레포를 팀 공용으로 두고 동기화 상태 필드·409 existing 추가"`

---

### Task 9: 영역 별칭 (서버 저장, 경로 접두사 매핑, 연결 끊김)

**Files:**
- Create: `backend/integrations/areas.py`, `backend/integrations/views_aliases.py`, `backend/integrations/urls_aliases.py`, `backend/integrations/tests_aliases.py`
- Modify: `backend/integrations/urls.py`

**Interfaces:**
- Consumes: Task 2 `AreaAlias`, 기존 `architecture.group_paths`/`Group`, `github_client.list_repo_tree`.
- Produces (`integrations/areas.py`, Task 10이 확장):
  - `get_paths(owner: str, name: str, refresh: bool = False) -> list[str]` — `django.core.cache`(키 `tree:{o}/{n}` 소문자, 5분)로 `list_repo_tree` 결과 캐시. 예외는 `GitHubError` 그대로.
  - `get_groups(owner, name, refresh=False) -> list[Group]` — `group_paths(get_paths(...))`.
  - `path_prefix(group: Group) -> str` — `'/'.join(group.prefix)`, `prefix`가 비면 `'@' + group.id`.
  - `alias_status(aliases: Iterable[AreaAlias], groups: list[Group] | None) -> dict[int, str]` — `groups is None`(트리 못 읽음)이면 모두 `'unknown'`, 아니면 `path_prefix`가 일치하면 `'connected'` 아니면 `'disconnected'`.
  - `serialize_alias(alias, status) -> dict`(계약 §5 객체), views `alias_list_create(request, repo_id)`, `alias_detail(request, repo_id, alias_id)`.

- [ ] **Step 1: 실패하는 테스트**(`mock.patch('integrations.areas.get_groups')`/`github_client.list_repo_tree`):
  - `test_path_prefix_dir_and_special` — `backend/payments` 그룹→`'backend/payments'`, docs 특수 그룹→`'@docs'`.
  - `test_create_alias_201_connected` — POST 201, `status 'connected'`, `Idempotency-Key` 재전송 시 같은 본문·행 1개.
  - `test_create_for_missing_prefix_saved_as_disconnected` — 트리에 없는 접두사도 201, `status 'disconnected'`.
  - `test_duplicate_prefix_409_alias_exists_with_existing`, `test_invalid_name_400`(빈 문자열/공백만/81자).
  - `test_list_includes_disconnected_and_unknown_when_tree_unreadable` — 트리 오류 시 목록은 200이고 모두 `'unknown'`.
  - `test_patch_updates_name_and_bumps_updated_at` — `expectedUpdatedAt`이 일치하면 200.
  - `test_patch_conflict_returns_current` — `expectedUpdatedAt`이 다르면 409 `code 'conflict'` + `current`가 최신 객체; 생략하면 덮어쓰기 200.
  - `test_delete_204_then_recreate_same_prefix_ok`.
  - `test_unknown_or_deleted_repo_404_repo_not_found` — 없는 id.
- [ ] **Step 2:** `python manage.py test integrations.tests_aliases --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** 구현. 이름은 `strip()` 후 길이 검사. `get_groups`는 별칭 목록·생성 때 한 번만 호출하고, 생성 응답 상태 계산 외엔 트리를 읽지 않는다(트리 읽기 실패가 생성 실패가 되지 않는다).
- [ ] **Step 4:** 같은 명령 기대: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: 영역 별칭을 서버에 저장하고 경로 접두사 매칭·연결 끊김 상태 제공"`

---

### Task 10: 영역 목록·상세와 PR 변경 파일→영역 매핑

**Files:**
- Create: `backend/integrations/views_areas.py`, `backend/integrations/urls_areas.py`, `backend/integrations/tests_areas.py`
- Modify: `backend/integrations/areas.py`, `backend/integrations/activity.py`(`compute_activity(owner, name, days=30, paths=None)` — `paths`가 주어지면 `list_repo_tree` 호출 생략), `backend/integrations/views_arch.py`(`get_paths` 재사용으로 트리 중복 호출 제거, 응답 불변), `backend/integrations/review_queue.py`(`include=areas` 훅 연결), `backend/integrations/urls.py`

**Interfaces:**
- Consumes: Task 9 `areas.py`(`get_paths`, `get_groups`, `path_prefix`, `alias_status`), Task 2 `PullRequest*`, 기존 `Locator`.
- Produces(`areas.py`): `map_pr_files(groups: list[Group], files: list[str]) -> dict` → `{'primaryAreaId': str|None, 'touched': [{'areaId','fileCount'}], 'unmapped': int}`(touched는 fileCount 내림차순·id 오름차순, 주 영역 = 첫 항목); `review_waiting_by_area(repo, groups, now) -> dict[str, dict]`(영역 id → `{'prCount','oldestRequestedAt'}`, 열린·비draft·활성 리뷰어 ≥1 PR을 주 영역에만 센다); `waiting_prs_for_area(repo, groups, area_id: str, now) -> list[dict]`(결정 37, 계약 §4.2: 열린·활성 리뷰어 ≥1 PR 중 이 영역 파일을 하나라도 바꾸는 것 전부, **주 영역이 아니어도·draft여도 포함**, 항목에 `primaryAreaId, isPrimary, touchedAreas[{areaId,displayName,fileCount}], unmapped, filesTruncated`, `oldestRequestedAt` 오름차순; `PullRequest`와 `reviewers`를 `prefetch`해 PR 수에 비례하는 쿼리를 내지 않는다); `get_activity(repo, days, refresh) -> dict`(5분 캐시, `compute_activity` + `paths`). Views `area_list`, `area_detail`, `pr_areas`. 계약 §4.

- [ ] **Step 1: 실패하는 테스트**(`mock.patch('integrations.areas.get_paths')`, `compute_activity`는 `mock.patch('integrations.areas.compute_activity')`로 `tests_arch.py` 스타일 payload 반환):
  - `test_map_pr_files_primary_and_ties` — 파일 3개가 영역 A, 3개가 B이면 id 사전순 A가 주; 노이즈(`node_modules/...`)는 `unmapped`로 센다; 파일 0개 → `primaryAreaId None, touched []`.
  - `test_review_waiting_counts_primary_only_and_excludes_draft_and_closed` — PR이 두 영역에 걸쳐도 주 영역에만 1; draft·머지 PR 제외; 영역 합계 = 매핑된 대기 PR 수; `oldestRequestedAt`은 PR들의 활성 리뷰어 `requested_at` 중 최솟값.
  - `test_area_list_shape` — 계약 §4.1의 키 전부, `displayName`이 별칭 우선, 별칭 없으면 `name`, `reviewWaiting` 기본 `{prCount 0, oldestRequestedAt None}`, `weekly`의 주 수 = 분석 기간 주 수(0 커밋 주 포함).
  - `test_area_list_errors` — 없는 repoId 404 `repo_not_found`; 트리 `GitHubError` → 502 `github_unavailable`; 그룹 0개 → 200 `areas []`; `days=abc` 400.
  - `test_area_detail_and_missing_area` — 상세에 `recentCommits`, `waitingPullRequests`, `coupledWith`; 없는 `areaId` → 404 `area_not_found`.
  - `test_detail_includes_pr_touching_non_primary_area` — PR이 영역 A 4파일·B 2파일이면 A 상세에 `isPrimary True`, B 상세에도 같은 PR이 `isPrimary False`, 두 응답 모두 `primaryAreaId=='A'`, `touchedAreas`가 `[A(4), B(2)]`; B의 `reviewWaiting.prCount`에는 세지 않는다(목록 응답 B는 0, A는 1).
  - `test_detail_waiting_prs_rules` — draft PR 포함(`isDraft True`), 활성 리뷰어 0명·머지·닫힌 PR 제외, 파일 0개 PR 제외, `oldestRequestedAt` 오름차순, PR 파일이 100개 초과면 `filesTruncated True`, PR 50건에서도 쿼리 수가 PR 수에 비례하지 않음(`assertNumQueries` 상한).
  - `test_pr_areas_endpoint` — 저장된 `files`로 매핑 응답(계약 §4.3), `filesTruncated` 전달, 없는 PR 404 `pr_not_found`.
  - `test_queue_include_areas_fills_areas` — `review-queue/?include=areas`의 항목 `areas`가 위 매핑과 같고, 트리 오류 시 해당 항목은 `areas None`이며 큐 응답은 200.
  - `test_architecture_endpoint_unchanged` — 기존 `tests_arch.py` 전부 통과(회귀).
  - `test_shared_cache_single_tree_fetch` — 같은 레포의 `areas/`와 `architecture/` 연속 호출에서 `list_repo_tree`가 1번만 호출.
- [ ] **Step 2:** `python manage.py test integrations.tests_areas --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** 구현. 별칭 적용은 `alias_status`가 아니라 `path_prefix(group)`로 별칭을 찾아 `displayName`/`alias` 채움.
- [ ] **Step 4:** `python manage.py test integrations --settings=config.settings_test` 기대: PASS(`tests_arch` 포함).
- [ ] **Step 5: Commit** `git commit -m "feat: 영역별 주간 활동·리뷰 대기 PR 수·최장 대기와 PR 변경 파일 영역 매핑"`

---

### Task 11: 기존 Task API 호환 변경 (`kind`, `author`, PR Task `assigneeId`)

**Files:**
- Modify: `backend/tasks/serializers.py`, `backend/tasks/services.py`(`serialize_task_list(kind=None)`), `backend/tasks/views.py`, `backend/tasks/tests.py`

**Interfaces:**
- Produces: `task_kind(task) -> str`(`'pr'` ⇔ `task.id.startswith('pr-')`, 아니면 `'manual'`; 수동 작업의 `sourceUrl`이 PR URL이라는 이유만으론 `pr` 아님 — id 접두사가 유일한 기준). `serialize_task` 출력에 `kind`와 **`author`**(계약 §6, 결정 33) 추가: `kind=='pr'`면 `assigneeId == task.assignee_id`(기본 `''`)이고 `author == task.creator`(PR 작성자 로그인, 비어 있으면 `''`), 아니면(수동) 기존 `task.creator or task.assignee_id` 그대로이고 `author is None`(JSON `null`). `GET /api/v1/tasks/?kind=pr|manual`(그 외 값 400, 없으면 전체). 쓰기 쪽 `map_body_to_model_data`는 변경 없음.

- [ ] **Step 1: 실패하는 테스트**: `test_serialized_task_has_kind`(`pr-o-r-1`→`pr`, `t1`→`manual`), `test_pr_task_assignee_is_not_author`(creator 'alice'인 PR Task의 `assigneeId==''`이고 `author=='alice'`, 수동 Task는 기존 `assigneeId` 값이고 `author is None`), `test_pr_task_author_empty_when_creator_blank`(`creator==''`인 PR Task의 `author==''`, `null` 아님), `test_kind_filter`(`?kind=manual`에 PR Task 없음, `?kind=pr`엔 PR만, `?kind=x`→400), `test_kind_filter_has_independent_etag`(필터마다 ETag가 다르고 각각 304 동작), 기존 tasks 테스트 전부 통과.
- [ ] **Step 2:** `python manage.py test tasks --settings=config.settings_test` 기대: FAIL.
- [ ] **Step 3:** 구현(쿼리셋 `exclude/filter(id__startswith='pr-')`).
- [ ] **Step 4:** 같은 명령 기대: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: Task에 kind·author 추가, PR 작업의 assigneeId가 작성자를 뜻하던 문제 수정"`

---

### Task 12: 결정 기록과 CLAUDE.md 갱신

**Files:**
- Modify: `docs/DECISIONS.md`(맨 아래에 추가만), `CLAUDE.md`

**Interfaces:** 코드 변경 없음. 문서는 구현된 결과(Task 1 실측 결과 포함)를 반영한다.

- [ ] **Step 1: `docs/DECISIONS.md`에 `## 2026-11-24 ...` 제목으로 추가(문제/해결/결과 형식, 기존 항목 무수정).** 최소 항목: ① 검색 `review-requested` 폴링 → 레포당 GraphQL 1쿼리+로그인은 읽기 시점 필터(레이트리밋: 팀원 수와 호출 수 분리, 근거 `08`) ② 큐 그룹을 요청 목록 잔류가 아니라 `요청 시각 vs 내 최신 리뷰 시각`으로 판정(08 미확인 1~3 비의존, 실측 결과는 `docs/ux/08-probe-results.md`) ③ 레포는 팀 공용·로그인은 개인(`WatchedRepo.url` unique 유지, `github_login` 폐기 예정) ④ 레포별 `lastSuccessAt/lastError/truncated`와 서버 쓰로틀(조용한 실패 방지) ⑤ 연결 해제 되돌리기는 클라이언트의 10초 지연 DELETE(서버 논리 삭제는 범위 밖, 결정 30) ⑥ 영역 별칭을 경로 접두사로 서버 저장(02의 "지금 만들지 않는다"를 결정 3·7이 뒤집음 — 기존 문장은 두고 날짜 항목으로 명시) ⑦ PR 한 건은 한 영역에만 센다(주 영역) ⑧ 레거시 PR→Task 미러와 `assigneeId` 변경(작성자는 새 필드 `author`, 결정 33) ⑨ 영역 상세는 주 영역이 아닌 영역에도 걸친 PR을 싣고 개수는 주 영역에만 센다(결정 32·37) ⑩ 새 PR은 "내 리뷰 요청"(큐 API)에서만 보이고 기존 PR Task는 유지하며 Task API에 영역 필드는 추가하지 않는다(결정 38; 미러 중단은 Task 13).
- [ ] **Step 2: `CLAUDE.md` 수정:** "There are no automated tests" 문단을 현재 사실로 교체(Django `TestCase`, 실행 명령 `python manage.py test --settings=config.settings_test`), URL tree에 신규 엔드포인트 추가, `integrations` 앱 설명(GraphQL, `PullRequest*` 모델, 큐/영역), "`ActivityLog`는 미노출" 문장은 그대로.
- [ ] **Step 3: 확인** `git diff docs/DECISIONS.md`에 **삭제된 줄이 0**이어야 한다(`git diff --numstat docs/DECISIONS.md`의 두 번째 열 `0`).
- [ ] **Step 4: Commit** `git commit -m "docs: 리뷰 큐·영역 백엔드 결정 기록과 CLAUDE.md 갱신"`

---

### Task 13 (보류): 레거시 PR→Task 미러 중단

프런트가 `review-queue`로 전환 완료되고 사용자가 승인한 뒤에만 실행한다.

**Files:** Delete: `backend/integrations/task_mirror.py`, `tests_mirror.py`. Modify: `backend/integrations/pr_sync.py`(호출 제거), `backend/integrations/models.py`(`SeenPullRequest` 제거 → 새 마이그레이션 `0004`), `docs/DECISIONS.md`(날짜 항목 추가).

- [ ] **Step 1: 실패하는 테스트**: `test_sync_creates_no_tasks` — 동기화 후 `Task.objects.count()` 불변; 기존 PR Task 행은 삭제되지 않고 `GET /tasks/?kind=pr`에서 계속 보인다.
- [ ] **Step 2:** `python manage.py test integrations tasks --settings=config.settings_test` 기대: FAIL → 구현 → PASS. `makemigrations --check` 기대: "No changes".
- [ ] **Step 3: Commit** `git commit -m "refactor: PR 자동 Task 생성 중단(큐 API로 대체)"`

---

## Self-Review

- **계약 대비 커버리지:** 큐(7), 레포별 상태·truncated(3,5,7), 레포 CRUD·팀 공용(8), 영역 목록/주간/대기 수/최장 대기(10), 별칭 서버 저장·연결 끊김(9), PR→영역(10), 하위 호환 표(11, 5, 8). 08 결정: GraphQL·레포당 1쿼리(3), 로그인 필터(7), 잘림 방지(3 페이지네이션+truncated), 머지/닫힘/draft 갱신(3 recent+개별 조회, 4), `pr_sync` 버그(6), 기존 `assigneeId`(11), 마이그레이션(2, 13), 미확인 실측(1) 모두 대응.
- **타입 일관성:** `PRDict`(3)↔`ingest_prs`(4), `serialize_repo_status`(5)↔`repos[]`(7), `get_paths/get_groups/path_prefix`(9)↔`areas`(10), `map_pr_files`(10)↔queue 훅(7→10). `last_synced_at`은 컬럼 유지·응답에서만 `lastSuccessAt`.
- **알려진 결합:** Task 7은 `serialize_repo_status`(Task 5)를 쓰므로 5 이후. Task 10이 7의 `include=areas`를 완성한다. `integrations/urls.py`는 5/7/9/10이 한 줄씩 추가.
- **비율:** 코드 본문은 쿼리 형태와 시그니처만. 구현 본문은 쓰지 않았다.

## 의존 그래프와 병렬 묶음

```
T1 (실측) ──► T3 (GraphQL 클라이언트) ──┐
T2 (모델) ──┬──────────────────────────┴─► T4 (ingest) ─► T5 (동기화) ─► T6 (미러) ─┐
            ├─► T8 (레포 API)                         └──► T7 (큐 API) ─────────────┤
            └─► T9 (별칭) ─► T10 (영역·PR매핑, T7의 훅 완성) ───────────────────────┤
T11 (Task 호환) ─ 독립 ─────────────────────────────────────────────────────────────┴─► T12 (문서) ─► T13 (보류)
```

- **웨이브 A (병렬):** T1, T2, T11.
- **웨이브 B (병렬):** T3(T1 후), T8·T9(T2 후). T7의 테스트 작성·모델 부분은 T2 직후 시작 가능하나 `serialize_repo_status` 때문에 병합은 T5 뒤.
- **웨이브 C:** T4(T2+T3), T10(T9).
- **웨이브 D:** T5(T4), 그 뒤 T6·T7 병렬(둘 다 T5 필요). T10의 큐 훅 연결은 T7 뒤에 마무리.
- **웨이브 E:** T12(전부 후). T13은 프런트 전환 후 사용자 승인 시.
- 같은 파일을 만지는 쌍: T5↔T8(`views_prs.py`/`urls_prs.py` — T5는 삭제만, 순서 무관하나 병합 확인), T5/T7/T9/T10↔`urls.py`(줄 추가), T7↔T10(`review_queue.py`, 순차).
