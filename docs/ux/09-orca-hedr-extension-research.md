# 09. Orca / hedr 확장 가능성 조사

조사일 2026-11-24. 읽기 전용 조사. 제품 코드 변경 없음. 외부 검색어에는 프로젝트/사용자 정보를 쓰지 않았다.

## 0. 결론 요약

- Orca: 확장 지점이 실제로 있다(플러그인 시스템, 사이드바 패널, 내장 브라우저 CLI). 가장 싼 길은 내장 브라우저로 이 앱 URL을 여는 것(코드 변경 0). 플러그인 패널로 이 웹 앱을 iframe 임베드할 수 있는지는 **미확인**이며, 문서상 패널은 "네트워크 없음"이다.
- hedr: 정확히 확인된 도구는 없다. 검색은 **herdr**(터미널 멀티플렉서)로 수렴했지만, 사용자가 말한 도구가 이것인지는 **확인 못 함**. herdr는 TUI이고 웹 임베드 수단이 문서에 없다.

## 1. Orca

### 1.1 확인된 확장 지점 (근거: 로컬 `orca --help`, `orca skills get orca-plugin-authoring --full`, `orca plugin create --help`)

| 지점 | 내용 |
|---|---|
| 플러그인 | `orca plugin create/install/dev watch/open/shot` 등. 템플릿: theme, terminal-theme, icon-theme, syntax, language-pack, editor, panel, components, worker-panel, hook |
| 사이드바 패널 | 오른쪽 사이드바에 표시(`orca plugin open --panel`). 두 종류: TSX components 패널(Orca 컴포넌트만 사용, DOM 없음), HTML 패널(자체 HTML/canvas/라이브러리, `sandboxed-ui`) |
| worker | Node 워커(`trusted-worker`): 저장소, 설정, 워크스페이스/에이전트 이벤트, `agents.list` 등 host API. 패널은 `plugin.request`로 워커 호출 |
| 테마 연동 | HTML 패널은 `--orca-*` CSS 변수와 `<html>`의 light/dark 클래스를 받고 `theme` 이벤트 구독. components 패널은 `env.theme` |
| 내장 브라우저 | 워크트리 범위 탭. `orca tab create --url <url> [--split right]`, `goto`, 스냅샷/스크린샷 (근거: `orca skills get orca-cli --reference browser`) |
| 접근 승인 | 코드가 도는 플러그인은 `--approve`(사용자 승인) 필요 |
| 데스크톱/브라우저 클라이언트 | 일부 예시 플러그인 페이지가 데스크톱, 모바일, 브라우저 클라이언트에서 패널이 동작한다고 표기(웹 검색 결과 요약, 원문 직접 확인은 리다이렉트로 실패 -> 부분 미확인) |

### 1.2 확인된 제약

- 플러그인 문서: "No network: requests outside the plugin's files fail." (`orca-plugin-authoring` 스킬 Gotchas). 즉 패널 안에서 `localhost:8000` API를 fetch하는 방식은 막힌다. 패널 iframe에 외부 URL을 넣을 수 있는지는 문서에서 찾지 못함 -> **미확인**. 시도하려면 `orca plugin create --template panel`로 최소 HTML 패널을 만들어 `<iframe src="http://127.0.0.1:3000">`가 뜨는지 실측해야 한다.
- MCP: 플러그인 매니페스트의 `mcpServers`, `skills`, `connections`, `sidebarCards` 등은 "reserved, must stay empty, not buildable yet". 즉 **Orca 플러그인이 MCP 서버를 제공하는 길은 현재 없음.** (같은 스킬 문서 586행 부근)
- 외부 링크 열기: `shell.openExternal`은 사용자 클릭 필요.
- 자료 위치: 로컬 `/Users/kimjoonsuk/.claude/skills/orca-cli/SKILL.md`(참조 문서는 `orca skills get ...`로만 조회 가능; `~/.claude/skills/orca-plugin-authoring`은 로컬 폴더 없음). 공개: https://www.onorca.dev/ (플러그인 디렉터리, orca.dev로 리다이렉트), 커뮤니티 카탈로그 https://github.com/stablyai/orca-community-plugins (검색 결과에서만 확인, 직접 열람 안 함 -> 미확인), 개요 https://betterstack.com/community/guides/ai/orca-ai/

## 2. hedr

- 이름 확인: "hedr"로 검색하면 **herdr**(오픈소스 에이전트 터미널 멀티플렉서)가 나온다. 사용자의 "hedr"가 herdr인지는 **확인 못 함**. 사용자에게 확인이 필요하다.
- herdr 사실(근거: https://herdr.dev/llms-full.txt, https://herdr.dev/tui/docs/integrations/, https://flaviocopes.com/herdr/):
  - 터미널 UI. 패널은 실제 터미널. 웹뷰/브라우저 임베드 언급 없음.
  - 플러그인: "manifest + out-of-process commands". 터미널 pane을 overlay/popup/split/tab으로 열 수 있음. "Native non-terminal plugin panes are out of scope for plugin v1" -> 웹 UI 패널 불가. 마켓플레이스는 계획 단계.
  - 로컬 소켓 API + CLI(`herdr api schema`)로 스크립트/에이전트가 제어 가능. 에이전트 상태 보고 훅.
  - MCP: 문서에서 언급 없음(검색 결과에 glama.ai MCP 서버 항목이 있으나 제3자 항목 여부 미확인).
  - 데스크톱 앱: 한 기사에서 2026-10-29 "herdr-core" 기반 네이티브 데스크톱 앱 발표라고 했으나 1차 출처 확인 못 함 -> **미확인**.

## 3. 통합 방식 비교

| 방식 | Orca | herdr |
|---|---|---|
| A. 내장 브라우저/별도 브라우저로 URL 열기 | 가능. `orca tab create --url http://127.0.0.1:3000 --split right`. 작업량 0~반나절(스크립트화). 코드 변경 없음 | 브라우저 없음. 터미널 pane에서 `open URL`로 외부 브라우저 실행 정도. 임베드 아님 |
| B. 플러그인 패널(HTML)에서 iframe 임베드 | 가능성 있음, **미확인**. "네트워크 없음" 제약 때문에 iframe/CSP가 막힐 수 있음. 실측 1~2시간. 가능하면 패널 폭이 좁으므로(오른쪽 사이드바) 좁은 폭 대응 필수 | 불가(non-terminal pane 범위 밖) |
| C. components 패널(TSX)로 재작성 | 작업량 큼(앱의 해당 뷰를 Orca 컴포넌트로 재구현). 대신 테마/폭 자동 대응. 데이터는 worker가 백엔드를 fetch해야 하는데 worker는 trusted-worker로 네트워크 가능 여부 미확인 | 해당 없음 |
| D. worker 플러그인 + 이벤트 | 워크스페이스/에이전트 이벤트를 받아 PR 큐 갱신 등 가능(host API). 이 앱과는 worker -> 백엔드 REST 호출 형태. 네트워크 허용 범위 **미확인** | 플러그인은 터미널 명령 실행형. REST 호출 CLI(`curl`)를 감싸는 수준 |
| E. CLI 연동 | `orca` CLI(worktree, terminal, reference find 등)를 백엔드가 호출하는 방식. 이 앱의 "PR 리뷰 큐" 항목에서 워크트리 열기 같은 딥액션에 사용 가능 | `herdr` CLI/소켓 API로 pane 생성/상태 조회 |
| F. MCP | Orca 플러그인의 MCP 제공은 reserved(불가). 대신 Claude Code 등 에이전트 쪽에 이 앱의 MCP 서버를 붙이는 것은 Orca와 무관하게 가능(이 앱 백엔드가 REST이므로 얇은 MCP 래퍼 필요, 신규 작업) | 문서상 미확인 |

### 이 앱 설계에 미치는 영향 (근거: `frontend/src/App.tsx`, `frontend/src/services/taskSync.ts`)

- localStorage: `tasks`, `activities`, `darkMode`, ETag 키를 사용. 내장 브라우저/iframe은 origin(`127.0.0.1:3000`)별로 저장소가 분리되므로 Orca 탭과 일반 크롬은 서로 다른 '나'/캐시를 갖는다. '나' 식별을 localStorage에만 두면 내장 브라우저 프로필 변경 시 사라진다 -> 서버 쪽 식별 또는 URL 파라미터로 보완 필요. 샌드박스 iframe에서는 localStorage 접근이 막혀 예외가 날 수 있다(App.tsx의 대부분 호출은 try/catch 없음; `ArchitectureView.tsx`만 try/catch 사용).
- 서버 공유: 백엔드가 이미 REST + ETag 폴링(3분)이므로 어떤 임베드 방식이든 같은 서버를 바라보면 데이터는 공유된다. 단 Vite `/api` 프록시는 dev 서버에만 있으므로 임베드 대상은 dev 서버 URL(또는 빌드 후 Django 정적 서빙)이어야 한다.
- 라우터: 현재 react-router 사용 흔적 없음(grep으로 `BrowserRouter`/`useLocation`/`window.location` 미검출). 뷰는 App 상태로 전환됨 -> URL 딥링크 불가. Orca 탭에서 특정 PR/영역을 바로 열려면 URL 라우팅이 필요.

## 4. UI 리디자인에서 미리 고려할 설계 원칙

1. **좁은 폭 우선(320~420px에서 동작)**. Orca 사이드바 패널과 `--split right` 탭은 좁다. `orca plugin shot --width <px>`로 폭별 캡처를 지원하므로(근거: `orca plugin shot --help`) 이 폭에서 검증하기 쉽다. 사이드바 고정 레이아웃 대신 컨테이너 쿼리/단일 컬럼 전환.
2. **URL 딥링크**. 뷰, 선택된 PR/영역, 필터를 URL(해시 또는 쿼리)에 담는다. `orca tab create --url`과 CLI/에이전트가 특정 화면을 바로 열 수 있다. 라우터가 없으므로 최소한 `?view=&id=` 해시 동기화부터.
3. **테마를 CSS 변수 토큰으로 분리**. 현재 `darkMode`는 localStorage 토글. 색을 토큰화해 두면 Orca의 `--orca-*` 변수에 매핑하거나 `prefers-color-scheme`을 기본값으로 따를 수 있다(근거: 플러그인 HTML 패널의 theme 이벤트, `orca-plugin-authoring` 스킬).
4. **저장소 접근을 한 모듈로 모으고 실패를 허용**. localStorage 호출을 try/catch 래퍼 하나로 통일하고, '나' 식별은 서버/URL로 이동 가능한 구조로. 샌드박스 iframe/프로필 변경에도 앱이 깨지지 않게.
5. **데이터 계층을 UI와 분리(REST 계약 유지)**. 다른 클라이언트(components 패널, worker, MCP 래퍼)가 같은 REST를 재사용할 수 있도록 응답 형태를 안정적으로 유지하고, PR 큐/영역 흐름을 읽기 전용 엔드포인트로 노출. 외부 의존(CDN 폰트/스크립트)은 "네트워크 없음" 제약 대비 번들 내장.

## 5. 권장 순서

1. 지금: 방식 A(내장 브라우저)로 실사용 시작. 위 원칙 1~4만 리디자인에 반영.
2. 소규모 실측: `orca plugin create --template panel`로 iframe 임베드 가능 여부 확인(B). 안 되면 A + E(CLI 딥액션)로 충분.
3. herdr: 사용자에게 도구 이름 확인 후 재조사. 현재 정보로는 A(외부 브라우저)와 소켓 CLI 연동 외 길이 없다.

## 미확인 목록

- hedr = herdr 여부, herdr 데스크톱 앱 존재, herdr MCP 지원
- Orca HTML 패널의 iframe 외부 URL 로드 가능 여부, worker 네트워크 허용 범위
- Orca 공개 문서 원문(플러그인 디렉터리 페이지는 리다이렉트로 직접 열람 실패, 카탈로그 저장소 미열람)
