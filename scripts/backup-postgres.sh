#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to your PostgreSQL connection string}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/pg_backup_${STAMP}.dump"

pg_dump "$DATABASE_URL" -Fc -f "$OUT"
echo "Backup written to $OUT"
