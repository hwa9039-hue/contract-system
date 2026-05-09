# 배포·백업·인증 한눈에 보기

회사 내부에서 안전하게 쓰려면 보통 아래 세 가지를 같이 둡니다.

## 1. 자동 백업이란?

PostgreSQL 데이터를 주기적으로 파일로 덤프해 두는 것입니다. NAS나 서버가 고장 나도 덤프 파일이 있으면 복구할 수 있습니다.

### NAS에서 Bash가 되는 경우

`DATABASE_URL`을 설정한 뒤 cron 또는 작업 스케줄러에서 매일 실행합니다.

```bash
cd /path/to/contract-management-system
export DATABASE_URL="postgresql://USER:PASS@HOST:PORT/DBNAME"
bash scripts/backup-postgres.sh
```

덤프 파일 위치는 기본값 `./backups/` 입니다. 다른 경로를 쓰려면 `BACKUP_DIR` 환경변수를 지정합니다.

### Windows에서 PostgreSQL 클라이언트(pg_dump)가 설치된 경우

PowerShell에서:

```powershell
cd C:\path\to\contract-management-system
$env:DATABASE_URL="postgresql://USER:PASS@HOST:PORT/DBNAME"
.\scripts\backup-postgres.ps1
```

작업 스케줄러에 같은 명령을 등록하면 매일 자동 백업됩니다.

### 필요한 것

- 서버나 NAS에 `pg_dump` 명령이 PATH에 있어야 합니다(PostgreSQL 클라이언트).
- `DATABASE_URL`은 백엔드 `.env`와 동일하게 맞춥니다.

---

## 2. 인증 방식이란?

프론트에만 비밀번호를 두면 브라우저에 번들로 노출됩니다. 지금 구조는 다음 두 겹입니다.

1. **공용 비밀번호**: 서버 환경변수 `AUTH_SHARED_PASSWORD`에만 저장합니다.
2. **JWT**: 로그인 성공 시 서버가 짧은 유효기간의 토큰을 주고, 모든 `/api/*` 요청에 `Authorization: Bearer ...`로 붙입니다.

로컬에서 API 인증을 끄려면 백엔드에 `AUTH_DISABLED=true`를 설정합니다. 그때는 프론트가 기존처럼 `VITE_APP_SHARED_PASSWORD`로만 검사합니다.

프로덕션에서는 반드시 다음을 설정합니다.

- `JWT_SECRET`: 긴 무작위 문자열
- `AUTH_SHARED_PASSWORD`: 팀 공용 비밀번호(프론트 `VITE_APP_SHARED_PASSWORD`와 동일하게 맞추는 것을 권장)

---

## 3. 배포 경로란?

브라우저에서 사용자가 접속하는 주소와 API 주소가 어디로 연결되는지입니다.

대표적인 형태는 다음과 같습니다.

| 구분 | 예시 |
|------|------|
| 프론트 | Cloudflare Pages 도메인 또는 `https://contract.example.com` |
| API | 같은 회사 도메인의 서브도메인 `https://api.example.com` 또는 NAS 공인 IP `http://x.x.x.x:8000` |
| DB | 내부망 NAS의 PostgreSQL |

HTTPS 프론트에서 HTTP API만 열려 있으면 브라우저가 요청을 막을 수 있습니다. 그럴 때는 NAS 앞단에 **리버스 프록시(Nginx 등)** 또는 **Cloudflare Tunnel**로 API에도 HTTPS를 붙이는 방식을 씁니다.

프론트 빌드 시 `VITE_API_BASE_URL`을 실제로 접근 가능한 API 주소로 넣습니다.

---

## 관련 환경변수

백엔드 `backend/.env.example`, 프론트 루트 `.env.example`를 참고하세요.

---

## 회사 배포 «방법 B» — 단계별 (JWT + CORS)

화면에 **Failed to fetch** 또는 **CORS policy / No Access-Control-Allow-Origin** 이 뜨면, 브라우저가 **API 서버를 허용된 출처로 인정하지 못했다**는 뜻입니다. 아래를 **순서대로** 적용한 뒤, 반드시 **백엔드 컨테이너를 다시 빌드·재시작**하세요.

### A. 백엔드가 도는 곳 (Synology NAS Container Manager 예시)

1. NAS 웹 관리 페이지에 **관리자 계정**으로 로그인합니다.
2. 메인 메뉴에서 **Docker**(또는 **컨테이너 매니저**) 아이콘을 클릭합니다.
3. 왼쪽 또는 상단에서 **컨테이너**(Containers) 목록으로 들어갑니다.
4. 이 프로젝트용 FastAPI 컨테이너 이름을 찾아 **클릭**합니다.
5. 상단 또는 우측의 **편집**(Edit) 또는 **환경 변수**(Environment / Variables) 메뉴로 들어갑니다.
6. 아래 변수를 **한 줄씩 추가**합니다. (이미 있으면 값만 같은 의미로 맞춥니다.)

| 변수 이름 | 무엇을 넣나 |
|-----------|-------------|
| `DATABASE_URL` | PostgreSQL 접속 문자열 (NAS DB 주소·포트·DB명·계정) |
| `CORS_ORIGINS` | 프론트 주소들을 **쉼표로만** 연결. 예: `http://localhost:5173,http://127.0.0.1:5173,https://contract.signtelecom-smartdi.com` |
| `JWT_SECRET` | **남들이 모르는 긴 문자열** (영문·숫자 32자 이상 권장). 예: 메모장에 아무 문장 친 뒤 일부만 쓰거나, 관리자에게 난수 생성 요청 |
| `AUTH_SHARED_PASSWORD` | 팀에서 정한 **공용 로그인 비밀번호** (프론트와 반드시 동일) |
| `AUTH_DISABLED` | 회사 운영 시 **`false`** 또는 이 줄 없음 (인증 켜짐) |

7. **저장**(Apply / Save)을 누릅니다.
8. 같은 컨테이너 화면에서 **재시작**(Restart)을 누릅니다.  
   **코드를 Git에서 받았다면** 이미지를 **다시 빌드**한 뒤 재시작해야 최신 CORS 코드가 반영됩니다.

### B. Cloudflare Pages (프론트 배포)

1. 브라우저에서 **Cloudflare 대시보드**(dash.cloudflare.com)에 로그인합니다.
2. 왼쪽 메뉴에서 **Workers & Pages**를 클릭합니다.
3. 목록에서 이 사이트용 **Pages 프로젝트**(예: contract 관련 이름)를 **클릭**합니다.
4. 상단 탭에서 **Settings**(설정)을 클릭합니다.
5. 왼쪽에서 **Environment variables**(환경 변수)를 클릭합니다.
6. **Production**(프로덕션) 섹션에서 **Add variable**(변수 추가) 또는 **Configure**(구성)을 누릅니다.
7. 다음을 추가합니다.

| Variable name | Value (예시 — 실제 API 주소로 바꿈) |
|---------------|-------------------------------------|
| `VITE_API_BASE_URL` | API 전용 주소. 예: `https://api.signtelecom-smartdi.com` (**반드시 프론트 주소와 다르게**: API만 받는 서브도메인 또는 NAS HTTPS 주소) |
| `VITE_APP_SHARED_PASSWORD` | 위에서 넣은 `AUTH_SHARED_PASSWORD`와 **완전히 동일** |

8. **Save**(저장)합니다.
9. 상단 **Deployments**(배포) 탭으로 가서 **최신 배포를 다시 실행**(Retry deployment)하거나, Git에 빈 커밋을 올려 **새 빌드**가 돌게 합니다.  
   (환경 변수는 **빌드 시점**에 프론트에 박히므로, 변수를 바꾼 뒤에는 **재배포가 필수**입니다.)

### C. 꼭 확인할 것 (CORS / Failed to fetch)

1. **프론트 주소**가 `https://contract.signtelecom-smartdi.com` 이라면, 브라우저는 그 주소를 **Origin**으로 보냅니다. 백엔드의 `CORS_ORIGINS` 또는 코드의 허용 목록에 이 주소가 포함되어야 합니다. (저장소 최신 코드는 `*.signtelecom-smartdi.com` 형태도 정규식으로 허용합니다.)
2. **`VITE_API_BASE_URL`**은 반드시 **API 서버의 실제 URL**이어야 합니다. 프론트와 같은 주소만 넣으면 정적 파일만 열리고 API가 없어 실패합니다.
3. 프론트는 **HTTPS**인데 API만 **HTTP**(예: `http://192.168.x.x:8000`)이면 브라우저가 막을 수 있습니다. 그 경우 NAS 앞에 **HTTPS**(예: `https://api....`)를 붙이거나 Cloudflare Tunnel 등으로 맞춥니다.

### D. 비밀번호는 어디서 맞추나?

- **서버만 알아야 하는 값**: `JWT_SECRET`, `DATABASE_URL`
- **팀 공용 비번 (서버·빌드 둘 다 동일)**: `AUTH_SHARED_PASSWORD` = `VITE_APP_SHARED_PASSWORD`

배포 후에는 브라우저에서 **시크릿 창**으로 사이트를 열고, 로그인 → 문서수발신대장이 **데이터 로드되는지** 확인합니다.
