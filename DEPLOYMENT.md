# 배포·백업·인증 한눈에 보기

회사 내부에서 안전하게 쓰려면 보통 아래 세 가지를 같이 둡니다.

## 1. 자동 백업이란?

PostgreSQL **전체 DB**를 `pg_dump`로 한 번에 덤프(`.dump`)합니다.  
예전처럼 일부 테이블만 CSV로 뽑으면 `weekly_work_reports_rows`, `install_cases_rows` 등 **나중에 추가된 테이블이 빠질 수 있으므로**, 반드시 아래 스크립트를 쓰세요.

| 스크립트 | 용도 |
|----------|------|
| `scripts/backup-postgres.sh` | Synology NAS / Linux / macOS |
| `scripts/backup-postgres.ps1` | Windows |

### Synology NAS 작업 스케줄러 (권장)

1. **제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트**
2. **실행 명령** (경로는 NAS에 클론한 실제 위치로 바꿈):

```bash
/bin/bash /volume1/docker/contract-management-system/scripts/backup-postgres.sh
```

3. **중요**: `cd` 없이 **bash + 스크립트 절대 경로**로 실행합니다. 스크립트가 프로젝트 루트의 `.env` / `backend/.env`에서 `DATABASE_URL`을 자동으로 읽습니다.
4. 구식 **테이블별 CSV 백업 작업은 비활성화**하고, 위 작업만 남깁니다.

스케줄러가 프로젝트 폴더 밖에서 실행되면, 작업에 환경 변수를 추가할 수 있습니다.

| 변수 | 값 예시 |
|------|---------|
| `CMS_PROJECT_ROOT` | `/volume1/docker/contract-management-system` |

### .env / 저장 경로

| 항목 | 기본 동작 |
|------|-----------|
| `DATABASE_URL` | 환경변수 없으면 `<프로젝트>/.env` → `<프로젝트>/backend/.env` 순으로 로드 |
| `BACKUP_DIR` | 미설정 시 `<프로젝트>/backups` (실행 위치와 무관) |

백업 1회 실행 시 `<BACKUP_DIR>/YYYYMMDD_HHMMSS/` 폴더가 생깁니다.

| 항목 | 경로 |
|------|------|
| DB 덤프 | `.../pg_backup_YYYYMMDD_HHMMSS.dump` |
| 업로드·데이터 파일 | `.../files/` (xlsx·pdf 등 **원본 확장자 그대로**) |

파일 복사 대상(자동): `backend/postgres_data`, `backend/uploads`, API 컨테이너 `/app/uploads` 등.  
경로가 다르면 `.env`에 `BACKUP_HOST_PATHS`, `BACKUP_UPLOAD_CONTAINER_PATHS` 지정.

### 계약 엑셀 업로드 서버 백업 (.xlsx)

계약현황 **엑셀 업로드**가 `/api/contracts/import`로 성공하면(신규 1건 이상), 서버가 DB에 넣은 행만 역으로 `.xlsx`를 만들어 둘 수 있습니다.

| 항목 | 설명 |
|------|------|
| 환경변수 | `CONTRACT_IMPORT_EXCEL_BACKUP_DIR` — 디렉터리 절대 경로 (미설정이면 기능 생략) |
| 파일명 | `계약현황_백업_YYYYMMDD_HHMMSS.xlsx` |
| 시트 | `계약현황`(신규 저장분), `중복제외`(중복 식별 목록, 해당 시 행 존재) |

Docker에서는 컨테이너 안 경로와 NAS 폴더를 **볼륨 마운트**로 맞춥니다.

```yaml
environment:
  - CONTRACT_IMPORT_EXCEL_BACKUP_DIR=/data/contract_excel_backup
volumes:
  - /volume1/backup/contract-excel-import:/data/contract_excel_backup
```

위 NAS 공유폴더를 `backup-postgres.sh`의 `BACKUP_HOST_PATHS` 등에 포함하면 파일 복사 백업에도 같이 잡히게 할 수 있습니다.

`docker-compose.yml` 기본 설정:

```yaml
environment:
  CONTRACT_IMPORT_EXCEL_BACKUP_DIR: /data/contract_excel_backup
volumes:
  - ./data/contract_excel_backup:/data/contract_excel_backup
```

호스트 경로 `backend/data/contract_excel_backup`이 `BACKUP_HOST_PATHS`에 포함되면 스케줄 백업에 `.xlsx`도 함께 복사됩니다.

**NAS 점검:** [docs/NAS-BACKUP-CHECKLIST.md](docs/NAS-BACKUP-CHECKLIST.md)

### pg_dump / Docker (중요)

`backend/docker-compose.yml`에는 **`contract-backend`(FastAPI)만** 있고 PostgreSQL 서비스는 없습니다.  
`DATABASE_URL`의 `192.168.0.100:5433` 은 **별도 PostgreSQL**(패키지 또는 다른 컨테이너)입니다.

**`contract-backend` 컨테이너로는 백업하지 마세요.** API 이미지에 `pg_dump`가 없습니다.

백업 스크립트 동작 순서:

1. **`POSTGRES_DOCKER_CONTAINER`** (`.env` 지정) 또는 **자동 탐지** → `docker exec -i <DB컨테이너> pg_dump -U smartdi -d smartdi ...` (컨테이너 **내부** 5432 / 로컬 소켓. 호스트 포트 5433과 무관)
2. 자동 탐지: `DATABASE_URL`의 포트(예 `5433`)로 publish 된 컨테이너 → 이름에 `smartdi`/`postgres` 포함 → `postgres` 이미지
3. Docker·DB 컨테이너가 없을 때만 호스트 `pg_dump`
4. 없으면 `postgres:16-alpine` 임시 컨테이너 (`docker run --network host`)

0바이트 덤프는 대개 **호스트 pg_dump**가 NAS 로컬 DB에 붙었을 때 발생합니다. 최신 스크립트는 Docker DB를 **우선** 사용합니다.

컨테이너 이름을 직접 지정하려면 NAS SSH에서:

```bash
docker ps --format '{{.Names}}\t{{.Image}}'
```

`backend/.env` 예:

```env
POSTGRES_DOCKER_CONTAINER=실제_포스트그레스_컨테이너_이름
```

`backend/backup-postgres.sh` 또는 `scripts/backup-postgres.sh` 둘 다 동일 로직입니다.

### 수동 실행 (SSH)

```bash
/bin/bash /volume1/docker/contract-management-system/scripts/backup-postgres.sh
```

성공 시 `Backup OK: .../backups/pg_backup_YYYYMMDD_HHMMSS.dump (... bytes)` 가 출력됩니다.

### Windows

PowerShell에서 (`.env` 자동 로드):

```powershell
.\scripts\backup-postgres.ps1
```

작업 스케줄러에 같은 명령을 등록하면 매일 자동 백업됩니다.

### 필요한 것

- `DATABASE_URL`은 백엔드 `backend/.env`와 동일 (루트 `.env`에 넣어도 됨).
- 호스트 `pg_dump`, 또는 Docker 위 **fallback** 중 하나.

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
