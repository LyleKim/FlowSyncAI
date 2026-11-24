# GitHub 리뷰 요청 API 조사 (08)

조사일 2026-11-24. 제품 코드는 수정하지 않았다. 외부 조회는 일반적인 GitHub API 질문만 썼다. 확인하지 못한 것은 "미확인"으로 표시했다. 출처 표기: [S]=Searching issues and pull requests, [RR]=REST review requests, [P]=REST pulls, [SR]=REST search, [BP]=REST best practices, [RL]=REST rate limits, [GL]=GraphQL rate limits, [GP]=GraphQL pulls reference.

- [S] https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests
- [RR] https://docs.github.com/en/rest/pulls/review-requests
- [P] https://docs.github.com/en/rest/pulls/pulls
- [SR] https://docs.github.com/en/rest/search/search
- [BP] https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- [RL] https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- [GL] https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
- [GP] https://docs.github.com/en/graphql/reference/pulls

## 현재 코드 요약

- `integrations/pr_sync.py`: 감시 레포마다 검색 1회(`is:pr is:open review-requested:{login} repo:o/n`, `per_page=100`, `github_client.py:58-79`). `SeenPullRequest`에 이미 있으면 건너뛴다. 새 PR만 Task로 만들고 이후 갱신은 없다.
- 즉 현재 "내 목록에서 언제 빠지는가"는 GitHub 검색이 아니라 **우리 DB가 영원히 유지**하는 쪽으로 결정돼 있다. 아래 (a)는 이 구조를 바꿀 때 필요한 사실이다.

## (a) `review-requested:USER`는 리뷰 후에도 남는가

| 주장 | 근거 | 상태 |
|---|---|---|
| 리뷰어가 리뷰를 제출하면 `review-requested`, `team-review-requested`, `team-review-requested-user` 결과에서 빠진다. | [S] 검색 한정자 설명 | 확인 (문서 문구) |
| REST도 같다. "Once a requested reviewer submits a review, they are no longer considered a requested reviewer." 제출된 리뷰는 List reviews에서 본다. | [RR] | 확인 |
| **코멘트만 남긴 리뷰(`COMMENT` 상태 리뷰 제출)도 빠지는가** | 문서는 "리뷰를 제출하면"이라고만 쓰고 승인/변경요청/코멘트를 구분하지 않는다. 문구대로면 `COMMENT` 리뷰도 포함이지만 명시적 문장은 못 찾았다. 웹 검색에서도 직접 근거를 못 찾았다. | **미확인 (문서 문구상 빠질 가능성이 높음, 추정)** |
| 리뷰 제출 없이 PR 라인에 단독 코멘트(Add single comment)만 남기면 | 리뷰가 아니므로 요청은 남는다고 추정. 문서에 직접 언급 없음 | 미확인 |
| 리뷰 요청이 다시 걸리면(re-request) 다시 결과에 나타나는가 | 문서에 직접 언급 없음. 같은 문서가 "dismissed/re-requested는 설명하지 않는다" | 미확인 |
| 반대로 리뷰 후에도 목록에 남기려면 `review-involves:USER`를 쓴다는 설명이 있다. | 이 문장은 문서 조회 도구가 요약해 준 것이다. 원문 직접 확인은 못 했다. | 미확인 (직접 검증 필요) |
| `review-requested` 필터가 이미 머지되거나 리뷰된 PR을 돌려준 사례 보고가 있다. 일시적 문제로 보인다는 답변이 있다. | https://github.com/orgs/community/discussions/59540 | 확인 (사용자 보고, 공식 해명 아님). 필터에 일시 오차가 있을 수 있다는 정도로만 쓴다. |

결론(설계 영향):
1. 문서상 GitHub는 "내가 리뷰를 제출한 순간" 요청 목록에서 지운다. 제품이 "내가 리뷰를 끝냈다"를 알려면 검색 결과 소멸에 의존하지 말고 `reviews` 데이터(내 최신 리뷰 상태)를 직접 읽는 편이 확실하다.
2. 소멸 시점이 코멘트 리뷰에서도 같은지는 실측이 필요하다. 테스트 레포에서 PR을 만들고 `COMMENT` 리뷰를 제출한 뒤 `GET /pulls/{n}/requested_reviewers`와 검색 결과를 비교하면 1분 안에 확인된다.
3. 결정 13번("코멘트만 남긴 리뷰가 요청 목록에서 빠지는지")의 현재 답은 "문서상 빠짐 추정, 미확인"이다. 제품 로직은 이 가정에 의존하지 않게 설계하는 쪽을 권한다 (아래 (c)).

## (b) 팀 리뷰 요청 vs 개인 리뷰 요청, 한정자

| 항목 | 내용 | 근거 / 상태 |
|---|---|---|
| `review-requested:USER` | 사용자가 리뷰어로 지정된 PR. 본인이 속한 팀이 요청된 PR도 이 결과에 나타난다. | [S] 확인 |
| `team-review-requested:ORG/TEAM` | 해당 팀에 리뷰 요청이 걸린 PR | [S] 확인 |
| `team-review-requested-user:USER` | 사용자가 속한 어떤 팀이든 요청된 PR. **사용자 본인에게 직접 걸린 요청은 제외**한다. | [S] 확인 (요약 도구 응답. 한정자 이름과 의미는 일치) |
| `reviewed-by:USER` | 해당 사람이 리뷰한 PR | [S] 확인. 어떤 리뷰 상태(코멘트 포함)를 세는지는 미확인 |
| `review:none` / `required` / `approved` / `changes_requested` | 각각 리뷰 없음 / 머지 전에 리뷰가 필요함 / 리뷰어가 승인함 / 리뷰어가 변경 요청함 | [S] 확인. 이 한정자들은 **PR 전체의 상태**이지 "내" 상태가 아니다. 내 승인 여부는 `reviewed-by:USER review:approved` 조합으로 근사할 수 있으나 "다른 사람이 승인한 PR을 내가 코멘트만 한" 경우를 구분하지 못한다 (추정). |
| `review:approved` 필터가 어긋난 사례 | https://github.com/orgs/community/discussions/55826 | 사용자 보고. 신뢰도 주의 |
| REST 요청된 리뷰어 | `GET /repos/{o}/{n}/pulls/{n}/requested_reviewers` → `users[]`와 `teams[]` 두 배열 | [RR] 확인 |
| REST PR 객체 | `requested_reviewers`(사용자), `requested_teams`(팀)가 분리돼 있다. | [P] 확인 |

팀 요청에서 생기는 문제:
- 팀이 요청되면 PR의 `requested_reviewers`에는 팀원 개인이 나타나지 않고 `requested_teams`에 팀만 나온다. 개인 로그인 기준으로 "내 요청"을 판정하려면 팀 멤버십을 알아야 한다. 검색 `review-requested:USER`는 이 팀 확장을 GitHub 쪽에서 해 주므로 이 용도로는 검색이 더 편하다.
- 팀 멤버 목록 API(`GET /orgs/{org}/teams/{slug}/members`)가 어떤 토큰 권한을 요구하는지는 이번에 확인하지 못했다. **미확인**.
- 팀 요청이 걸린 상태에서 팀원 한 명이 리뷰를 제출하면 팀 요청이 사라지는지, 나머지 팀원의 "내 요청"이 어떻게 되는지는 **미확인**. (실측 필요)
- 개인 요청과 팀 요청은 둘 다 걸릴 수 있다. 한 PR에 중복 항목을 만들지 않도록 `(PR, 로그인)` 단위로 합쳐야 한다 (설계 제안).

## (c) 최소 호출로 필요한 데이터 얻기

필요한 데이터: 내 승인 여부, additions/deletions/changed_files, PR 파일 목록, 리뷰 요청 시각.

### 엔드포인트별 보유 필드

| 엔드포인트 | 있음 | 없음 | 근거 |
|---|---|---|---|
| REST `GET /search/issues` | `draft`, `pull_request.merged_at`, `created_at`, 작성자 | `requested_reviewers`, `additions` 등 | [SR] 확인 |
| REST `GET /repos/{o}/{n}/pulls` (목록) | `state`, `draft`, `merged_at`, `requested_reviewers`, `requested_teams` | `additions`, `deletions`, `changed_files`, `merged`, `mergeable` | [P] 확인 |
| REST `GET /repos/{o}/{n}/pulls/{n}` | 위 전부 + `additions`, `deletions`, `changed_files`, `merged`, `mergeable` | 파일 목록, 리뷰 목록 | [P] 확인 |
| REST `GET /pulls/{n}/files` | 파일별 `filename`, `status`, `additions`, `deletions` | PR 수준 상태 | [P] 확인. 최대 3000개, 기본 30개/페이지, `per_page` 최대 100 |
| REST `GET /pulls/{n}/reviews` | 리뷰별 작성자와 상태 | (페이지네이션 필요) | [RR]에서 리뷰 목록이 별도라고만 확인. 필드 상세는 미조회 |
| GraphQL `PullRequest` | `additions`, `deletions`, `changedFiles`, `files`(페이지네이션), `reviewRequests`, `latestReviews`(사용자별 최신 리뷰, pending 제외), `latestOpinionatedReviews`, `viewerLatestReview`, `reviewDecision`, `isDraft`, `merged`, `mergedAt`, `closedAt`, `state`(OPEN/CLOSED/MERGED), `timelineItems`(`itemTypes`, `since` 필터) | | [GP] 확인 |
| GraphQL 타임라인 | `ReviewRequestedEvent`, `ReviewRequestRemovedEvent`, `PullRequestReview`, `ReviewDismissedEvent`, `ReadyForReviewEvent`, `ConvertToDraftEvent`, `MergedEvent`, `ClosedEvent`가 union 멤버다. | | [GP] 확인 (멤버십). `ReviewRequestedEvent`의 `createdAt`/`requestedReviewer` 필드 정의는 문서가 잘려서 직접 못 봤다 → 미확인 (타임라인 이벤트의 일반 형태에서 있을 것으로 추정) |

REST에는 "리뷰 요청 시각"을 주는 단일 필드가 없다. 얻으려면 REST 이슈 타임라인/이벤트 API가 필요하지만 이번에 문서를 조회하지 않았다 → REST 쪽 방법은 **미확인**. GraphQL은 `timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT])`로 가능하다 ([GP] union 멤버로 확인).

### 비교

REST만 쓸 때(레포당 열린 PR N개):

| 단계 | 호출 | 비고 |
|---|---|---|
| 열린 PR 목록 + 요청된 리뷰어 | 1 (`per_page=100`, 100개 초과 시 페이지) | 개인/팀 요청, draft 포함 |
| 규모 (additions 등) | N | 목록에 없음 |
| 파일 목록 | N 이상 (파일이 100개 초과면 추가 페이지) | |
| 내 리뷰 상태 | N 이상 | `/reviews` |
| 요청 시각 | N 이상 | 방법 미확인 |
| 합계 | 약 1 + 3N ~ 4N | |

GraphQL 레포당 쿼리 1개(구조 제안):
`repository(owner,name){ pullRequests(states:OPEN, first:50, orderBy:{field:UPDATED_AT,direction:DESC}){ nodes{ number title url isDraft createdAt author{login} additions deletions changedFiles reviewRequests(first:20){…} latestReviews(first:20){…} files(first:100){nodes{path}} timelineItems(itemTypes:[REVIEW_REQUESTED_EVENT], last:20){…} } } }`

- 호출 수: 레포당 1. 열린 PR이 50개를 넘으면 `pageInfo` 로 추가 호출. 파일이 100개를 넘는 PR만 별도 후속 호출.
- 포인트 계산([GL] 공식: 각 고유 연결이 `first`/`last` 한도까지 채워진다고 가정한 요청 수 합계 ÷ 100, 반올림, 최소 1): 최상위 1 + PR 50개 × 하위 연결 4개 = 201 → 약 2포인트 (추정 계산, 공식 적용 예). 노드 한도 500,000 ([GL]) 대비 약 5,000 + 1,000 + 1,000 + 1,000 수준이라 안전 (추정).
- 변경 규모, 내 승인 상태(`latestReviews`의 작성자와 상태), 영역 매핑용 파일 경로, 요청 시각이 한 번에 온다.
- 한계: GraphQL에는 ETag 304 절약이 없는 것으로 알려져 있으나 이번 문서 조회에서는 **미확인**. 조건부 요청(304는 1차 한도에 안 걸림)은 REST 문서에서 확인했다 ([BP]).

### 레이트리밋 추정 (가정: 팀원 10명, 연결된 레포 R개, 열린 PR 레포당 약 20개, 폴링 3분 = 시간당 20회)

전제: 서버가 토큰 1개(개인 또는 앱)로 모든 요청을 하고, 사용자가 아닌 **레포 단위**로 가져온 뒤 로그인으로 필터한다(요청된 리뷰어 목록에 있으므로 가능). 그러면 팀원 수는 호출 수와 무관하다.

| 방식 | 호출/주기 | 시간당(20주기) | 5,000/h 대비 (R=3) |
|---|---|---|---|
| 현재 방식을 사람별로 확장: 사람 10 × 레포 R 검색 | 10R | 200R | 3,000/h (R=3). 검색 한도는 별도로 분당 30회 ([SR]) 라서 한 주기에 몰아 보내면 위험. 30회/분 = 3R*10=90은 3분에 분산 가능하나 여유 적음 |
| 현재 방식(레포당 검색 1, login 1개) | R | 20R | 60/h. 낮음. 단 사람 1명만 |
| REST 레포 단위: 목록 1 + 신규/변경 PR만 상세 3개 | R + 3×(바뀐 PR 수) | 평균 낮음 | 목록은 ETag 304이면 한도 비소모 ([BP]) |
| GraphQL 레포 단위 1쿼리 | R (각 약 2포인트) | 20 × 2 × R | 약 120/h (R=3) → 5,000포인트/h 대비 2% 수준 (계산 근거: [GL] 공식, 추정) |

보조 사실:
- REST 기본 5,000/h(인증 사용자), 앱 설치 5,000~12,500/h, Actions `GITHUB_TOKEN` 1,000/h ([RL], [GL]). 토큰이 없으면 60/h (IP 단위) 이므로 토큰 필수 ([RL]).
- 검색 API는 인증 시 분당 30회, 결과 최대 1,000개 ([SR]).
- 2차 한도: 동시 100 요청, REST 엔드포인트당 900 포인트/분, GraphQL 2,000 포인트/분, 요청은 직렬로 보낼 것을 권장 ([RL], [GL], [BP]).
- GitHub는 폴링 대신 웹훅을 권장한다 ([BP]). 내부 도구에서 서버가 외부 노출 가능한지는 미확인 (이 프로젝트 사정, 문서 아님). 폴링으로 충분하다.
- 폴링 주기: `x-poll-interval` 헤더가 오면 그 초 이상 기다리라고 한다 ([BP]). 현재 3분은 일반적으로 안전한 범위로 보인다 (추정).

권장 구성(제안):
1. 레포당 GraphQL 쿼리 1개로 열린 PR(요청된 리뷰어, 내 최신 리뷰, 규모, 파일, 요청 시각)을 가져와 서버에 저장하고, `requestedReviewers` 와 `latestReviews` 로 사람별 상태를 계산한다. 검색 `review-requested`는 팀 확장이 필요할 때만 보조로 쓴다.
2. 팀 요청은 `requested_teams`(팀 slug)로 저장하고, 팀 멤버십 해석은 검색 결과나 별도 설정에 맡긴다. 멤버 API 권한은 미확인.
3. 대기 시간 기준은 `ReviewRequestedEvent.createdAt`(정확) 또는 PR `createdAt`(근사). 사용자 결정 5번의 대기 시간은 둘 다 가능하나 전자는 GraphQL 필요.

## (d) 머지/닫힘/draft 갱신을 최소 호출로

| 방법 | 호출 수 | 근거 / 상태 |
|---|---|---|
| 위 (c)의 레포당 GraphQL 쿼리에서 `states:[OPEN]`으로 열린 PR의 `isDraft`를 매번 갱신 | 추가 0 | [GP] `isDraft`, `state` 확인 |
| 열린 목록에서 사라진 추적 PR만 확인: 레포당 `pullRequests(states:[CLOSED,MERGED], orderBy:{field:UPDATED_AT,direction:DESC}, first:20)` 를 같은 쿼리에 별칭으로 추가 | 추가 0 (같은 호출, 포인트 약 +1) | [GP] `state`(OPEN/CLOSED/MERGED), `merged`, `mergedAt`, `closedAt` 확인. `states`/`orderBy` 인자는 이 조회에서 직접 보지 못함 → 미확인 (GraphQL 일반 사용에서 알려진 인자, 추정) |
| REST 대안: 추적 중이던 PR이 열린 목록에서 빠졌을 때만 `GET /pulls/{n}` 1회씩 | 변경된 PR 수만큼 | [P] `state`, `merged`, `merged_at` 확인 |
| REST 대안 2: 검색 `is:pr repo:o/n is:closed updated:>=시각` | 레포당 1 | `is:merged`, `is:unmerged`, `state:closed` 한정자 [S] 확인. 검색 한도 주의 |
| draft 전환 이벤트 | `ReadyForReviewEvent`, `ConvertToDraftEvent` 타임라인 이벤트가 있다. 하지만 현재 상태는 `isDraft`면 충분하다. | [GP] 확인 |
| 리뷰 요청 취소 | `ReviewRequestRemovedEvent` 가 있다. 현재 `reviewRequests` 목록에 내가 없는 것으로도 판정 가능 | [GP] 확인 |

정리 규칙(제안): 열린 목록에 없고 닫힘/머지 조회에서 보이면 `state`를 갱신하고 "정리됨"으로 표시. 결정 12번의 "7일 보관"은 `closedAt`/`mergedAt` 기준으로 계산하면 된다.

## 남은 미확인 항목 (실측 또는 추가 조회 필요)

1. `COMMENT` 상태 리뷰 제출 후 `review-requested:USER` 결과와 `requested_reviewers`에서 빠지는가. (테스트 레포에서 1분 실측 권장)
2. 리뷰 후 re-request 시 다시 나타나는가.
3. 팀 요청에서 팀원 한 명이 리뷰했을 때 팀 요청과 다른 팀원의 결과가 어떻게 되는가.
4. 팀 멤버 조회 API의 필요 토큰 권한.
5. `review-involves:` 한정자의 정확한 동작과 문서 원문.
6. REST로 리뷰 요청 시각을 얻는 방법(이벤트/타임라인 API). GraphQL `ReviewRequestedEvent` 필드 정의 직접 확인.
7. GraphQL이 조건부 요청(ETag)을 지원하는지, GraphQL `search` 연결의 별도 한도.
8. GraphQL `pullRequests`의 `states`/`orderBy` 인자(문서 일부만 조회됨).
