#!/usr/bin/env bash
# 전체 PostgreSQL DB 백업 (pg_dump) + 업로드·데이터 폴더 복사 (원본 확장자 유지)
# - DB: docker exec pg_dump → BACKUP_DIR/<날짜>/pg_backup_*.dump
# - 파일: docker cp / 호스트 backend/postgres_data·uploads → BACKUP_DIR/<날짜>/files/
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

trim_path() {
  local s="$1"
  s="${s//$'\r'/}"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

if [[ -n "${CMS_PROJECT_ROOT:-}" ]]; then
  CMS_PROJECT_ROOT="$(trim_path "$CMS_PROJECT_ROOT")"
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
  local f val key
  for f in \
    "${SCRIPT_DIR}/.env" \
    "${BACKEND_DIR}/.env" \
    "${PROJECT_ROOT}/.env"; do
    for key in \
      DATABASE_URL \
      BACKUP_DIR \
      POSTGRES_DOCKER_CONTAINER \
      BACKUP_APP_DOCKER_CONTAINER \
      BACKUP_UPLOAD_CONTAINER_PATHS \
      BACKUP_HOST_PATHS \
      BACKUP_SKIP_FILE_COPY \
      BACKUP_SKIP_EXCEL_EXPORT; do
      local var_name="$key"
      if [[ -z "${!var_name:-}" ]]; then
        if val="$(read_dotenv_value "$f" "$key")"; then
          export "${key}=${val}"
        fi
      fi
    done
  done
}

load_env_from_files

write_scheduler_log() {
  local msg="$1"
  local sched_log="${BACKUP_DIR}/scheduler-last.log"
  mkdir -p "$BACKUP_DIR"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${msg}" >>"$sched_log"
}

log_pg_dump_failure() {
  local log="$1"
  echo "ERROR: pg_dump failed. Details:" >&2
  if [[ -f "$log" ]]; then
    sed 's/^/  /' "$log" >&2
    write_scheduler_log "pg_dump failed — see ${log} and pg_dump.log in session folder"
  else
    write_scheduler_log "pg_dump failed (no log file at ${log})"
  fi
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "  Checked: ${SCRIPT_DIR}/.env, ${BACKEND_DIR}/.env, ${PROJECT_ROOT}/.env" >&2
  exit 1
fi

DATABASE_URL="$(trim_path "$DATABASE_URL")"
export DATABASE_URL

if [[ -z "${BACKUP_DIR:-}" ]]; then
  BACKUP_DIR="${PROJECT_ROOT}/backups"
fi
BACKUP_DIR="$(trim_path "$BACKUP_DIR")"
export BACKUP_DIR

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_SESSION_DIR="${BACKUP_DIR}/${STAMP}"
FILES_DIR="${BACKUP_SESSION_DIR}/files"
OUT="${BACKUP_SESSION_DIR}/pg_backup_${STAMP}.dump"
OUT_BASENAME="$(basename "$OUT")"

mkdir -p "$BACKUP_SESSION_DIR" "$FILES_DIR"

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
    *postgres*|*pgsql*)
      return 1
      ;;
    *contract-backend*|*contract_backend*)
      return 0
      ;;
  esac
  return 1
}

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
    local preferred m
    for preferred in smartdi postgres postgresql pgsql db; do
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

resolve_app_container() {
  if [[ -n "${BACKUP_APP_DOCKER_CONTAINER:-}" ]]; then
    echo "$BACKUP_APP_DOCKER_CONTAINER"
    return 0
  fi
  local name
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    if is_backend_container "$name"; then
      echo "$name"
      return 0
    fi
  done < <("${DOCKER[@]}" ps --format '{{.Names}}' 2>/dev/null || true)
  return 1
}

read_container_postgres_env() {
  local container="$1"
  local line val
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
  local log="${BACKUP_SESSION_DIR}/pg_dump.log"

  read_container_postgres_env "$container"

  pg_user="${PGUSER:-${CONTAINER_POSTGRES_USER:-}}"
  pg_pass="${PGPASSWORD:-${CONTAINER_POSTGRES_PASSWORD:-}}"
  pg_db="${PGDATABASE:-${CONTAINER_POSTGRES_DB:-}}"

  if [[ -z "$pg_user" || -z "$pg_db" ]]; then
    echo "ERROR: Could not resolve PostgreSQL user/database for container '${container}'." >&2
    exit 1
  fi

  echo "pg_dump via: docker exec -i ${container} pg_dump -U ${pg_user} -d ${pg_db}" >&2

  rm -f "$OUT"
  if ! "${DOCKER[@]}" exec -i -e PGPASSWORD="$pg_pass" "$container" \
    pg_dump -U "$pg_user" -d "$pg_db" -Fc --no-owner --no-acl >"$OUT" 2>"$log"; then
    log_pg_dump_failure "$log"
    exit 1
  fi

  if [[ ! -s "$OUT" ]]; then
    echo "ERROR: pg_dump produced empty file: $OUT" >&2
    log_pg_dump_failure "$log"
    exit 1
  fi
}

pg_dump_via_docker_run_client() {
  local log="${BACKUP_SESSION_DIR}/pg_dump.log"
  echo "pg_dump via temporary postgres client container..." >&2
  rm -f "$OUT"
  if ! "${DOCKER[@]}" run --rm \
    --network host \
    -v "${BACKUP_SESSION_DIR}:/backup:rw" \
    -e "DATABASE_URL=${DATABASE_URL}" \
    postgres:16-alpine \
    pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "/backup/${OUT_BASENAME}" >"$log" 2>&1; then
    log_pg_dump_failure "$log"
    exit 1
  fi

  if [[ ! -s "$OUT" ]]; then
    echo "ERROR: pg_dump via client container produced empty file: $OUT" >&2
    log_pg_dump_failure "$log"
    exit 1
  fi
}

pg_dump_via_app_container() {
  local container="$1"
  local container_out="/app/backups/${STAMP}/pg_backup_${STAMP}.dump"
  local log="${BACKUP_SESSION_DIR}/pg_dump.log"

  echo "pg_dump via API container '${container}' (python + pg_dump)..." >&2
  "${DOCKER[@]}" exec "$container" mkdir -p "/app/backups/${STAMP}" 2>/dev/null || true

  rm -f "$OUT"
  if ! "${DOCKER[@]}" exec \
    -e "DATABASE_URL=${DATABASE_URL}" \
    -e "BACKUP_DIR=/app/backups" \
    -e "BACKUP_STAMP=${STAMP}" \
    "$container" \
    python /app/run_pg_dump_backup.py \
      --output "$container_out" \
      --log "/app/backups/scheduler-last.log" \
    >"$log" 2>&1; then
    log_pg_dump_failure "$log"
    exit 1
  fi

  if [[ ! -s "$OUT" ]]; then
    echo "ERROR: pg_dump via app container produced empty file: $OUT" >&2
    log_pg_dump_failure "$log"
    exit 1
  fi
}

docker_available() {
  command -v docker >/dev/null 2>&1 || [[ ${#DOCKER[@]} -gt 0 ]]
}

run_pg_dump() {
  local log="${BACKUP_SESSION_DIR}/pg_dump.log"

  if [[ -n "${PG_DUMP_CMD:-}" ]]; then
    rm -f "$OUT"
    # shellcheck disable=SC2086
    if ! eval "$PG_DUMP_CMD" >"$log" 2>&1; then
      log_pg_dump_failure "$log"
      exit 1
    fi
    if [[ ! -s "$OUT" ]]; then
      echo "ERROR: PG_DUMP_CMD produced empty file: $OUT" >&2
      log_pg_dump_failure "$log"
      exit 1
    fi
    return
  fi

  if docker_available; then
    local app_container
    if app_container="$(resolve_app_container 2>/dev/null)" && [[ -n "$app_container" ]]; then
      if "${DOCKER[@]}" inspect -f '{{.State.Running}}' "$app_container" 2>/dev/null | grep -q true; then
        if "${DOCKER[@]}" exec "$app_container" command -v pg_dump >/dev/null 2>&1 \
          && "${DOCKER[@]}" exec "$app_container" test -f /app/run_pg_dump_backup.py 2>/dev/null; then
          pg_dump_via_app_container "$app_container"
          return
        fi
        echo "WARN: ${app_container} has no pg_dump or run_pg_dump_backup.py — rebuild: docker compose build --no-cache" >&2
      fi
    fi

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
    echo "pg_dump on host (PATH)..." >&2
    rm -f "$OUT"
    if ! pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "$OUT" >"$log" 2>&1; then
      log_pg_dump_failure "$log"
      exit 1
    fi
    if [[ ! -s "$OUT" ]]; then
      echo "ERROR: host pg_dump produced empty file: $OUT" >&2
      log_pg_dump_failure "$log"
      exit 1
    fi
    return
  fi

  if docker_available; then
    pg_dump_via_docker_run_client
    return
  fi

  echo "ERROR: pg_dump not found and no PostgreSQL Docker container detected." >&2
  write_scheduler_log "pg_dump not found — install postgresql-client or rebuild contract-backend image"
  exit 1
}

# ---------------------------------------------------------------------------
# 파일 백업 (호스트 경로 + docker cp)
# ---------------------------------------------------------------------------
sanitize_backup_label() {
  local s="$1"
  s="${s// /_}"
  s="${s//\//_}"
  s="${s//\\/_}"
  s="${s#_}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "${s:-data}"
}

resolve_host_path() {
  local p="$1"
  if [[ "$p" = /* ]]; then
    printf '%s' "$p"
    return 0
  fi
  if [[ -d "${PROJECT_ROOT}/${p}" ]]; then
    printf '%s' "${PROJECT_ROOT}/${p}"
    return 0
  fi
  if [[ -d "${BACKEND_DIR}/${p}" ]]; then
    printf '%s' "${BACKEND_DIR}/${p}"
    return 0
  fi
  if [[ -d "${p}" ]]; then
    printf '%s' "$(cd "$p" && pwd)"
    return 0
  fi
  return 1
}

dir_has_entries() {
  local d="$1"
  [[ -d "$d" ]] || return 1
  local n
  n="$(find "$d" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')"
  [[ "${n:-0}" -gt 0 ]]
}

count_files_under() {
  local d="$1"
  find "$d" -type f 2>/dev/null | wc -l | tr -d ' '
}

backup_host_directory() {
  local src="$1"
  local label="$2"
  local dest="${FILES_DIR}/$(sanitize_backup_label "$label")"

  [[ -d "$src" ]] || return 1
  dir_has_entries "$src" || return 1

  mkdir -p "$dest"
  # 원본 확장자·하위 구조 유지
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${src}/" "${dest}/"
  else
    cp -a "${src}/." "${dest}/"
  fi

  local n
  n="$(count_files_under "$dest")"
  echo "Files OK (host): ${src} → ${dest} (${n} files)" >&2
  return 0
}

container_path_is_dir() {
  local container="$1"
  local cpath="$2"
  "${DOCKER[@]}" exec "$container" test -d "$cpath" 2>/dev/null
}

container_path_has_entries() {
  local container="$1"
  local cpath="$2"
  container_path_is_dir "$container" "$cpath" || return 1
  local n
  n="$("${DOCKER[@]}" exec "$container" sh -c "find '$cpath' -mindepth 1 -maxdepth 1 2>/dev/null | wc -l" 2>/dev/null | tr -d ' ')"
  [[ "${n:-0}" -gt 0 ]]
}

backup_from_container() {
  local container="$1"
  local cpath="$2"
  local label="$3"
  local dest="${FILES_DIR}/$(sanitize_backup_label "$label")"

  container_path_has_entries "$container" "$cpath" || return 1

  mkdir -p "$dest"
  "${DOCKER[@]}" cp "${container}:${cpath}/." "${dest}/"

  local n
  n="$(count_files_under "$dest")"
  echo "Files OK (docker cp): ${container}:${cpath} → ${dest} (${n} files)" >&2
  return 0
}

is_upload_mount_destination() {
  case "$1" in
    /var/lib/postgresql/data|/var/lib/postgresql/data/*) return 1 ;;
    /app/uploads|/app/uploads/*|/app/data/uploads|/app/data/uploads/*) return 0 ;;
    /app/data/files|/app/data/files/*|/data/uploads|/data/uploads/*) return 0 ;;
    /uploads|/uploads/*|/files|/files/*) return 0 ;;
  esac
  case "$1" in
    *upload*|*Upload*|*file*|*File*|*data*) return 0 ;;
  esac
  return 1
}

backup_container_bind_mounts() {
  local container="$1"
  local line mtype src dest label

  while IFS='|' read -r mtype src dest; do
    [[ "$mtype" == "bind" && -n "$src" && -n "$dest" ]] || continue
    is_upload_mount_destination "$dest" || continue
    [[ -d "$src" ]] || continue
    label="${container}_mount_$(basename "$dest")"
    backup_host_directory "$src" "$label" || true
  done < <("${DOCKER[@]}" inspect -f '{{range .Mounts}}{{if eq .Type "bind"}}{{.Type}}|{{.Source}}|{{.Destination}}{{"\n"}}{{end}}{{end}}' "$container" 2>/dev/null || true)
}

default_upload_container_paths() {
  printf '%s\n' \
    /app/uploads \
    /app/data/uploads \
    /app/data/files \
    /data/uploads \
    /uploads \
    /files
}

default_host_backup_paths() {
  printf '%s\n' \
    backend/postgres_data \
    postgres_data \
    backend/uploads \
    backend/data \
    backend/data/contract_excel_backup \
    backend/app/uploads \
    uploads
}

run_file_backup() {
  if [[ "${BACKUP_SKIP_FILE_COPY:-}" == "1" || "${BACKUP_SKIP_FILE_COPY:-}" == "true" ]]; then
    echo "File backup skipped (BACKUP_SKIP_FILE_COPY)." >&2
    return 0
  fi

  echo "Backing up uploaded files → ${FILES_DIR}" >&2
  local copied=0
  local rel resolved container cpath app_container pg_container

  # 1) 호스트 경로 (NAS: backend/postgres_data 등)
  if [[ -n "${BACKUP_HOST_PATHS:-}" ]]; then
    while IFS= read -r rel || [[ -n "${rel:-}" ]]; do
      rel="${rel//$'\r'/}"
      rel="${rel#"${rel%%[![:space:]]*}"}"
      rel="${rel%"${rel##*[![:space:]]}"}"
      [[ -z "$rel" ]] && continue
      if resolved="$(resolve_host_path "$rel" 2>/dev/null)"; then
        if backup_host_directory "$resolved" "host_$(basename "$resolved")"; then
          copied=$((copied + 1))
        fi
      fi
    done < <(tr ',' '\n' <<<"${BACKUP_HOST_PATHS}")
  else
    while IFS= read -r rel; do
      if resolved="$(resolve_host_path "$rel" 2>/dev/null)"; then
        if backup_host_directory "$resolved" "host_$(basename "$resolved")"; then
          copied=$((copied + 1))
        fi
      fi
    done < <(default_host_backup_paths)
  fi

  if ! docker_available; then
    if [[ "$copied" -eq 0 ]]; then
      echo "WARN: No file directories copied (Docker unavailable for container paths)." >&2
    fi
    return 0
  fi

  # 2) API 컨테이너 bind mount → 호스트에서 복사 (docker cp 보다 빠름)
  if app_container="$(resolve_app_container 2>/dev/null)" && [[ -n "$app_container" ]]; then
    backup_container_bind_mounts "$app_container"
    if [[ -n "${BACKUP_UPLOAD_CONTAINER_PATHS:-}" ]]; then
      while IFS= read -r cpath || [[ -n "${cpath:-}" ]]; do
        cpath="${cpath//$'\r'/}"
        cpath="${cpath#"${cpath%%[![:space:]]*}"}"
        cpath="${cpath%"${cpath##*[![:space:]]}"}"
        [[ -z "$cpath" ]] && continue
        if backup_from_container "$app_container" "$cpath" "${app_container}_${cpath//\//_}"; then
          copied=$((copied + 1))
        fi
      done < <(tr ',' '\n' <<<"${BACKUP_UPLOAD_CONTAINER_PATHS}")
    else
      while IFS= read -r cpath; do
        if backup_from_container "$app_container" "$cpath" "${app_container}_${cpath//\//_}"; then
          copied=$((copied + 1))
        fi
      done < <(default_upload_container_paths)
    fi
  fi

  # 3) PostgreSQL 컨테이너에 업로드 경로가 마운트된 경우
  if pg_container="$(resolve_postgres_container 2>/dev/null)" && [[ -n "$pg_container" ]]; then
    backup_container_bind_mounts "$pg_container"
    while IFS= read -r cpath; do
      if backup_from_container "$pg_container" "$cpath" "${pg_container}_${cpath//\//_}"; then
        copied=$((copied + 1))
      fi
    done < <(default_upload_container_paths)
  fi

  if [[ "$copied" -eq 0 ]]; then
    echo "WARN: No upload/data directories were copied." >&2
    echo "  Set BACKUP_HOST_PATHS or BACKUP_UPLOAD_CONTAINER_PATHS in .env if paths differ." >&2
  fi
}

# ---------------------------------------------------------------------------
# 메뉴별 Excel 내보내기 (DB → .xlsx, 화면 다운로드와 동일 형식)
# ---------------------------------------------------------------------------
run_excel_export() {
  if [[ "${BACKUP_SKIP_EXCEL_EXPORT:-}" == "1" || "${BACKUP_SKIP_EXCEL_EXPORT:-}" == "true" ]]; then
    echo "Excel export skipped (BACKUP_SKIP_EXCEL_EXPORT)." >&2
    return 0
  fi

  EXCEL_DIR="${BACKUP_SESSION_DIR}/excel"
  mkdir -p "$EXCEL_DIR"

  export_excel_via_docker() {
    local container="$1"
    local tmp_in_container="/tmp/cms_excel_export_$$"
    local docker_log="${BACKUP_SESSION_DIR}/excel-export-docker.log"

    if ! "${DOCKER[@]}" exec "$container" test -f /app/export_menu_excel_backups.py 2>/dev/null; then
      echo "WARN: ${container} image has no /app/export_menu_excel_backups.py — run: docker compose build --no-cache" >&2
      return 1
    fi

    "${DOCKER[@]}" exec "$container" rm -rf "$tmp_in_container" 2>/dev/null || true
    "${DOCKER[@]}" exec "$container" mkdir -p "$tmp_in_container"
    if "${DOCKER[@]}" exec \
      -e "MENU_EXCEL_EXPORT_DIR=${tmp_in_container}" \
      -e "DATABASE_URL=${DATABASE_URL}" \
      "$container" \
      python /app/export_menu_excel_backups.py >"$docker_log" 2>&1; then
      "${DOCKER[@]}" cp "${container}:${tmp_in_container}/." "${EXCEL_DIR}/"
      "${DOCKER[@]}" exec "$container" rm -rf "$tmp_in_container" 2>/dev/null || true
      return 0
    fi
    echo "WARN: Excel export in container '${container}' failed. Log:" >&2
    sed 's/^/  /' "$docker_log" >&2 || cat "$docker_log" >&2
    "${DOCKER[@]}" exec "$container" rm -rf "$tmp_in_container" 2>/dev/null || true
    return 1
  }

  export_excel_via_host_python() {
    local py=""
    if [[ -x "${BACKEND_DIR}/.venv/bin/python" ]]; then
      py="${BACKEND_DIR}/.venv/bin/python"
    elif command -v python3 >/dev/null 2>&1; then
      py="python3"
    else
      return 1
    fi
    if [[ ! -f "${BACKEND_DIR}/export_menu_excel_backups.py" ]]; then
      return 1
    fi
    (
      cd "${BACKEND_DIR}"
      export MENU_EXCEL_EXPORT_DIR="${EXCEL_DIR}"
      export DATABASE_URL="${DATABASE_URL}"
      "$py" export_menu_excel_backups.py
    )
  }

  echo "Exporting menu Excel files → ${EXCEL_DIR}" >&2

  local app_container
  if docker_available && app_container="$(resolve_app_container 2>/dev/null)" && [[ -n "$app_container" ]]; then
    if export_excel_via_docker "$app_container"; then
      local n
      n="$(find "$EXCEL_DIR" -type f -name '*.xlsx' 2>/dev/null | wc -l | tr -d ' ')"
      echo "Excel OK (docker): ${EXCEL_DIR} (${n} files)" >&2
      return 0
    fi
    echo "WARN: Excel export via container '${app_container}' failed; trying host python..." >&2
  fi

  if export_excel_via_host_python; then
    local n
    n="$(find "$EXCEL_DIR" -type f -name '*.xlsx' 2>/dev/null | wc -l | tr -d ' ')"
    echo "Excel OK (host python): ${EXCEL_DIR} (${n} files)" >&2
    return 0
  fi

  echo "WARN: Menu Excel export failed. See excel-export-docker.log in the session folder or rebuild API image." >&2
  echo "  cd ${BACKEND_DIR} && sudo docker compose build --no-cache && sudo docker compose up -d --force-recreate" >&2
}

# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------
echo "Project root:    ${PROJECT_ROOT}" >&2
echo "Backend dir:     ${BACKEND_DIR}" >&2
echo "Backup session:  ${BACKUP_SESSION_DIR}" >&2
if [[ -n "${POSTGRES_DOCKER_CONTAINER:-}" ]]; then
  echo "DB container:    ${POSTGRES_DOCKER_CONTAINER} (from .env)" >&2
elif docker_available && pg_c="$(resolve_postgres_container 2>/dev/null || true)" && [[ -n "$pg_c" ]]; then
  echo "DB container:    ${pg_c} (auto-detected)" >&2
fi

run_pg_dump

if [[ ! -s "$OUT" ]]; then
  echo "ERROR: Backup file is missing or empty: $OUT" >&2
  exit 1
fi

DUMP_BYTES="$(wc -c <"$OUT" | tr -d ' ')"
echo "Dump OK: ${OUT} (${DUMP_BYTES} bytes)" >&2

run_excel_export
run_file_backup

echo "Backup session complete: ${BACKUP_SESSION_DIR}"
