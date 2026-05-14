import os
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv
from psycopg import sql
from psycopg.rows import dict_row


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
    """contracts_rows 에서 id 가 NULL 인 행에 UUID 를 채웁니다. 반환: 갱신된 행 수.

    API `id` 는 DB PK(UUID 문자열)이어야 PATCH/DELETE 가 동작합니다.
    계약번호(contractNo)는 별도 필드로만 내려가며 `id`로 치환하지 않습니다(중복 가능·경로 불일치).
    """
    with connection.cursor() as cursor:
        cursor.execute(
            """
            update contracts_rows
            set id = gen_random_uuid()
            where id is null
            """
        )
        return int(cursor.rowcount or 0)


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
        repair_contract_row_ids(connection)
