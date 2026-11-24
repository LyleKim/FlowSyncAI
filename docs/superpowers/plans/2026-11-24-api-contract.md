# 리뷰 큐 · 영역 REST 계약서

> 프런트가 의존할 계약. 구현 계획은 `2026-11-24-backend-review-queue.md`. 이 문서가 바뀌면 그 계획의 테스트가 먼저 바뀐다.

**Spec:** `docs/ux/00-context.md`(확정 1~40), `docs/ux/01-strategy.md`, `02-data-feasibility.md`, `03-current-ui-inventory.md`, `04-information-architecture.md`, `05-user-journeys.md`, `06-wireframes.md`, `07-fortify-include-review.md`, `08-research-github-review-requests.md`, `09-orca-hedr-extension-research.md`

## 공통 규칙

- 베이스 `/api/v1/`. 이하 `/integrations/...`는 `/api/v1/integrations/...`. JSON은 camelCase, 시각은 ISO 8601(UTC, `Z`), 인증 없음.
- 오류: `{"error": "<사람이 읽는 문장>", "code": "<기계용 슬러그>", ...세부}`. 기존 `{"error": ...}`에 `code`가 **추가**된 형태라 하위 호환. 상태 코드: 400 입력 오류, 404 없음, 409 충돌/중복, 502 GitHub 실패(읽기 시 GitHub를 직접 호출하는 엔드포인트만).
- POST로 생성하는 엔드포인트는 `Idempotency-Key` 헤더를 읽는다(기존 `api/idempotency.py`, scope는 엔드포인트별 고유).
- 모든 GET은 `ETag` + `Cache-Control: private, must-revalidate`를 준다. `If-None-Match`가 같으면 **304, 본문 없음**(`api/http.py:conditional_json_response`). ETag는 응답 본문 해시이므로 **본문에 "지금 기준" 값(경과 시간, 응답 생성 시각)을 넣지 않는다.** 대기 시간은 프런트가 `requestedAt`으로 계산한다. 같은 URL(쿼리 포함)이 같은 캐시 키다.
- 후보 로그인 엔드포인트는 만들지 않는다(결정 40). 설정·첫 실행의 후보 칩은 `watched-repos[].githubLogin` 값만 쓴다.
- `login`은 대소문자 무시(서버가 소문자로 비교), 응답에는 GitHub 표기 그대로 돌려준다.
- 서버는 레포 단위로 GitHub를 동기화하고, "내 것" 판정은 읽기 시점에 `login`으로 거른다. 팀원 수는 GitHub 호출 수와 무관하다.

## 1. 내 리뷰 요청 큐

`GET /integrations/review-queue/?login=<github-login>[&teams=<org/slug,...>][&closedWithinDays=7][&include=areas]`

| 파라미터 | 필수 | 의미 |
|---|---|---|
| `login` | 예 | 없거나 빈 값이면 400 `login_required` |
| `teams` | 아니오 | 내가 속한 팀 slug(`org/slug`). 이 팀이 요청된 PR만 `requestKind:"team"`로 포함. 서버는 팀 멤버십을 모른다(08 미확인 4) |
| `closedWithinDays` | 아니오 | 머지/닫힘 PR 보관 기간. 기본 7, 1~30 |
| `include=areas` | 아니오 | 항목에 `areas`를 채운다(레포 트리를 읽으므로 느릴 수 있음). 없으면 `areas: null` |

draft는 **항상 포함**하고 `isDraft`로 알린다. 숨김과 "draft N건 숨김" 개수는 프런트가 계산한다(07 R17).

```json
{
  "login": "minji-park",
  "knownLogin": true,
  "repos": [
    { "repoId": 1, "repo": "acme/api", "lastAttemptAt": "2026-11-24T05:02:10Z",
      "lastSuccessAt": "2026-11-24T05:02:10Z", "lastError": null, "truncated": false },
    { "repoId": 2, "repo": "acme/web", "lastAttemptAt": "2026-11-24T05:02:11Z",
      "lastSuccessAt": "2026-11-24T04:41:03Z",
      "lastError": { "kind": "rate_limit", "message": "rate limit exceeded", "resetAt": "2026-11-24T05:30:00Z" },
      "truncated": false }
  ],
  "counts": { "waiting": 2, "awaitingAuthor": 1, "closed": 1 },
  "items": [
    {
      "id": "acme/api#58:minji-park",
      "repoId": 1, "repo": "acme/api", "number": 58,
      "title": "결제 웹훅 재시도", "url": "https://github.com/acme/api/pull/58",
      "author": "jun-ho", "isDraft": false, "prState": "open",
      "group": "waiting",
      "requestKind": "direct", "viaTeam": null,
      "requestedAt": "2026-11-20T01:10:00Z", "requestedAtSource": "event",
      "reRequested": false,
      "myReview": null,
      "size": { "additions": 120, "deletions": 14, "changedFiles": 6 },
      "closedAt": null, "mergedAt": null,
      "closedReason": null, "mergedWithoutMyReview": false,
      "areas": null,
      "updatedAt": "2026-11-24T04:55:00Z"
    }
  ]
}
```

필드 규칙:

- `items`: PR × 리뷰어 한 행. `id = "<owner>/<name>#<number>:<login 소문자>"`. 정렬: `group`(waiting, awaiting_author, closed) 안에서 waiting은 `requestedAt` 오름차순(오래 기다린 순), 나머지는 `updatedAt` 내림차순.
- `group` 판정(08 미확인과 무관하게 동작하도록 요청 목록 잔류 여부에 의존하지 않는다):
  - `waiting`: PR이 열려 있고, 내가 현재 요청된 리뷰어이며, 내 최신 리뷰가 없거나 내 최신 리뷰보다 `requestedAt`이 늦다(재요청).
  - `awaiting_author`: 열려 있고, 내 리뷰가 있으며 위 조건이 아니다(요청 목록에서 빠졌든 남았든 동일).
  - `closed`: `prState`가 `merged`/`closed`이고 `closedAt`(머지는 `mergedAt`)이 `closedWithinDays` 이내. 내가 요청된 적이 있는 PR만.
  - 열려 있고 내 요청이 사라졌고 내 리뷰도 없으면 `closed`로 두고 `closedReason: "request_withdrawn"`(`closedAt`은 null, 이 경우 보관 기간 대신 `updatedAt` 기준).
- `closedReason`: `merged` | `closed` | `request_withdrawn` | null. `mergedWithoutMyReview`는 `prState=="merged"`이고 `myReview==null`일 때 true.
- `requestedAt`: 내 요청의 `ReviewRequestedEvent.createdAt`. 이벤트를 못 찾으면 PR `createdAt`으로 대체하고 `requestedAtSource:"pr_created"`. 값은 항상 있다(null 아님).
- `reRequested`: waiting이면서 내 이전 리뷰가 있었다.
- `myReview`: `null` 또는 `{ "state": "APPROVED"|"CHANGES_REQUESTED"|"COMMENTED"|"DISMISSED", "submittedAt": "..." }`(내 최신 제출 리뷰).
- `requestKind`: `direct`(내게 직접) | `team`(`teams`에 넘긴 팀 경유, `viaTeam:"org/slug"`). 직접과 팀이 겹치면 `direct` 한 행으로 합친다.
- `repos[]`(레포별 동기화 상태, 신선도의 유일한 출처):
  - `lastSuccessAt`: 마지막 **성공** 시각(null이면 아직 성공 없음). `lastAttemptAt`: 마지막 시도.
  - `lastError`: 마지막 시도가 실패했을 때만 객체. `kind`는 `auth|rate_limit|not_found|upstream|unknown`, `resetAt`은 `rate_limit`일 때만 값. 다음 성공 때 null로 돌아간다.
  - `truncated`: 열린 PR 수가 서버 상한(레포당 250)을 넘어 일부만 가져왔다.
  - 실패한 레포의 `items`는 직전 성공 데이터를 그대로 유지한다.
- `knownLogin`: 서버가 이 로그인을 PR 작성자/리뷰어/요청자로 한 번이라도 봤는지. `items`가 비었을 때 "로그인을 확인하세요"와 "진짜 0건"을 가른다.
- `counts`는 `items`의 `group`별 개수와 항상 같다(draft 포함).
- `areas`(`include=areas`일 때): `{ "primaryAreaId": "backend-payments", "touched": [{"areaId": "backend-payments", "fileCount": 4}], "filesTruncated": false }` 또는 매핑 불가 시 `null`(+ 최상위에 영향 없음, 오류는 §6 엔드포인트에서 본다).
- 연결된 레포가 0개면 `repos: []`, `items: []`(200).

304: 같은 `login`/쿼리에서 동기화 결과가 안 바뀌면 304.

## 2. 동기화 실행

`POST /integrations/sync-prs/` — 본문 선택: `{ "repoId": 1 }`(없으면 전체).

**하위 호환:** 기존 `created`, `skipped`, `errors[]`는 유지(의미: 새로 저장된 PR 수 / 건너뜀 / `"owner/name: 메시지"` 문자열). 아래가 추가된다.

```json
{
  "created": 3, "skipped": 12, "errors": ["acme/web: rate limit exceeded"],
  "throttled": [2],
  "repos": [ { "repoId": 1, "repo": "acme/api", "lastAttemptAt": "...", "lastSuccessAt": "...", "lastError": null, "truncated": false } ]
}
```

- 서버가 레포별 최소 간격(30초)을 보장한다. 간격 안에 다시 오면 그 레포는 GitHub를 부르지 않고 `throttled`에 `repoId`를 넣는다(오류 아님). 클라이언트 10대가 동시에 호출해도 레포당 GitHub 호출은 1회.
- 한 레포의 실패는 다른 레포를 막지 않는다. 항상 200(전부 실패해도). 실패 사유는 `repos[].lastError`.
- 응답을 받은 뒤 프런트는 `review-queue`를 다시 읽는다(큐 데이터는 이 응답에 없다).

## 3. 연결된 레포 (팀 공용)

레포는 팀 공용, 로그인은 개인. `githubLogin`은 **폐기 예정이며 동기화에 쓰이지 않는다**(요청은 받고 응답에는 계속 싣는다).

**객체:**
```json
{ "id": 1, "url": "https://github.com/acme/api", "owner": "acme", "name": "api",
  "githubLogin": "", "lastSyncedAt": "2026-11-24T05:02:10Z",
  "lastAttemptAt": "2026-11-24T05:02:10Z", "lastSuccessAt": "2026-11-24T05:02:10Z",
  "lastError": null, "truncated": false,
  "createdAt": "2026-11-01T00:00:00Z", "updatedAt": "2026-11-24T05:02:10Z" }
```
`lastSyncedAt`은 `lastSuccessAt`의 별칭(기존 필드, 하위 호환). 기존 5개 필드와 키 이름·타입 불변, 5개가 추가.

| 메서드·경로 | 요청 | 응답 | 변경 |
|---|---|---|---|
| `GET /integrations/watched-repos/` | | 200 `[객체]` | 필드만 추가, 호환 |
| `POST /integrations/watched-repos/` | `{ "url": "...", "githubLogin"?: "" }` | 201 객체. 이미 연결됨: **409** `{error, code:"already_connected", "existing": 객체}` | 호환(409 유지, `existing` 추가). 클라이언트는 409+`existing`을 성공으로 취급 가능 |
| `DELETE /integrations/watched-repos/<id>/` | | 204 | 호환(상태 코드 동일). **즉시 실제 삭제.** 10초 되돌리기는 클라이언트가 DELETE 호출을 10초 미루는 방식(결정 30)이며 서버 논리 삭제·`restore` 엔드포인트는 이번 범위 밖 |

- 잘못된 URL은 400 `invalid_url`(기존 문구 유지).

## 4. 영역(아키텍처 그룹)

영역 id는 레포 안에서 유일(`architecture.py`의 그룹 id). 응답의 분석 기간·커밋 한도는 기존 `architecture/`와 같다(`days` 7~180, 커밋 최대 60, 서버 캐시 5분).

### 4.1 목록

`GET /integrations/watched-repos/<repoId>/areas/?days=30[&refresh=1]`

```json
{
  "repoId": 1, "generatedAt": "2026-11-24T05:00:00Z", "days": 30,
  "truncated": false, "analyzedCommits": 41,
  "areas": [
    {
      "id": "backend-payments", "name": "backend/payments", "displayName": "결제 흐름",
      "alias": { "id": 7, "displayName": "결제 흐름", "updatedAt": "..." },
      "pathPrefix": "backend/payments", "kind": "backend",
      "fileCount": 22, "samplePaths": ["backend/payments/views.py"],
      "weekly": [ { "weekStart": "2026-11-02", "commits": 3, "filesChanged": 9 } ],
      "totalCommits": 12, "lastChangeAt": "2026-11-23T08:00:00Z",
      "authors": ["jun-ho"], "trend": "rising",
      "reviewWaiting": { "prCount": 2, "oldestRequestedAt": "2026-11-20T01:10:00Z" }
    }
  ],
  "couplings": [ { "a": "backend-payments", "b": "frontend-checkout", "count": 5 } ]
}
```

- `weekly[]`: 분석 기간의 모든 주(월요일 시작)를 빠짐없이, 커밋 0인 주도 `0`으로 포함한다. "데이터 없음"(영역이 기간 중 생김)은 구분하지 않는다.
- `reviewWaiting`: 이 영역이 **주 영역**(`primaryAreaId`)인 열린·비draft PR 중 현재 요청된 리뷰어가 1명 이상인 PR 수와, 그 PR들의 가장 이른 `requestedAt`(최장 대기의 기준 시각). 없으면 `{ "prCount": 0, "oldestRequestedAt": null }`. 한 PR은 한 영역에만 센다(영역 합 = 매핑된 대기 PR 수, 07 R17).
- `pathPrefix`: 디렉터리 영역은 `/`로 이은 경로. 특수 영역은 `@infra-config`, `@docs`, `@root`, `@tests`, `@misc`.
- `displayName`: 별칭이 있으면 별칭, 없으면 `name`. `alias`는 연결된 별칭 또는 null.
- 레포 트리를 못 읽으면 502 `code:"github_unavailable"`(`error`에 사유). 404 `code:"repo_not_found"`(연결 안 된 repoId). `groups`가 0개면 200 + `areas: []`.
- `architecture/`(url 기반)는 **변경 없음**. 이 엔드포인트가 그 위의 상위 집합이며 같은 5분 캐시를 공유한다.

### 4.2 상세

`GET /integrations/watched-repos/<repoId>/areas/<areaId>/?days=30` → 목록의 영역 객체 하나에 아래를 더한다.
```json
{ "recentCommits": [ { "sha7": "a1b2c3d", "message": "...", "author": "jun-ho", "date": "..." } ],
  "waitingPullRequests": [ { "repo": "acme/api", "number": 58, "title": "...", "url": "...", "author": "jun-ho",
      "isDraft": false, "requestedReviewers": ["minji-park"], "oldestRequestedAt": "...",
      "size": { "additions": 120, "deletions": 14, "changedFiles": 6 },
      "primaryAreaId": "backend-payments", "isPrimary": true,
      "touchedAreas": [ { "areaId": "backend-payments", "displayName": "결제 흐름", "fileCount": 4 },
                        { "areaId": "frontend-checkout", "displayName": "frontend/checkout", "fileCount": 2 } ],
      "unmapped": 0, "filesTruncated": false } ],
  "coupledWith": [ { "areaId": "frontend-checkout", "count": 5 } ] }
```
- `waitingPullRequests`(결정 37): **이 영역의 파일을 하나라도 바꾸는** 열린 PR 중 현재 요청된 리뷰어가 1명 이상인 것. 이 영역이 주 영역이 아닌 PR도 포함하고(`isPrimary:false`), draft도 포함해 `isDraft`로 알린다. `oldestRequestedAt` 오름차순. 저장된 파일이 없는 PR(`files` 빈 목록)은 어떤 영역에도 속하지 않아 제외.
- `primaryAreaId`·`touchedAreas`·`unmapped`·`filesTruncated`는 §4.3과 같은 규칙(주 영역 = 변경 파일 수 최다, 동률은 id 사전순, `touchedAreas`는 `fileCount` 내림차순·id 오름차순이며 첫 항목이 주 영역, PR 파일이 100개 초과면 `filesTruncated`). 별도 PR 단위 호출이 필요 없다.
- 상세의 대기 PR 수와 §4.1 `reviewWaiting.prCount`는 **다를 수 있다**(후자는 주 영역·비draft만, 결정 32). 프런트는 이유를 화면에 쓴다.
- `areaId`가 현재 트리에 없으면 404 `code:"area_not_found"`(영역이 사라짐, 07 E10).

### 4.3 PR 변경 파일 → 영역

> 결정 37로 §4.2가 같은 정보를 담으므로 **프런트는 이 엔드포인트를 호출하지 않는다.** 큐 `include=areas`와 같은 매핑(`map_pr_files`)의 단건 조회로 남겨 둔 것이며 소비자가 생기지 않으면 삭제해도 프런트 영향이 없다(실행 개요의 미결 질문).

`GET /integrations/watched-repos/<repoId>/pull-requests/<number>/areas/`
```json
{ "number": 58, "primaryAreaId": "backend-payments",
  "areas": [ { "areaId": "backend-payments", "displayName": "결제 흐름", "fileCount": 4, "samplePaths": ["backend/payments/views.py"] } ],
  "unmapped": 0, "filesTruncated": false }
```
- 주 영역 = 변경 파일 수가 가장 많은 영역(동률이면 영역 id 사전순). `filesTruncated`: PR 파일이 100개를 넘어 앞 100개만 저장됨.
- 저장된 PR 파일이 없으면(아직 동기화 전) 404 `code:"pr_not_found"`.

## 5. 영역 별칭 (서버 저장, 팀 공유)

별칭은 영역 **경로 접두사**(`pathPrefix`)에 붙는다(영역 id가 아니라, 트리가 바뀌어도 이름이 따라가도록). 현재 영역의 `pathPrefix`와 정확히 같을 때 연결된다. 연결 안 되면 `status:"disconnected"`(텍스트 라벨 "연결 끊김").

**객체:** `{ "id": 7, "repoId": 1, "pathPrefix": "backend/payments", "displayName": "결제 흐름", "status": "connected"|"disconnected", "createdAt": "...", "updatedAt": "..." }`

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| `GET /integrations/watched-repos/<repoId>/area-aliases/` | | 200 `[객체]`(연결 끊긴 것 포함). 트리를 못 읽으면 `status`는 `"unknown"` |
| `POST .../area-aliases/` | `{ "pathPrefix": "backend/payments", "displayName": "결제 흐름" }` | 201 객체. 같은 `pathPrefix`가 이미 있으면 409 `code:"alias_exists"` + `existing`. 빈 이름/80자 초과는 400 `invalid_name`. 존재하지 않는 `pathPrefix`도 허용(연결 끊김으로 저장) |
| `PATCH .../area-aliases/<id>/` | `{ "displayName": "...", "expectedUpdatedAt": "<마지막으로 본 updatedAt>" }` | 200 객체. `expectedUpdatedAt`이 다르면 409 `code:"conflict"` + `current: 객체`(서버 최신값, 07 R20). `expectedUpdatedAt` 생략 시 덮어씀 |
| `DELETE .../area-aliases/<id>/` | | 204. 되돌리기는 클라이언트가 같은 값으로 `POST` |

## 6. 기존 API 중 바뀌는 것

| API | 변경 | 호환 |
|---|---|---|
| `GET /tasks/` | **영역 필드(`areaId`)는 추가하지 않는다(결정 38).** 각 Task에 `kind: "pr"\|"manual"` 추가(**`pr-` 접두사 id일 때만 `pr`**; 수동 작업이 PR URL을 `sourceUrl`로 가져도 `manual`). **PR Task의 `assigneeId`는 `""`**(지금은 PR 작성자). 새 필드 **`author`**(camelCase): `kind=="pr"`면 PR 작성자의 GitHub 로그인 문자열(작성자를 알 수 없으면 `""`), `kind=="manual"`이면 **`null`**. 쿼리 `?kind=manual`로 수동 작업만 받기 | 필드 추가(`kind`, `author`)는 호환. `assigneeId` 값 변경은 **PR Task 한정 비호환**(결정 33 승인: 작성자 ≠ 담당자, 작성자는 `author`로 제공). 수동 작업의 기존 필드는 불변 |
| `GET/POST/PATCH/DELETE /tasks/<id>/...`, subtasks, reviews, `generate-checklist` | 없음 | 호환 |
| PR Task 자동 생성 | 동기화가 PR 상태에 따라 Task를 갱신(머지/닫힘 → `done`, draft 표시). 프런트가 큐로 전환한 뒤 별도 단계에서 **자동 생성 중단**(새 PR은 Task가 되지 않음) | 중단 시점: 프런트 화면이 모두 배포된 뒤(결정 33, 계획 Task 13 보류) |
| `POST /integrations/sync-prs/` | §2 | 호환(필드 추가) |
| `GET/POST/DELETE /integrations/watched-repos/` | §3 | 호환. `githubLogin`은 폐기 예정 |
| `GET /integrations/architecture/` | 없음 | 호환 |
| `WatchedRepo.url` unique | 유지(레포는 팀 공용이므로 오히려 올바름). 로그인별 구분은 큐 읽기 시점의 `login` 파라미터로 해소 | - |

## 7. 프런트가 알아야 할 계약상 보증

1. 신선도 문구는 `repos[].lastSuccessAt` 기준(시도 기준 금지). `GET /tasks/`의 200/304는 GitHub 신선도와 무관하다.
2. `truncated:true`면 "일부만 가져왔어요"를 보여야 한다. 큐 숫자는 항상 `items`와 같다.
3. 큐·영역 응답에 경과 시간은 없다. 시각만 있다.
4. `group`/`closedReason`은 GitHub의 요청 목록 잔류 동작(08 미확인 1~3)에 의존하지 않는다.
5. 팀 요청은 `teams` 파라미터를 보낸 경우에만 큐에 나온다.
