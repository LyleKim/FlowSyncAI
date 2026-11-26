# 08 미확인 항목 실측 결과

작성 2026-11-24. 08 원문은 수정하지 않았다. 항목 번호는 08 "남은 미확인 항목"의 번호 그대로다.

**이번 실행에서는 실측하지 못했다.** `GITHUB_TOKEN`이 없었고, 테스트 레포(`LyleKim/FlowSyncAI`)에 PR·리뷰·코멘트를 게시하는 쓰기 실험은 사용자 승인이 없었다(결정 35). 스크립트는 작성만 했고 네트워크로 실행하지 않았다.

- 읽기 전용 스크립트: `backend/scripts/probe_github_review_semantics.py` (`GITHUB_TOKEN=... python backend/scripts/probe_github_review_semantics.py --schema <공개 레포>`). 토큰이 없으면 실행을 거부하고, 토큰은 출력·저장하지 않는다. 항목 5~8의 일부와 레이트리밋 비용을 출력하고 응답 본문(헤더 제외)을 픽스처로 저장한다.
- **`backend/integrations/testdata/graphql_repo_prs.json`은 합성(synthetic) 픽스처다.** 실제 GitHub 응답이 아니라 계획 Task 3의 `PR_QUERY` 형태(별칭 `open`/`recent`, `rateLimit`)에 맞춰 손으로 만들었다. 열린 PR 3건(개인+팀 리뷰어와 `COMMENTED` 최신 리뷰와 `ReviewRequestedEvent` 타임라인 / `author: null` draft / 리뷰 요청 없음+`APPROVED`)과 `recent`에 `MERGED` 1건. 필드 이름이 실제 스키마와 다르면 스크립트를 실행해 이 파일을 덮어쓰고 이 문서를 갱신한다.
- 설계 영향 공통: 큐 로직(Task 7)은 아래 어느 항목의 결과에도 의존하지 않는다. 결과는 `requestedAt`/`reRequested` 문구와 쿼리 필드 이름만 바꾼다.

| # | 항목 | 결과 | 근거(명령) | 설계 영향 |
|---|---|---|---|---|
| 1 | `COMMENT` 리뷰 제출 후 요청 목록 잔류 | 실측 불가(미승인) | 쓰기 실험: 테스트 레포 PR에 `COMMENT` 리뷰 제출 후 `GET /pulls/{n}/requested_reviewers`와 GraphQL `reviewRequests` 비교 | 없음. 큐는 `latestReviews`를 직접 읽는다 |
| 2 | 리뷰 후 re-request 시 재등장과 새 `ReviewRequestedEvent` | 실측 불가(미승인) | 쓰기 실험: 재요청 후 `reviewRequests`·`timelineItems` 비교 | 없음. `reRequested` 문구만 보류 |
| 3 | 팀 요청에서 팀원 1명 리뷰 후 팀 요청·다른 팀원 결과 | 실측 불가(미승인) | 쓰기 실험: 팀 요청 후 팀원 1명이 리뷰 | 없음. 팀 요청은 `(PR, team_slug)` 행으로 저장 |
| 4 | 팀 멤버 조회 API 필요 토큰 권한 | 실측 불가(미승인) | 쓰기 실험 범위(팀 구성 필요): `GET /orgs/{org}/teams/{slug}/members` | 없음. 팀 멤버십 해석 안 함 |
| 5 | `review-involves:` 동작과 문서 원문 | 실측 불가(토큰 없음) | 검색 API 호출 필요. 스크립트 범위 밖 | 없음. 큐는 검색 한정자를 쓰지 않는다 |
| 6 | REST로 요청 시각을 얻는 방법, GraphQL `ReviewRequestedEvent` 필드 | 실측 불가(토큰 없음) | `python backend/scripts/probe_github_review_semantics.py --schema <repo>`의 `ReviewRequestedEvent.createdAt/requestedReviewer` 행(introspection). REST 방법은 스크립트 범위 밖 | `requested_at`은 없으면 PR `createdAt`로 대체(계획 Task 4) |
| 7 | GraphQL ETag/조건부 요청, `search` 별도 한도 | 실측 불가(토큰 없음) | 같은 스크립트의 `response ETag header`, `If-None-Match re-request status` 행. `search` 한도는 범위 밖 | 없음. 304 절약에 의존하지 않고 폴링 주기·`rateLimit`로 제어 |
| 8 | GraphQL `pullRequests`의 `states`/`orderBy` 인자 | 실측 불가(토큰 없음) | 같은 스크립트의 `Repository.pullRequests args` 행 + 쿼리 실행 성공 여부 | 없음. 인자 이름이 다르면 `PR_QUERY`만 수정 |
