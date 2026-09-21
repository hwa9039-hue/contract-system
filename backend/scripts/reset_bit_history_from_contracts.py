"""BIT 이력관리를 계약현황(계약분류=BIT) 기준으로 다시 만든다.

엑셀 수기 입력분까지 모두 지우고 계약현황 BIT 계약만 한 줄씩 새로 넣는 초기화 스크립트다.
진행/사후관리 항목(수량·보드적용·프로그램·제작·출하검사·모듈·배열·종류·기타·사업완료·불량발생·비고)은
계약현황에 없는 값이라 빈칸으로 두고 화면에서 직접 입력한다.

  python scripts/reset_bit_history_from_contracts.py              # 미리보기
  python scripts/reset_bit_history_from_contracts.py --commit     # 실제 삭제 + 재등록

--commit 은 삭제 전에 기존 행 전체를 data/backup/ 에 JSON 으로 백업한다.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import get_connection  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKUP_DIR = REPO_ROOT / "data" / "backup"

# 계약현황 계약분류가 BIT 인 값 — UNSPSC 코드와 'BIT' 라벨이 섞여 쓰인다.
BIT_TYPE_CODES = ("43211514", "43211507", "43211902")
DISPLAY_HINTS = ("55121903", "전광판", "디스플레이")

SELECT_CONTRACTS_SQL = """
select
  id::text as contract_id,
  coalesce("client", '') as client,
  coalesce(department, '') as department,
  coalesce("contractMethod", '') as contract_method,
  coalesce("contractType", '') as contract_type,
  coalesce("identNo", '') as ident_no,
  coalesce("contractDate", '') as contract_date,
  coalesce("dueDate", '') as due_date,
  coalesce("projectName", '') as project_name,
  coalesce(amount, 0) as amount
from contracts_rows
order by "contractDate", id
"""

INSERT_SQL = """
insert into bit_history_rows (
  id, sort_order, contract_id, seq_no,
  client, department, contract_method, contract_class, ident_no, contract_date, due_date,
  project_name, contract_amount, quantity,
  board_applied, program_item, manufacturing, shipping_inspection, note1,
  module_item, module_array, module_kind, etc_item, project_complete, defect, note2,
  created_at, updated_at
)
values (
  %(id)s, %(sort_order)s, %(contract_id)s, %(seq_no)s,
  %(client)s, %(department)s, %(contract_method)s, %(contract_class)s, %(ident_no)s,
  %(contract_date)s, %(due_date)s,
  %(project_name)s, %(contract_amount)s, '',
  '', '', '', '', '',
  '', '', '', '', '', '', '',
  now(), now()
)
"""


def is_bit_contract_type(value: str) -> bool:
    compact = re.sub(r"[\s,]+", "", value or "")
    if not compact:
        return False
    if any(hint in compact for hint in DISPLAY_HINTS):
        return False
    if "BIT" in compact.upper():
        return True
    return any(code in compact for code in BIT_TYPE_CODES)


def to_date_text(value) -> str:
    text = str(value or "").strip()
    match = re.match(r"(\d{4})[-./](\d{1,2})[-./](\d{1,2})", text)
    if not match:
        return ""
    year, month, day = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def to_amount_text(value) -> str:
    digits = re.sub(r"[^\d]", "", str(value or ""))
    return f"{int(digits):,}" if digits else ""


def build_rows(contracts: list[dict]) -> list[dict]:
    targets = [row for row in contracts if is_bit_contract_type(row["contract_type"])]
    targets.sort(key=lambda row: (to_date_text(row["contract_date"]) or "9999-99-99", row["contract_id"]))

    rows = []
    for index, source in enumerate(targets, start=1):
        rows.append(
            {
                "id": str(uuid4()),
                "sort_order": index,
                "contract_id": source["contract_id"],
                "seq_no": str(index),
                "client": source["client"].strip(),
                "department": source["department"].strip(),
                "contract_method": source["contract_method"].strip(),
                "contract_class": source["contract_type"].strip(),
                "ident_no": source["ident_no"].strip(),
                "contract_date": to_date_text(source["contract_date"]),
                "due_date": to_date_text(source["due_date"]),
                "project_name": source["project_name"].strip(),
                "contract_amount": to_amount_text(source["amount"]),
            }
        )
    return rows


def backup_existing(existing: list[dict]) -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%d_%H%M%S")
    path = BACKUP_DIR / f"bit_history_backup_{stamp}.json"
    path.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="BIT 이력관리를 계약현황 BIT 계약으로 초기화")
    parser.add_argument("--commit", action="store_true", help="실제로 삭제하고 재등록한다")
    args = parser.parse_args()

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("select * from bit_history_rows order by created_at")
            existing = [dict(row) for row in cursor.fetchall()]
            cursor.execute(SELECT_CONTRACTS_SQL)
            contracts = [dict(row) for row in cursor.fetchall()]

    rows = build_rows(contracts)
    print(f"현재 BIT 이력: {len(existing)}건 → 삭제 대상")
    print(f"계약현황 전체 {len(contracts)}건 중 BIT: {len(rows)}건 → 새로 등록")
    print("\n[등록 예시]")
    for sample in rows[:3] + rows[-3:]:
        print(
            "  ",
            sample["seq_no"],
            "|",
            sample["contract_date"],
            "|",
            sample["client"],
            "|",
            sample["project_name"][:30],
            "|",
            sample["contract_amount"],
        )

    if not args.commit:
        print("\n미리보기만 했습니다. 실제 반영은 --commit 을 붙여 다시 실행하세요.")
        return

    if not rows:
        print("\n등록할 BIT 계약이 없어 중단합니다.")
        return

    backup_path = backup_existing(existing)
    print(f"\n백업 저장: {backup_path}")

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from bit_history_rows")
            deleted = cursor.rowcount
            cursor.executemany(INSERT_SQL, rows)
        connection.commit()

    print(f"삭제 {deleted}건 / 등록 {len(rows)}건 완료")


if __name__ == "__main__":
    main()
