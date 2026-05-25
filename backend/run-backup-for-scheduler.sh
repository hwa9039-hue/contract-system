#!/bin/bash
# Synology 작업 스케줄러 → "사용자 정의 스크립트"에 아래 한 줄만 등록:
#   /bin/bash /volume1/docker/contract-backend/backend/run-backup-for-scheduler.sh
#
# 실행 사용자: root (Docker 접근 필요)
export CMS_PROJECT_ROOT=/volume1/docker/contract-backend
SCRIPT="/volume1/docker/contract-backend/backend/backup-postgres.sh"
LOG="/volume1/docker/contract-backend/backups/scheduler-last.log"

mkdir -p "/volume1/docker/contract-backend/backups"

# File Station(Windows) 복사 시 CRLF → bash exit 2 방지
if [[ -f "$SCRIPT" ]]; then
  sed -i 's/\r$//' "$SCRIPT" 2>/dev/null || true
fi
sed -i 's/\r$//' "$0" 2>/dev/null || true

{
  echo "========== $(date '+%Y-%m-%d %H:%M:%S') =========="
  /bin/bash "$SCRIPT"
  ec=$?
  echo "exit code: ${ec}"
  exit "${ec}"
} >> "$LOG" 2>&1
