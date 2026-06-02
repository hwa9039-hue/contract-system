"""PostgreSQL pg_dump 백업 — 경로 정규화 및 subprocess 오류 로깅."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_BACKUP_DIR = "/app/backups"


def normalize_path(raw: str | None, *, default: str = DEFAULT_BACKUP_DIR) -> Path:
    """경로 앞뒤 공백·CR 제거 후 절대 경로로 반환."""
    value = (raw or default).replace("\r", "").strip()
    if not value:
        value = default
    return Path(value).expanduser().resolve()


def resolve_backup_session_dir(backup_dir: Path, stamp: str | None = None) -> tuple[str, Path]:
    session_stamp = (stamp or os.getenv("BACKUP_STAMP") or datetime.now().strftime("%Y%m%d_%H%M%S")).strip()
    session_dir = backup_dir / session_stamp
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_stamp, session_dir


def run_pg_dump(output_path: Path, database_url: str | None = None) -> Path:
    """pg_dump 실행. 실패 시 stderr/stdout 을 포함한 RuntimeError."""
    db_url = (database_url or os.getenv("DATABASE_URL") or "").replace("\r", "").strip()
    if not db_url:
        raise ValueError("DATABASE_URL is not set")

    output_path = normalize_path(str(output_path))
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "pg_dump",
        db_url,
        "-Fc",
        "--no-owner",
        "--no-acl",
        "-f",
        str(output_path),
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "pg_dump not found in PATH. Install postgresql-client in the container image."
        ) from exc

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        parts = [f"pg_dump failed (exit code {result.returncode})"]
        if stderr:
            parts.append(f"stderr:\n{stderr}")
        if stdout:
            parts.append(f"stdout:\n{stdout}")
        raise RuntimeError("\n".join(parts))

    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError(f"pg_dump produced empty or missing file: {output_path}")

    return output_path


def write_error_log(log_path: Path, message: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"[{stamp}] {message}\n")


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Run pg_dump into BACKUP_DIR session folder.")
    parser.add_argument(
        "--output",
        help="Absolute dump file path (default: BACKUP_DIR/<stamp>/pg_backup_<stamp>.dump)",
    )
    parser.add_argument(
        "--log",
        help="Append errors to this log file (default: <backup_dir>/scheduler-last.log)",
    )
    parser.add_argument("--stamp", help="Session folder name (default: now YYYYMMDD_HHMMSS)")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    backup_dir = normalize_path(os.getenv("BACKUP_DIR"))
    session_stamp, session_dir = resolve_backup_session_dir(backup_dir, args.stamp)
    output = Path(args.output) if args.output else session_dir / f"pg_backup_{session_stamp}.dump"
    output = normalize_path(str(output))

    scheduler_log = normalize_path(args.log) if args.log else backup_dir / "scheduler-last.log"

    try:
        result_path = run_pg_dump(output)
    except Exception as exc:
        err = str(exc)
        logger.error(err)
        write_error_log(session_dir / "pg_dump.log", err)
        write_error_log(scheduler_log, err)
        print(err, file=sys.stderr)
        return 1

    size = result_path.stat().st_size
    msg = f"Dump OK: {result_path} ({size} bytes)"
    logger.info(msg)
    print(msg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
