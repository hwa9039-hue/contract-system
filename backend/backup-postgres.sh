#!/usr/bin/env bash
# 전체 PostgreSQL DB 백업 (pg_dump custom format .dump)
# - contract-backend 컨테이너는 API 전용(DB 아님). PostgreSQL 컨테이너를 자동 탐지하거나 POSTGRES_DOCKER_CONTAINER 로 지정.
# - NAS: 호스트 pg_dump 대신 docker exec -i 로 DB 컨테이너 내부 PostgreSQL(기본 5432)에 접속합니다.
# - 실행 위치: scripts/backup-postgres.sh 또는 backend/backup-postgres.sh
#
# Synology 작업 스케줄러 예:
#   /bin/bash /volume1/docker/contract-management-system/scripts/backup-postgres.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(basename "$SCRIPT_DIR")" == "backend" ]]; then
  BACKEND_DIR="$SCRIPT_DIR"
  PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
else
  PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
  BACKEND_DIR="${PROJECT_ROOT}/backend"
fi

if [[ -n "${CMS_PROJECT_ROOT:-}" ]]; then
  PROJECT_ROOT="$(cd "${CMS_PROJECT_ROOT}" && pwd)"
  BACKEND_DIR="${PROJECT_ROOT}/backend"
fi

DOCKER=(docker)
if ! docker ps >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker ps >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  fi
fi

# ---------------------------------------------------------------------------
# .env
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
  for f in \
    "${SCRIPT_DIR}/.env" \
    "${BACKEND_DIR}/.env" \
    "${PROJECT_ROOT}/.env"; do
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
    if [[ -z "${POSTGRES_DOCKER_CONTAINER:-}" ]]; then
      if val="$(read_dotenv_value "$f" "POSTGRES_DOCKER_CONTAINER")"; then
        export POSTGRES_DOCKER_CONTAINER="$val"
      fi
    fi
  done
}

load_env_from_files

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "  Checked: ${SCRIPT_DIR}/.env, ${BACKEND_DIR}/.env, ${PROJECT_ROOT}/.env" >&2
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

# postgresql://user:pass@host:port/dbname
parse_database_url() {
  PGUSER="" PGPASSWORD="" PGHOST="" PGPORT="" PGDATABASE=""
  if [[ "$DATABASE_URL" =~ ^postgres(ql)?://([^:@/]+)(:([^@]*))?@([^:/]+)(:([0-9]+))?/([^?[:space:]]+) ]]; then
    PGUSER="${BASH_REMATCH[2]}"
    PGPASSWORD="${BASH_REMATCH[4]:-}"
    PGHOST="${BASH_REMATCH[5]}"
    PGPORT="${BASH_REMATCH[7]:-5432}"
    PGDATABASE="${BASH_REMATCH[8]}"
    return 0
  fi
  return 1
}

parse_database_url || true

is_backend_container() {
  case "${1,,}" in
    contract-backend*|contract_backend*) return 0 ;;
  esac
  return 1
}

# DATABASE_URL 의 호스트 포트(예: 5433)로 publish 된 컨테이너 탐지
detect_postgres_container_by_port() {
  local port="${PGPORT:-}"
  [[ -n "$port" ]] || return 1

  local name ports
  local -a matches=()

  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    is_backend_container "$name" && continue

    ports="$("${DOCKER[@]}" port "$name" 2>/dev/null || true)"
    [[ -z "$ports" ]] && continue
    if grep -qE ":${port}(->|$)|0\.0\.0\.0:${port}" <<<"$ports"; then
      matches+=("$name")
    fi
  done < <("${DOCKER[@]}" ps --format '{{.Names}}' 2>/dev/null || true)

  if [[ ${#matches[@]} -eq 1 ]]; then
    echo "${matches[0]}"
    return 0
  fi

  if [[ ${#matches[@]} -gt 1 ]]; then
    local preferred m
    for preferred in smartdi postgres postgresql pgsql db; do
      for m in "${matches[@]}"; do
        if [[ "${m,,}" == *"${preferred,,}"* ]]; then
          echo "$m"
          echo "WARN: multiple containers publish port ${port}; using: $m (others: ${matches[*]})" >&2
          return 0
        fi
      done
    done
    echo "${matches[0]}"
    echo "WARN: multiple containers publish port ${port}; using first: ${matches[0]} (all: ${matches[*]})" >&2
    return 0
  fi

  return 1
}

# contract-backend 는 FastAPI 전용 — PostgreSQL 이미지 컨테이너만 선택
detect_postgres_container() {
  local name image
  local -a matches=()

  while IFS=$'\t' read -r name image; do
    [[ -z "$name" ]] && continue
    is_backend_container "$name" && continue
    case "${image,,}" in
      *postgres*|*postgresql*|*timescale*)
        matches+=("$name")
        ;;
    esac
  done < <("${DOCKER[@]}" ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null || true)

  if [[ ${#matches[@]} -eq 1 ]]; then
    echo "${matches[0]}"
    return 0
  fi

  if [[ ${#matches[@]} -gt 1 ]]; then
    local preferred
    for preferred in smartdi postgres postgresql pgsql db; do
      local m
      for m in "${matches[@]}"; do
        if [[ "${m,,}" == *"${preferred,,}"* ]]; then
          echo "$m"
          echo "WARN: multiple PostgreSQL containers; using: $m (others: ${matches[*]})" >&2
          return 0
        fi
      done
    done
    echo "${matches[0]}"
    echo "WARN: multiple PostgreSQL containers; using first: ${matches[0]} (all: ${matches[*]})" >&2
    return 0
  fi

  return 1
}

resolve_postgres_container() {
  if [[ -n "${POSTGRES_DOCKER_CONTAINER:-}" ]]; then
    echo "$POSTGRES_DOCKER_CONTAINER"
    return 0
  fi
  detect_postgres_container_by_port && return 0
  detect_postgres_container
}

read_container_postgres_env() {
  local container="$1"
  local line key val
  CONTAINER_POSTGRES_USER=""
  CONTAINER_POSTGRES_PASSWORD=""
  CONTAINER_POSTGRES_DB=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      POSTGRES_USER=*)
        val="${line#POSTGRES_USER=}"
        CONTAINER_POSTGRES_USER="${val%%$'\r'}"
        ;;
      POSTGRES_PASSWORD=*)
        val="${line#POSTGRES_PASSWORD=}"
        CONTAINER_POSTGRES_PASSWORD="${val%%$'\r'}"
        ;;
      POSTGRES_DB=*)
        val="${line#POSTGRES_DB=}"
        CONTAINER_POSTGRES_DB="${val%%$'\r'}"
        ;;
    esac
  done < <("${DOCKER[@]}" inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container" 2>/dev/null || true)
}

pg_dump_via_docker_exec() {
  local container="$1"
  local pg_user pg_pass pg_db

  read_container_postgres_env "$container"

  pg_user="${PGUSER:-${CONTAINER_POSTGRES_USER:-}}"
  pg_pass="${PGPASSWORD:-${CONTAINER_POSTGRES_PASSWORD:-}}"
  pg_db="${PGDATABASE:-${CONTAINER_POSTGRES_DB:-}}"

  if [[ -z "$pg_user" || -z "$pg_db" ]]; then
    echo "ERROR: Could not resolve PostgreSQL user/database for container '${container}'." >&2
    echo "  Set DATABASE_URL or POSTGRES_DOCKER_CONTAINER in .env" >&2
    exit 1
  fi

  echo "pg_dump via: docker exec -i ${container} pg_dump -U ${pg_user} -d ${pg_db} (inside container: port 5432 / local socket)" >&2

  : >"$OUT"
  "${DOCKER[@]}" exec -i -e PGPASSWORD="$pg_pass" "$container" \
    pg_dump -U "$pg_user" -d "$pg_db" -Fc --no-owner --no-acl >"$OUT"
}

pg_dump_via_docker_run_client() {
  echo "pg_dump via temporary postgres client container..." >&2
  "${DOCKER[@]}" run --rm \
    --network host \
    -v "${BACKUP_DIR}:/backup:rw" \
    -e "DATABASE_URL=${DATABASE_URL}" \
    postgres:16-alpine \
    pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "/backup/${OUT_BASENAME}"
}

docker_available() {
  command -v docker >/dev/null 2>&1 || [[ ${#DOCKER[@]} -gt 0 ]]
}

run_pg_dump() {
  if [[ -n "${PG_DUMP_CMD:-}" ]]; then
    # shellcheck disable=SC2086
    eval "$PG_DUMP_CMD"
    return
  fi

  # NAS: Docker DB 컨테이너가 있으면 호스트 pg_dump 보다 먼저 exec (0바이트·잘못된 대상 방지)
  if docker_available; then
    local pg_container
    if pg_container="$(resolve_postgres_container 2>/dev/null)" && [[ -n "$pg_container" ]]; then
      if "${DOCKER[@]}" inspect -f '{{.State.Running}}' "$pg_container" 2>/dev/null | grep -q true; then
        pg_dump_via_docker_exec "$pg_container"
        return
      fi
      echo "WARN: container '${pg_container}' is not running; trying other methods..." >&2
    fi
  fi

  if command -v pg_dump >/dev/null 2>&1; then
    echo "pg_dump on host (PATH) → ${DATABASE_URL%%@*}@..." >&2
    pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "$OUT"
    return
  fi

  if docker_available; then
    pg_dump_via_docker_run_client
    return
  fi

  echo "ERROR: pg_dump not found and no PostgreSQL Docker container detected." >&2
  echo "  - On NAS: docker ps --format '{{.Names}}\t{{.Image}}'" >&2
  echo "  - Set POSTGRES_DOCKER_CONTAINER=<name> in ${BACKEND_DIR}/.env" >&2
  echo "  - Note: contract-backend is NOT the database; do not use it for pg_dump." >&2
  exit 1
}

echo "Project root: ${PROJECT_ROOT}" >&2
echo "Backend dir:  ${BACKEND_DIR}" >&2
echo "Backup dir:   ${BACKUP_DIR}" >&2
if [[ -n "${POSTGRES_DOCKER_CONTAINER:-}" ]]; then
  echo "DB container: ${POSTGRES_DOCKER_CONTAINER} (from .env)" >&2
elif docker_available && pg_c="$(resolve_postgres_container 2>/dev/null || true)" && [[ -n "$pg_c" ]]; then
  echo "DB container: ${pg_c} (auto-detected)" >&2
fi

run_pg_dump

if [[ ! -s "$OUT" ]]; then
  echo "ERROR: Backup file is missing or empty: $OUT" >&2
  echo "  Tip: confirm container with: docker ps" >&2
  echo "  Set POSTGRES_DOCKER_CONTAINER in backend/.env if auto-detect picks the wrong one." >&2
  exit 1
fi

BYTES="$(wc -c <"$OUT" | tr -d ' ')"
echo "Backup OK: ${OUT} (${BYTES} bytes)"
