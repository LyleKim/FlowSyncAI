# B-T12 문서 갱신 초안 (적용 보류)

> **상태: DRAFT, 아직 `docs/DECISIONS.md`·`CLAUDE.md`에 적용하지 않았다.** 프런트 스트림과의 머지 충돌을 피하려고 사용자가 보류시켰다. 적용 시점에 아래를 그대로 옮기고 이 파일은 지워도 된다.
>
> 적용 방법
> 1. 파트 A 전체(`## 2026-11-24 ...` 항목들)를 `docs/DECISIONS.md` **맨 아래에 이어 붙인다.** 기존 줄은 수정 금지.
> 2. 파트 B의 세 블록으로 `CLAUDE.md`를 수정한다.
> 3. 확인: `git diff --numstat docs/DECISIONS.md` 의 두 번째 열(삭제된 줄)이 `0` 이어야 한다.
> 4. 커밋 `docs: 리뷰 큐·영역 백엔드 결정 기록과 CLAUDE.md 갱신`.
>
> 참고 근거: 계약 `2026-11-24-api-contract.md`, 실측 `docs/ux/08-probe-results.md`. 실제 구현 기준(`ac02912..8837b63`)으로 썼다.

---

## 파트 A. DECISIONS.md에 덧붙일 항목

## 2026-11-24 리뷰 요청 수집: 검색 폴링 대신 레포당 GraphQL 1쿼리

문제 : "내가 리뷰할 PR"을 얻으려고 `review-requested:<login>` 검색을 로그인마다 폴링하면 팀원 수만큼 호출이 늘고 GitHub 레이트리밋에 먼저 닿는다.

해결 : 연결된 레포마다 GraphQL 쿼리 1번(열린 PR + 최근 닫힌 PR의 리뷰어·최신 리뷰·파일)으로 PR 스냅샷을 DB에 저장하고(`PullRequest`/`PullRequestReviewer`/`PullRequestReview`), 로그인 필터는 읽기 시점(`GET /integrations/review-queue/?login=`)에 건다. 호출 수는 팀원 수가 아니라 레포 수에 비례한다. 요청 취소·재요청·머지는 스냅샷 비교로 반영한다. 네트워크·비JSON 오류는 `github_client`에서 `GitHubError`로 감싸 올려, 뷰가 500 대신 502(`github_unavailable`)를 준다.

결과 : 레이트리밋 소비가 팀 규모와 분리됐다. 단, 아래 "실측 불가" 항목 때문에 GraphQL 필드 이름은 합성 픽스처 기준이다.

## 2026-11-24 08 미확인 항목은 실측하지 못했고 픽스처는 합성이다

문제 : 계획 Task 1은 테스트 레포에서 `COMMENT` 리뷰 후 요청 목록 잔류, 재요청, 팀 요청 등을 직접 재 보는 것(쓰기 실험)이었다.

해결 : 테스트 레포에 PR·리뷰를 게시하는 쓰기 실험은 승인되지 않았고 `GITHUB_TOKEN`도 없었다. 그래서 `docs/ux/08-probe-results.md`의 1~4번은 "실측 불가(미승인)", 5~8번은 "실측 불가(토큰 없음)"로 기록했다. 읽기 전용 스크립트(`backend/scripts/probe_github_review_semantics.py`)는 작성만 했고 실행하지 않았다. `backend/integrations/testdata/graphql_repo_prs.json`은 계획의 `PR_QUERY` 모양에 맞춰 손으로 만든 **합성 픽스처**다. 기존 08 원문은 수정하지 않았다.

결과 : 큐 로직은 위 8개 어느 결과에도 의존하지 않게 설계해(아래 항목) 실측 없이도 동작한다. 실제 스키마와 필드명이 다르면 스크립트를 실행해 픽스처를 덮어쓰고 `PR_QUERY`·결과 문서를 갱신한다. 이 일은 미해결로 남아 있다.

## 2026-11-24 큐 그룹은 요청 시각 대 내 최신 리뷰 시각으로 판정한다

문제 : "리뷰 요청 목록에 남아 있나"로 "아직 리뷰 안 함"을 판정하면, `COMMENT` 리뷰 후 잔류 여부와 재요청 의미(08 미확인 1~3)에 결과가 좌우되는데 이를 재 보지 못했다.

해결 : 그룹은 `요청 시각 vs 내 최신 리뷰 시각`으로 정한다(내 리뷰가 요청보다 늦으면 처리됨). 요청 이벤트 시각을 못 얻으면 PR `createdAt`으로 대체하고, 이를 `requested_at_estimated` **저장 플래그**로 남긴다. 응답의 `requestedAtSource`는 이 플래그로 `event`/`estimated`를 결정한다(처음엔 값에서 추정하려 했으나, 동기화 시점이 아니라 읽는 시점에 판정하면 계약 §과 어긋나서 저장으로 바꿨다. 마이그레이션 `0004`). 시각은 모두 UTC `Z` 문자열로 통일했다(`pr_sync.iso_z`). 팀 요청은 `(PR, team_slug)` 행으로 저장하고 팀 멤버십은 해석하지 않는다.

결과 : 08 미확인 1~4에 의존하지 않는다. 대신 레거시로 이미 저장된 리뷰어 행은 플래그 기본값이 `False`라 `event`로 보이는 한계가 있다.

## 2026-11-24 연결 레포는 팀 공용, 로그인은 개인

문제 : `WatchedRepo`가 `github_login`을 가져 레포 연결이 사람별로 갈렸다. 팀이 같은 레포를 각자 연결할 수 있었다.

해결 : `WatchedRepo.url`은 unique를 유지하고 레포를 팀 공용으로 본다. 로그인은 큐 조회 파라미터(`login`)로 개인화한다. 이미 연결된 URL의 `POST`는 409 `already_connected`에 `existing` 객체를 실어 프런트가 성공처럼 다룰 수 있게 했다. `github_login` 컬럼은 폐기 예정이지만 **Task 13 전까지 남아 있고, 레거시 PR→Task 미러는 여전히 이를 읽는다**(계약 §3은 "동기화는 안 쓴다"고 하나 미러 때문에 예외).

결과 : 레포 연결은 한 번만 하면 된다. `github_login`을 정리하려면 Task 13(미러 중단)이 먼저다.

## 2026-11-24 동기화 상태를 레포별로 노출하고 서버에서 쓰로틀

문제 : 동기화 실패가 조용히 묻혀, 큐가 오래된 데이터를 보이는 줄 아무도 모른다.

해결 : `WatchedRepo`에 `lastSuccessAt`/`lastError`/`truncated`(+ 시도 시각)를 두고 응답에 실었다(`serialize_repo_status`). `POST /integrations/sync-prs/`는 레포 단위 쓰로틀을 서버가 적용하고 `throttled` 목록으로 알린다. 한 레포의 실패가 다른 레포를 막지 않는다(`_sync_one`).

결과 : 실패·잘림·쓰로틀이 화면에서 보인다. 미러 실패는 기록 후 삼켜 동기화 성공 판정에 영향을 주지 않는다.

## 2026-11-24 연결 해제 되돌리기는 클라이언트 지연 DELETE

문제 : 연결 해제 실수를 되돌리고 싶다.

해결 : 서버는 `DELETE`를 즉시 실제 삭제로 둔다. 되돌리기는 클라이언트가 10초 뒤에 DELETE를 호출하는 방식이다(결정 30). 서버 논리 삭제·`restore` 엔드포인트는 범위 밖.

결과 : 백엔드 변경 없음. 10초 안에 탭을 닫으면 삭제가 일어나지 않는 쪽으로 실패한다(안전한 방향).

## 2026-11-24 영역 별칭을 경로 접두사로 서버에 저장한다 (02의 "지금 만들지 않는다"를 뒤집음)

문제 : `docs/ux/02-data-feasibility.md`는 영역 별칭 저장을 "지금 만들지 않는다"고 했으나(그 문장은 그대로 둔다), 팀이 같은 영역 이름을 공유하려면 서버 저장이 필요하다(결정 3·7).

해결 : `AreaAlias(repo, path_prefix, display_name)`를 두고 `.../area-aliases/` CRUD를 제공한다. 같은 `pathPrefix`는 409 `alias_exists`+`existing`, 빈 이름·80자 초과는 400 `invalid_name`, PATCH는 `expectedUpdatedAt` 불일치 시 409 `conflict`+`current`. 트리에 없는 `pathPrefix`도 저장하고 "연결 끊김"으로 표시한다.

결과 : 별칭이 팀 공용이다. 알려진 한계: `pathPrefix`는 정규화하지 않는다.

## 2026-11-24 PR 한 건은 한 영역에만 센다, 영역 상세는 걸친 PR도 싣는다

문제 : 여러 영역의 파일을 바꾸는 PR을 각 영역에서 세면 개수가 부풀고, 영역 상세에서 빼면 영향받는 영역에서 PR이 안 보인다.

해결 : 개수(`reviewWaiting.prCount` 등)는 **주 영역**(변경 파일이 가장 많은 영역)에만, 비draft만 센다(결정 32). 영역 상세의 `waitingPullRequests`는 영역 파일을 하나라도 바꾸는 열린 PR 중 리뷰어가 1명 이상인 것을 주 영역이 아니어도 싣고 `isPrimary`/`isDraft`로 알린다(결정 37). 그래서 두 숫자가 다를 수 있고 프런트가 이유를 문구로 설명한다.

결과 : 영역 목록은 중복 없이 합산되고, 상세는 누락이 없다. 같은 매핑(`map_pr_files`)을 큐 `include=areas`가 쓴다.

## 2026-11-24 `GET .../prs/<n>/areas/`(§4.3)는 만들지 않는다, `include=areas`는 유지

문제 : 계획 Task 10은 단건 PR→영역 엔드포인트와 `test_pr_areas_endpoint`를 포함했다. 그러나 결정 37로 §4.2가 같은 정보를 담아 프런트가 호출하지 않는다.

해결 : 사용자 결정 41에 따라 §4.3 엔드포인트와 그 테스트는 **의도적으로 만들지 않았다**(누락 아님). 큐의 `include=areas`는 결정 42로 유지한다. 소비자가 생기면 같은 매핑 위에 얇게 추가할 수 있다.

결과 : 사용하지 않는 표면을 줄였다. 알려진 경쟁 상태: `views_areas._context`가 활동·경로를 따로 읽어 그 사이 트리가 바뀌면 `area_list`가 500일 수 있다(미해결, 최종 리뷰 대상).

## 2026-11-24 Task API: 새 PR은 큐에서만 보이고, PR Task는 작성자와 담당자를 분리한다

문제 : 레거시 미러가 PR 작성자를 `assigneeId`로 저장해 "작성자 = 담당자"로 보였고, Task에는 영역 필드도 없다.

해결 : `serialize_task`가 `kind`(`id`가 `pr-`로 시작하면 `pr`, 그 외 `manual`. `sourceUrl`이 PR URL이어도 manual)와 `author`를 낸다. PR Task는 `assigneeId`가 `task.assignee_id`(기본 `''`)이고 `author`는 `creator`(없으면 `''`), 수동 Task는 기존 값 그대로에 `author: null`. `GET /tasks/?kind=pr|manual`(그 외 400, 필터마다 별도 ETag). 구현 중 드러난 규칙: **PR Task의 `creator`는 Task API로 바꿀 수 없다**(PATCH가 덮어쓰던 버그 수정), **`assigneeId` 키가 있으면 `''` 포함 그대로 저장**하고 없으면 기존 값을 유지한다(작성자가 담당자로 새는 문제와 담당자 해제 불가 문제를 모두 막는다). Task API에는 영역 필드를 추가하지 않는다(결정 38). 새 PR은 큐 API에서만 보이고 기존 PR Task 행은 남는다. 미러 중단은 Task 13(프런트 전환 후 사용자 승인 필요)이라 **아직 미러는 돌고 있다.**

결과 : `assigneeId` 의미 변경은 PR Task 한정 비호환(결정 33 승인). 미해결 경미 항목: PR Task의 `assigneeId: null`은 값을 유지하고, 문자열이 아닌 `assigneeId`는 500(기존 동작).

---

## 파트 B. CLAUDE.md 교체 텍스트

### B1. "There are no automated tests ..." 문단을 아래로 교체 (Commands > Backend 코드블록 바로 아래)

```
Backend tests are Django `TestCase`s (`backend/*/tests*.py`); there is no frontend test suite. Run them with Python 3.12 (matches the Dockerfile; Python 3.14 breaks Django 4.2's test client):
```bash
cd backend && python manage.py test --settings=config.settings_test
cd backend && python manage.py test integrations --settings=config.settings_test   # one app
```
```

### B2. URL tree 코드블록 끝에 추가 (`/api/v1/integrations/` 아래 라우트는 `backend/integrations/urls*.py` 기준)

```
GET                         /api/v1/tasks/?kind=pr|manual       # kind filter (other values -> 400); each Task has kind + author

GET/POST                    /api/v1/integrations/watched-repos/             # POST dup url -> 409 already_connected + existing
DELETE                      /api/v1/integrations/watched-repos/<pk>/        # immediate hard delete; undo is a client-side 10s delay
POST                        /api/v1/integrations/sync-prs/                  # per-repo GraphQL sync, server throttle, per-repo status
GET                         /api/v1/integrations/review-queue/              # ?login=&teams=&closedWithinDays=1..30&include=areas
GET                         /api/v1/integrations/architecture/              # GitHub repo architecture groups
GET/POST                    /api/v1/integrations/watched-repos/<repo_id>/area-aliases/
PATCH/DELETE                /api/v1/integrations/watched-repos/<repo_id>/area-aliases/<alias_id>/
GET                         /api/v1/integrations/watched-repos/<repo_id>/areas/
GET                         /api/v1/integrations/watched-repos/<repo_id>/areas/<area_id>/
```

### B3. Django apps 목록에 `integrations` 항목 추가 (`reviews` 항목 뒤)

```
- **`integrations`** — GitHub integration, all via the GitHub API (no webhook). `WatchedRepo` is team-shared (url unique); `github_login` is legacy and is still read by the legacy PR→Task mirror (`task_mirror.py`) until that mirror is removed (plan Task 13, needs user approval). `github_client.py` makes one GraphQL query per repo (open + recently closed PRs with reviewers, latest reviews, files); network/non-JSON errors are wrapped as `GitHubError` there, views map it to 502. `pr_sync.py`/`pr_ingest.py` store snapshots in `PullRequest`/`PullRequestReviewer`/`PullRequestReview` and record per-repo `lastSuccessAt/lastError/truncated` with a server-side throttle. `review_queue.py` builds the review queue by comparing request time with the user's latest review time (`requested_at_estimated` is a stored flag behind `requestedAtSource`). `areas.py` maps changed file paths to areas (primary area = most files; counts use the primary area only) with server-stored `AreaAlias` path-prefix names. `architecture.py` powers the architecture page. Each feature has its own `views_*.py`/`urls_*.py` included from `urls.py`. The PR-to-areas endpoint (contract §4.3) is intentionally not built; use queue `include=areas`.
```

"`ActivityLog`는 미노출" 문장은 그대로 둔다. Task 목록 설명에는 "PR Task(`pr-` id): `creator`는 Task API로 불변, `assigneeId`는 키가 있을 때만 저장"을 한 줄 덧붙인다.
