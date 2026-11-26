# AWS 배포 계획 (1단계 결과 기준)

전제: 팀 2~10명이 쓰는 사내 서비스, 동시 사용자 수십 명 이하, 다운타임 몇 분은 허용, 운영 인력 0.1명.
가격은 서울 리전(ap-northeast-2) 온디맨드 기준 **추정**이며 실제 금액은 AWS 요금 계산기로 확인해야 한다.

이미 준비된 것: `docker-compose.prod.yml`(MySQL + gunicorn + nginx, DB 포트 비노출, 비루트, 마이그레이션 분리),
`GET /api/v1/health/`(DB 확인 포함), 운영 기본값 안전한 settings, MySQL 8.4에서 전체 테스트 통과(CI 잡 포함).

## 후보 비교

| | A. EC2 단일 인스턴스 + compose | B. ECS Fargate + RDS + ALB | C. App Runner + RDS |
|---|---|---|---|
| 구성 | t4g.small 1대에 `docker-compose.prod.yml` 그대로, 앞단 Caddy(TLS) | 백엔드/웹 컨테이너 2개 태스크, RDS MySQL, ALB(ACM 인증서) | 백엔드 컨테이너(App Runner), 프런트는 S3+CloudFront, RDS |
| 월 비용(추정) | **약 $20~30** (인스턴스 ~$15, EBS 30GB ~$3, 공인 IPv4 ~$4, S3 백업 소액) | 약 $70~110 (Fargate ~$20, ALB ~$20, RDS t4g.micro ~$20, NAT 쓰면 +$40) | 약 $45~70 (App Runner ~$10~25, RDS ~$20, VPC 커넥터, CloudFront 소액) |
| 운영 부담 | OS 패치·디스크·DB 백업을 직접 (스크립트 2개 수준) | 낮음(관리형), 대신 IaC/네트워크 설정량이 큼 | 낮음, 단 프런트/백엔드가 다른 오리진이 되어 CORS·쿠키 설정 필요 |
| 확장성 | 수직 확장(인스턴스 크기 변경)만, 단일 장애점 | 수평 확장·멀티 AZ 가능 | 자동 확장, 단 서비스 기능 업데이트가 정체된 편이라 채택 전 지원 상태 확인 필요(추정) |
| 지금 코드와의 차이 | 없음 | 정적 파일은 웹 컨테이너, 마이그레이션은 1회성 태스크로 | 프런트를 별도 빌드/배포, `DJANGO_CORS_ALLOWED_ORIGINS` 설정 |

## 추천: A안 (EC2 t4g.small + docker-compose.prod.yml + Caddy)

이 규모에서는 B안의 가용성 이득보다 비용(약 3~4배)과 설정량이 크다. compose 파일이 그대로 쓰이고,
나중에 B안으로 옮길 때도 이미지·헬스체크·환경변수 계약이 같아서 버려지는 작업이 없다.
B안으로 넘어갈 신호: 사용자 수십 명 이상, 업무 시간 중 다운타임 불가, DB를 관리형으로 넘기고 싶을 때(먼저 RDS만 분리하는 중간 단계도 가능).

- 인스턴스: t4g.small(ARM, 2GB). 사용 이미지(python:3.12-slim, node:22-alpine, nginx-unprivileged, mysql:8.4)는 모두 arm64 제공.
  메모리가 부족하면 `GUNICORN_WORKERS=2`.
- 네트워크: 보안 그룹 인바운드는 80/443만(가능하면 사무실 IP로 제한), SSH는 열지 않고 SSM Session Manager 사용.

## 비밀값

- `DJANGO_SECRET_KEY`, `GROQ_API_KEY`, `GITHUB_TOKEN`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`는
  **SSM Parameter Store SecureString**(표준 티어 무료)에 `/flowsync/prod/<NAME>`으로 저장.
  Secrets Manager는 자동 로테이션이 필요할 때(RDS로 옮긴 뒤 DB 비밀번호)만 쓴다(비밀당 월 $0.4 수준, 추정).
- 인스턴스 역할(IAM)에 `ssm:GetParametersByPath`(해당 경로만) + KMS 복호화 권한. 배포 스크립트가 파라미터를 읽어
  `.env`(권한 600, git 밖)를 만든 뒤 `docker compose up`. 액세스 키를 서버에 두지 않는다.
- GitHub 토큰은 fine-grained, 감시 대상 레포 읽기 전용으로 최소 권한.

## HTTPS

A안: Caddy를 compose 앞단(호스트 또는 서비스 하나 추가)에 두고 도메인으로 Let's Encrypt 자동 발급.
`web`(nginx)은 `HTTP_PORT=127.0.0.1:8080`으로 루프백에만 바인딩하고 Caddy가 443에서 받아 프록시한다.

```
flowsync.example.com {
    basic_auth { team <bcrypt 해시> }   # 아래 임시 보호
    reverse_proxy 127.0.0.1:8080
}
```
이때 `.env`에 `DJANGO_BEHIND_HTTPS_PROXY=True`, `DJANGO_ALLOWED_HOSTS=flowsync.example.com`,
`DJANGO_CSRF_TRUSTED_ORIGINS=https://flowsync.example.com`. 안정화 후 `DJANGO_HSTS_SECONDS`를 단계적으로 올린다.
(B안이면 ACM 인증서 + ALB 443 리스너가 같은 역할.)

## 백업

- 매일 `mysqldump --single-transaction` → gzip → S3(버전 관리 + 수명주기 30일). 인스턴스 역할에 해당 버킷 쓰기 권한만.
- EBS 스냅샷: Data Lifecycle Manager로 매일, 7개 보존.
- 월 1회 복원 리허설(임시 MySQL 컨테이너에 덤프 복원 후 `manage.py migrate --check`). 복원해 본 적 없는 백업은 백업이 아니다.

## 인증 부재에 대한 임시 보호

현재 API는 인증이 전혀 없다(누구나 읽기/쓰기/삭제, Groq 호출 유발). 공개 전 반드시 막는다.

| 방법 | 장점 | 단점 |
|---|---|---|
| ALB OIDC(Cognito/Google) | 개인별 로그인 | ALB 필요(A안에 +$20), 설정 많음 |
| 보안 그룹 IP 제한 | 공격면 자체 제거 | 재택/모바일 접근 불가, 고정 IP 필요 |
| **Caddy Basic auth (추천)** | 5분 설정, 비용 0, 같은 오리진이라 SPA의 fetch에도 자격증명이 자동 첨부 | 팀 공용 계정 1개, 개인 식별 불가 |

추천: Caddy Basic auth + (가능하면) IP 제한 병행. 비밀번호는 SSM에 두고 퇴사자 발생 시 교체.

## 이후: GitHub OAuth

1. GitHub OAuth App 등록(콜백 `https://<도메인>/api/v1/auth/github/callback/`), 클라이언트 비밀은 SSM.
2. 로그인 시 `read:org`로 조직 멤버십 확인 → Django 세션 생성. 비멤버는 거부.
3. `api_view`에 인증 검사 추가(헬스체크 제외). 세션 쿠키를 쓰게 되므로 지금의 `csrf_exempt`를 걷어내거나
   SameSite=Lax + Origin 검사로 CSRF를 다시 막는다.
4. 리뷰/작업의 작성자 필드를 GitHub 로그인으로 채우고, 안정화되면 Basic auth 제거.

## 배포 순서 체크리스트

1. [ ] 도메인 결정, Route 53(또는 기존 DNS)에 A 레코드 준비
2. [ ] SSM에 비밀값 5종 등록, 인스턴스 역할(SSM 읽기, S3 백업 버킷 쓰기) 생성
3. [ ] EC2 t4g.small(Amazon Linux 2023) + Elastic IP, 보안 그룹 80/443, Docker/Compose 설치, SSM Agent 확인
4. [ ] 레포 체크아웃(태그 고정), SSM → `.env` 생성(`DEBUG=False`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_BEHIND_HTTPS_PROXY=True` 등)
5. [ ] `docker compose -f docker-compose.prod.yml up -d --build` (migrate 서비스가 먼저 끝나야 backend 기동)
6. [ ] Caddy 설정(TLS + Basic auth), `https://<도메인>/api/v1/health/` 200 확인
7. [ ] 백업 cron + DLM 스냅샷 설정, 첫 백업 복원 리허설
8. [ ] CloudWatch 에이전트 또는 `docker logs` 보존 정책, 헬스체크 외부 모니터(예: Route 53 헬스체크) 등록
9. [ ] 팀에 URL/공용 계정 공유, GitHub OAuth 작업 착수
