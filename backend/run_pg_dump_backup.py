#!/usr/bin/env python3
"""CLI: python run_pg_dump_backup.py  (DATABASE_URL, BACKUP_DIR 필수)"""

from app.db_backup import main

if __name__ == "__main__":
    raise SystemExit(main())
