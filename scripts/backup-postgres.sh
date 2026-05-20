#!/usr/bin/env bash
# 전체 PostgreSQL DB 백업 (pg_dump custom format .dump)
# - 모든 테이블 포함 (주간업무보고서·게시판·설치사례 등 CSV 개별 추출 방식 대체)
# - DATABASE_URL: 환경변수, 또는 프로젝트 .env / backend/.env
# - BACKUP_DIR:   환경변수, .env, 또는 <프로젝트>/backups
#
# Synology 작업 스케줄러 예:
#   /bin/bash /volume1/docker/contract-management-system/scripts/backup-postgres.sh
# (반드시 bash 로 실행 — /bin/sh 만 쓰면 .env 파싱이 실패할 수 있음)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# NAS 스케줄러가 다른 cwd 로 실행할 때: 환경변수로 프로젝트 루트 고정 가능
if [[ -n "${CMS_PROJECT_ROOT:-}" ]]; then
  PROJECT_ROOT="$(cd "${CMS_PROJECT_ROOT}" && pwd)"
fi

# ---------------------------------------------------------------------------
# .env 파싱 (export 키워드·따옴표·CRLF 지원)
# ---------------------------------------------------------------------------
read_dotenv_value() {
  local file="$1"
  local key="$2"
  local line value

  [[ -f "$file" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    line="${line#export }"
    if [[ "$line" =~ ^[[:space:]]*${key}[[:space:]]*=[[:space:]]*(.*)$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ ${#value} -ge 2 ]]; then
        local q="${value:0:1}"
        if [[ "$q" == '"' || "$q" == "'" ]] && [[ "${value: -1}" == "$q" ]]; then
          value="${value:1:${#value}-2}"
        fi
      fi
      printf '%s' "$value"
      return 0
    fi
  done <"$file"
  return 1
}

load_env_from_files() {
  local f val
  for f in "${PROJECT_ROOT}/.env" "${PROJECT_ROOT}/backend/.env"; do
    if [[ -z "${DATABASE_URL:-}" ]]; then
      if val="$(read_dotenv_value "$f" "DATABASE_URL")"; then
        export DATABASE_URL="$val"
      fi
    fi
    if [[ -z "${BACKUP_DIR:-}" ]]; then
      if val="$(read_dotenv_value "$f" "BACKUP_DIR")"; then
        export BACKUP_DIR="$val"
      fi
    fi
  done
}

load_env_from_files

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "  Add DATABASE_URL=... to ${PROJECT_ROOT}/.env or ${PROJECT_ROOT}/backend/.env" >&2
  echo "  Or export DATABASE_URL before running this script." >&2
  exit 1
fi

if [[ -z "${BACKUP_DIR:-}" ]]; then
  BACKUP_DIR="${PROJECT_ROOT}/backups"
  export BACKUP_DIR
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/pg_backup_${STAMP}.dump"
OUT_BASENAME="$(basename "$OUT")"

# ---------------------------------------------------------------------------
# pg_dump 실행 (호스트 → docker exec → docker 클라이언트 이미지 순)
# ---------------------------------------------------------------------------
run_pg_dump() {
  if [[ -n "${PG_DUMP_CMD:-}" ]]; then
    # 고급: OUT 경로를 쓰려면 PG_DUMP_CMD 안에 $OUT 을 포함 (예: pg_dump ... -f "$OUT")
    # shellcheck disable=SC2086
    eval "$PG_DUMP_CMD"
    return
  fi

  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "$OUT"
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    if [[ -n "${POSTGRES_DOCKER_CONTAINER:-}" ]]; then
      echo "Using pg_dump inside container: ${POSTGRES_DOCKER_CONTAINER}" >&2
      docker exec "$POSTGRES_DOCKER_CONTAINER" \
        pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "/tmp/${OUT_BASENAME}"
      docker cp "${POSTGRES_DOCKER_CONTAINER}:/tmp/${OUT_BASENAME}" "$OUT"
      docker exec "$POSTGRES_DOCKER_CONTAINER" rm -f "/tmp/${OUT_BASENAME}"
      return
    fi

    echo "Using Docker postgres client image (host pg_dump not found)..." >&2
    docker run --rm \
      --network host \
      -v "${BACKUP_DIR}:/backup:rw" \
      -e "DATABASE_URL=${DATABASE_URL}" \
      postgres:16-alpine \
      pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "/backup/${OUT_BASENAME}"
    return
  fi

  echo "ERROR: pg_dump not found and Docker fallback is unavailable." >&2
  echo "  - Install PostgreSQL client (pg_dump) on the NAS, or" >&2
  echo "  - Set POSTGRES_DOCKER_CONTAINER=<postgres-container-name>, or" >&2
  echo "  - Install Docker and ensure 'docker run' can reach your DATABASE_URL host." >&2
  exit 1
}

run_pg_dump

if [[ ! -s "$OUT" ]]; then
  echo "ERROR: Backup file is missing or empty: $OUT" >&2
  exit 1
fi

BYTES="$(wc -c <"$OUT" | tr -d ' ')"
echo "Backup OK: ${OUT} (${BYTES} bytes)"
echo "Project root: ${PROJECT_ROOT}"
