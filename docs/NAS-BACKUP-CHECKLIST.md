# NAS 자동 백업 점검 체크리스트

Synology NAS에서 **PostgreSQL 덤프 + 업로드 원본 파일**이 함께 백업되는지 확인할 때 사용합니다.

---

## 1. 사전 준비

- [ ] 프로젝트가 NAS에 클론되어 있음 (예: `/volume1/docker/contract-management-system`)
- [ ] `backend/.env` 또는 프로젝트 루트 `.env`에 `DATABASE_URL` 설정됨
- [ ] PostgreSQL 컨테이너가 실행 중 (`docker ps`)
- [ ] API 컨테이너(`contract-backend`)가 실행 중이고 `./uploads` 볼륨 마운트됨
- [ ] (권장) `CONTRACT_IMPORT_EXCEL_BACKUP_DIR=/data/contract_excel_backup` 및 `./data/contract_excel_backup` 볼륨 마운트됨

### .env 예시 (NAS)

```env
DATABASE_URL=postgresql://smartdi:비밀번호@192.168.0.100:5433/smartdi
POSTGRES_DOCKER_CONTAINER=실제_포스트그레스_컨테이너_이름
BACKUP_APP_DOCKER_CONTAINER=contract-backend
BACKUP_DIR=/volume1/backup/contract-db
BACKUP_HOST_PATHS=backend/postgres_data,backend/uploads,backend/data/contract_excel_backup
CONTRACT_IMPORT_EXCEL_BACKUP_DIR=/data/contract_excel_backup
```

---

## 2. 수동 백업 1회 실행

SSH 접속 후:

```bash
/bin/bash /volume1/docker/contract-management-system/scripts/backup-postgres.sh
```

### 성공 로그 확인

- [ ] `Dump OK: .../pg_backup_YYYYMMDD_HHMMSS.dump (... bytes)` — **0 bytes 아님**
- [ ] `Excel OK: .../excel/ (9 files)` — **메뉴별 xlsx 9종**
- [ ] `Files OK (host): .../backend/uploads → ...` 또는 `Files OK (docker cp): ...`
- [ ] `Backup session complete: .../YYYYMMDD_HHMMSS`

### 실패 시 흔한 원인

| 증상 | 조치 |
|------|------|
| dump 0 bytes | `POSTGRES_DOCKER_CONTAINER`를 실제 DB 컨테이너명으로 지정 |
| `contract-backend`로 dump 시도 | API 컨테이너에는 pg_dump 없음 — DB 컨테이너 사용 |
| `No upload/data directories were copied` | `BACKUP_HOST_PATHS`에 `backend/uploads` 추가 |
| `Menu Excel export failed` | API 이미지 재빌드 (`export_menu_excel_backups.py` 포함) |
| DATABASE_URL 없음 | `.env` 경로·`CMS_PROJECT_ROOT` 확인 |

---

## 3. 백업 폴더 구조 확인

최신 세션 폴더:

```bash
ls -la /volume1/backup/contract-db/$(ls -t /volume1/backup/contract-db | head -1)/
```

- [ ] `pg_backup_*.dump` 파일 존재
- [ ] `excel/` 폴더에 **9개** `.xlsx` (계약·영업·문서·건축·사업검색·주간보고·캘린더·설치사례·게시판)
- [ ] `files/` 하위 폴더 존재

```bash
ls -lh /volume1/docker/contract-backend/backups/$(ls -t /volume1/docker/contract-backend/backups | head -1)/excel/
```

- [ ] `install-cases/` — 설치사례 `.jpg` (있을 경우)
- [ ] `materials-board/` — 게시판 첨부 `.pdf`, `.xlsx` 등 (있을 경우)
- [ ] `contract_excel_backup/` 또는 `host_contract_excel_backup/` — 계약 import `.xlsx` (있을 경우)

---

## 4. 메뉴별 백업 포함 여부

| 메뉴 | pg_dump | excel/ | files/ |
|------|---------|--------|--------|
| 계약·영업·건축·문서·사업검색·주간보고·캘린더 | ✅ | ✅ `.xlsx` | — |
| **설치사례** | ✅ | ✅ 요약 `.xlsx` | ✅ `.jpg` |
| **게시판** | ✅ | ✅ 목록 `.xlsx` | ✅ 첨부 원본 |

- [ ] 캘린더: API `/api/calendar-events` 배포 후 기타 일정이 DB에 저장되는지 확인
- [ ] 설치사례·게시판: files 백업에 실제 첨부/이미지 포함 확인

---

## 5. Synology 작업 스케줄러

**제어판 → 작업 스케줄러 → 예약된 작업**

- [ ] 구식 **테이블별 CSV 백업** 작업 비활성화
- [ ] **실행 사용자: root** (Docker 접근)
- [ ] **작업 스케줄러 → 설정 → 저장 폴더** 지정 (실행 로그 확인용)
- [ ] 「사용자 정의 스크립트」에 **한 줄만** 등록 (줄바꿈 `\` 사용 금지):

```bash
/bin/bash /volume1/docker/contract-backend/backend/run-backup-for-scheduler.sh
```

- [ ] 실행 주기: 매일 새벽 등 원하는 시간
- [ ] **실행** 버튼으로 수동 테스트 → `backups/` 아래 **오늘 날짜 폴더** 생성 확인
- [ ] 실패 시 `backups/scheduler-last.log` 열어 원인 확인

### 스케줄러가 「중단됨 (2)」로 1초 만에 끝날 때

| 원인 | 해결 |
|------|------|
| Windows에서 복사한 `.sh` **CRLF** 줄바꿈 | NAS SSH: `sed -i 's/\r$//' /volume1/docker/contract-backend/backend/backup-postgres.sh` |
| `\` 줄바꿈으로 스크립트 등록 | 위 **한 줄** 명령만 사용 |
| root가 아닌 사용자 실행 | 작업 편집 → 일반 → 사용자 **root** |
| Docker 권한 없음 | root로 실행하거나 해당 사용자를 docker 그룹에 추가 |

수동 SSH 테스트 (스케줄러와 동일):

```bash
/bin/bash /volume1/docker/contract-backend/backend/run-backup-for-scheduler.sh
cat /volume1/docker/contract-backend/backups/scheduler-last.log
ls -lt /volume1/docker/contract-backend/backups/ | head
```

---

## 6. 백엔드·프론트 배포 확인

백업/캘린더 API 반영 후:

```bash
cd /volume1/docker/contract-management-system/backend
docker compose build --no-cache && docker compose up -d --force-recreate
```

- [ ] `curl -s https://API주소/api/health` → `"calendarEvents": true`
- [ ] 프론트 Cloudflare Pages 최신 배포 (Ctrl+Shift+R)

---

## 7. 복구 연습 (권장, 분기 1회)

- [ ] 테스트 DB 또는 스테이징에서 `.dump` 복원:

```bash
pg_restore -d "postgresql://..." --clean --if-exists /path/to/pg_backup_*.dump
```

- [ ] `files/` → `backend/uploads` 복사 후 설치사례·게시판 파일 접근 확인

---

## 8. 체크리스트 요약

| # | 항목 | OK |
|---|------|-----|
| 1 | 수동 스크립트 dump > 0 bytes | ☐ |
| 2 | files/ 에 uploads 복사됨 | ☐ |
| 3 | 스케줄러 등록·최근 실행 성공 | ☐ |
| 4 | 캘린더 기타 일정 DB 저장 | ☐ |
| 5 | 계약 엑셀 백업 폴더 마운트 | ☐ |

문제 발생 시 `DEPLOYMENT.md` 1절(자동 백업)과 함께 참고하세요.
