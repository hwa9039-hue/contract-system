import logging
import os
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv
from psycopg import sql
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/contract_management")


def _pg_rel_column_exists(cursor, table: str, attname: str) -> bool:
    cursor.execute(
        """
        select 1
        from pg_catalog.pg_attribute a
        inner join pg_catalog.pg_class c on c.oid = a.attrelid
        inner join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = %s
          and a.attname = %s
          and a.attnum > 0
          and not a.attisdropped
        """,
        (table, attname),
    )
    return cursor.fetchone() is not None


def _pg_column_udt_name(cursor, table: str, attname: str) -> str | None:
    cursor.execute(
        """
        select t.typname
        from pg_catalog.pg_attribute a
        inner join pg_catalog.pg_class c on c.oid = a.attrelid
        inner join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        inner join pg_catalog.pg_type t on t.oid = a.atttypid
        where n.nspname = 'public'
          and c.relname = %s
          and a.attname = %s
          and a.attnum > 0
          and not a.attisdropped
        """,
        (table, attname),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return row.get("typname") if isinstance(row, dict) else row[0]


def _rename_column_if_legacy(cursor, table: str, old_attname: str, new_attname: str) -> None:
    """옛 API/CREATE 가 따옴표 없이 만든 소문자 컬럼 → 현재 라우터가 쓰는 camelCase 로 이름 맞춤."""
    if _pg_rel_column_exists(cursor, table, old_attname) and not _pg_rel_column_exists(cursor, table, new_attname):
        cursor.execute(
            sql.SQL("alter table {} rename column {} to {}").format(
                sql.Identifier(table),
                sql.Identifier(old_attname),
                sql.Identifier(new_attname),
            )
        )


def _migrate_project_discovery_row_columns(cursor) -> None:
    for old, new in (
        ("permitdate", "permitDate"),
        ("checkstatus", "checkStatus"),
        ("salestarget", "salesTarget"),
        ("projectcategory", "projectCategory"),
        ("localgov", "localGov"),
        ("projectname", "projectName"),
        ("projectamount", "projectAmount"),
        ("completionperiod", "completionPeriod"),
        ("createdat", "createdAt"),
        ("updatedat", "updatedAt"),
    ):
        _rename_column_if_legacy(cursor, "project_discovery_rows", old, new)
    _rename_column_if_legacy(cursor, "project_discovery_rows", "project_amount", "projectAmount")
    if not _pg_rel_column_exists(cursor, "project_discovery_rows", "projectAmount"):
        cursor.execute(
            """
            alter table project_discovery_rows
            add column "projectAmount" numeric(18, 0) not null default 0
            """
        )


def _migrate_contracts_text_columns(cursor) -> None:
    """구형 NAS DB: varchar(50) 등 → text (엑셀 긴 사업명·발주처 업로드 오류 방지)."""
    text_columns = (
        "segment",
        "refNo",
        "contractNo",
        "client",
        "department",
        "contractMethod",
        "contractType",
        "identNo",
        "projectName",
        "salesOwner",
        "pm",
        "note",
    )
    for col in text_columns:
        quoted = f'"{col}"'
        try:
            cursor.execute(
                f"""
                alter table contracts_rows
                  alter column {quoted} type text
                  using (
                    case
                      when {quoted} is null then null::text
                      else trim({quoted}::text)
                    end
                  )
                """
            )
        except Exception:
            logger.debug(
                "contracts_rows.%s type migration skipped or already text",
                col,
                exc_info=True,
            )


def _migrate_excluded_projects_row_columns(cursor) -> None:
    for old, new in (
        ("orderno", "orderNo"),
        ("writedate", "writeDate"),
        ("opendate", "openDate"),
        ("projectname", "projectName"),
        ("projectamount", "projectAmount"),
        ("exclusionreason", "exclusionReason"),
        ("createdat", "createdAt"),
        ("updatedat", "updatedAt"),
    ):
        _rename_column_if_legacy(cursor, "excluded_projects_rows", old, new)
    _rename_column_if_legacy(cursor, "excluded_projects_rows", "project_amount", "projectAmount")
    if not _pg_rel_column_exists(cursor, "excluded_projects_rows", "projectAmount"):
        cursor.execute(
            """
            alter table excluded_projects_rows
            add column "projectAmount" numeric(18, 0) not null default 0
            """
        )


@contextmanager
def get_connection():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        yield connection


# 일부 코드/배포본에서 `from app.database import get_db` 사용 → 동일 동작(psycopg 연결 컨텍스트)
get_db = get_connection


def repair_contract_row_ids(connection) -> int:
    """contracts_rows 에서 id 가 NULL 인 행에 PK 를 채웁니다. 반환: 갱신된 행 수.

    - uuid 컬럼: gen_random_uuid()
    - integer 컬럼: max(id)+1 부여 (옛 스키마·엑셀 import 후 id NULL 대응)
    """
    with connection.cursor() as cursor:
        id_type = _pg_column_udt_name(cursor, "contracts_rows", "id")
        if id_type is None:
            return 0
        if id_type == "uuid":
            cursor.execute(
                """
                update contracts_rows
                set id = gen_random_uuid()
                where id is null
                """
            )
            return int(cursor.rowcount or 0)
        if id_type in ("int2", "int4", "int8"):
            cursor.execute(
                """
                with max_id as (
                  select coalesce(max(id), 0) as m from contracts_rows where id is not null
                ),
                null_rows as (
                  select ctid
                  from contracts_rows
                  where id is null
                  order by ctid
                ),
                numbered as (
                  select
                    null_rows.ctid,
                    (select m from max_id) + row_number() over (order by null_rows.ctid) as new_id
                  from null_rows
                )
                update contracts_rows as c
                set id = numbered.new_id
                from numbered
                where c.ctid = numbered.ctid
                """
            )
            filled = int(cursor.rowcount or 0)
            if filled:
                logger.info(
                    "contracts_rows.id type is %s; backfilled id on %s row(s) with null id",
                    id_type,
                    filled,
                )
            return filled
        logger.debug(
            "contracts_rows.id type is %s; skip null-id repair",
            id_type,
        )
        return 0


def init_db():
    """DDL 을 한 트랜잭션에 묶으면 중간 실패 시 앞선 CREATE 도 전부 롤백될 수 있어 autocommit 으로 각 문장을 확정합니다."""
    with get_connection() as connection:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("create extension if not exists pgcrypto")
            cursor.execute(
                """
                create table if not exists contracts_rows (
                  id uuid primary key default gen_random_uuid(),
                  year integer,
                  segment text not null default '',
                  "refNo" text not null default '',
                  "contractNo" text not null default '',
                  client text not null default '',
                  department text not null default '',
                  "contractMethod" text not null default '',
                  "contractType" text not null default '',
                  "identNo" text not null default '',
                  "contractDate" date,
                  "dueDate" date,
                  "projectName" text not null default '',
                  amount numeric(18, 0) not null default 0,
                  "salesOwner" text not null default '',
                  pm text not null default '',
                  note text not null default ''
                )
                """
            )
            cursor.execute(
                """
                create table if not exists sales_register_rows (
                  id uuid primary key default gen_random_uuid(),
                  "registerDate" date,
                  client text not null default '',
                  "projectName" text not null default '',
                  "projectAmount" numeric(18, 0) not null default 0,
                  "projectCategory" text not null default '',
                  "projectStage" text not null default '',
                  manager text not null default '',
                  "projectType" text not null default '',
                  department text not null default '',
                  detail text not null default '',
                  source text not null default '',
                  "salesNote" text not null default '',
                  "actionRequest" text not null default '',
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                create table if not exists budget_progress_rows (
                  id uuid primary key default gen_random_uuid(),
                  "registerDate" date,
                  "localGov" text not null default '',
                  "projectName" text not null default '',
                  "budgetAmount" numeric(18, 0) not null default 0,
                  manager text not null default '',
                  "projectStage" text not null default '',
                  department text not null default '',
                  detail text not null default '',
                  "salesMatch" text not null default '',
                  note text not null default '',
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                create table if not exists document_register_rows (
                  id uuid primary key default gen_random_uuid(),
                  "docDate" date,
                  "docNo" text not null default '',
                  "senderReceiver" text not null default '',
                  title text not null default '',
                  method text not null default '',
                  writer text not null default '',
                  note text not null default '',
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                create table if not exists project_discovery_rows (
                  id uuid primary key default gen_random_uuid(),
                  "permitDate" date,
                  "checkStatus" text not null default '',
                  "salesTarget" text not null default '',
                  "projectCategory" text not null default '',
                  "localGov" text not null default '',
                  client text not null default '',
                  "projectName" text not null default '',
                  "projectAmount" numeric(18, 0) not null default 0,
                  "completionPeriod" text not null default '',
                  manager text not null default '',
                  note text not null default '',
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            _migrate_project_discovery_row_columns(cursor)
            cursor.execute(
                """
                create table if not exists excluded_projects_rows (
                  id uuid primary key default gen_random_uuid(),
                  "orderNo" text not null default '',
                  "writeDate" date,
                  "openDate" date,
                  category text not null default '',
                  keyword text not null default '',
                  writer text not null default '',
                  "projectName" text not null default '',
                  client text not null default '',
                  "projectAmount" numeric(18, 0) not null default 0,
                  "exclusionReason" text not null default '',
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            _migrate_excluded_projects_row_columns(cursor)
            cursor.execute(
                """
                create table if not exists weekly_work_reports_rows (
                  id uuid primary key default gen_random_uuid(),
                  date date not null default current_date,
                  "user" text not null default '',
                  section text not null default '',
                  content text not null default '',
                  order_index integer not null default 1,
                  "reportYear" integer,
                  "reportMonth" integer,
                  "weekNumber" integer,
                  "weekStartDate" date,
                  "reportDate" date,
                  assignee text not null default '',
                  team text not null default '',
                  category text not null default '',
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            # 기존 DB( 옛 스키마 ) → weekly 라우터 SELECT 컬럼과 동일하게 맞춤
            for stmt in (
                "alter table weekly_work_reports_rows add column if not exists order_index integer",
                'alter table weekly_work_reports_rows add column if not exists "reportYear" integer',
                'alter table weekly_work_reports_rows add column if not exists "reportMonth" integer',
                'alter table weekly_work_reports_rows add column if not exists "weekNumber" integer',
                'alter table weekly_work_reports_rows add column if not exists "weekStartDate" date',
                'alter table weekly_work_reports_rows add column if not exists "reportDate" date',
                "alter table weekly_work_reports_rows add column if not exists assignee text not null default ''",
                "alter table weekly_work_reports_rows add column if not exists team text not null default ''",
                "alter table weekly_work_reports_rows add column if not exists category text not null default ''",
            ):
                cursor.execute(stmt)
            cursor.execute(
                """
                do $$
                begin
                  if exists (
                    select 1 from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'weekly_work_reports_rows'
                      and column_name = 'orderIndex'
                  ) then
                    execute '
                      update weekly_work_reports_rows
                      set order_index = coalesce(order_index, "orderIndex", 1)
                      where order_index is null
                    ';
                  end if;
                end $$;
                """
            )
            cursor.execute(
                """
                update weekly_work_reports_rows
                set order_index = 1
                where order_index is null
                """
            )
            cursor.execute(
                """
                alter table weekly_work_reports_rows
                  alter column order_index set default 1
                """
            )
            cursor.execute(
                """
                alter table contracts_rows
                  add column if not exists "identNo" text not null default ''
                """
            )
            _migrate_contracts_text_columns(cursor)
            cursor.execute(
                """
                create index if not exists contracts_rows_year_idx
                  on contracts_rows (year desc)
                """
            )
            cursor.execute(
                """
                create index if not exists contracts_rows_contract_date_idx
                  on contracts_rows ("contractDate" desc)
                """
            )
            cursor.execute(
                """
                create table if not exists install_cases_rows (
                  id uuid primary key default gen_random_uuid(),
                  "projectName" text not null default '',
                  "heroImage" text not null default '',
                  environment text not null default 'indoor',
                  "middleCategory" text not null default '',
                  audience text not null default 'public',
                  year text not null default '',
                  purpose text not null default '',
                  client text not null default '',
                  specs jsonb not null default '{}'::jsonb,
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                alter table install_cases_rows
                add column if not exists "middleCategory" text not null default ''
                """
            )
            cursor.execute(
                """
                create index if not exists install_cases_rows_created_at_idx
                  on install_cases_rows ("createdAt" desc)
                """
            )
            cursor.execute(
                """
                create table if not exists materials_board_posts (
                  id uuid primary key default gen_random_uuid(),
                  title text not null default '',
                  content text not null default '',
                  files jsonb not null default '[]'::jsonb,
                  "registeredAt" date not null default current_date,
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                create index if not exists materials_board_posts_registered_at_idx
                  on materials_board_posts ("registeredAt" desc)
                """
            )
            cursor.execute(
                """
                alter table materials_board_posts
                  add column if not exists "downloadCount" integer not null default 0
                """
            )
            cursor.execute(
                """
                create table if not exists calendar_manual_events (
                  id uuid primary key default gen_random_uuid(),
                  "dateStart" date,
                  "dateEnd" date,
                  title text not null default '',
                  owner text not null default '',
                  pm text not null default '',
                  note text not null default '',
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                create index if not exists calendar_manual_events_date_start_idx
                  on calendar_manual_events ("dateStart" desc)
                """
            )
        try:
            repair_contract_row_ids(connection)
        except Exception:
            logger.exception(
                "contracts_rows id repair skipped due to error; continuing startup"
            )
