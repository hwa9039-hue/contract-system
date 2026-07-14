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
    _migrate_project_discovery_permit_date_to_text(cursor)


def _migrate_project_discovery_permit_date_to_text(cursor) -> None:
    """건축정보일자: date → text (날짜·'분기별자료(9월)' 등 혼용 저장)."""
    try:
        cursor.execute(
            """
            alter table project_discovery_rows
              alter column "permitDate" type text
              using (
                case
                  when "permitDate" is null then null::text
                  else to_char("permitDate", 'YYYY-MM-DD')
                end
              )
            """
        )
    except Exception:
        logger.debug(
            "project_discovery_rows.permitDate type migration skipped or already text",
            exc_info=True,
        )


def _migrate_project_management_commencement_cert_to_text(cursor) -> None:
    """사업관리 착수계: date → text (날짜·'생략' 혼용 저장)."""
    try:
        cursor.execute(
            """
            alter table project_management_items
              alter column "commencementCert" type text
              using (
                case
                  when "commencementCert" is null then null::text
                  else to_char("commencementCert", 'YYYY-MM-DD')
                end
              )
            """
        )
    except Exception:
        logger.debug(
            "project_management_items.commencementCert type migration skipped or already text",
            exc_info=True,
        )


def _migrate_project_discovery_text_columns(cursor) -> None:
    """구형 NAS DB: project_discovery_rows varchar(50) → text (긴 세부내용·사업명 보존)."""
    text_columns = (
        "checkStatus",
        "salesTarget",
        "projectCategory",
        "localGov",
        "client",
        "projectName",
        "completionPeriod",
        "manager",
        "note",
    )
    for col in text_columns:
        quoted = f'"{col}"'
        try:
            cursor.execute(
                f"""
                alter table project_discovery_rows
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
                "project_discovery_rows.%s type migration skipped or already text",
                col,
                exc_info=True,
            )


def _migrate_weekly_work_reports_text_columns(cursor) -> None:
    """구형 NAS DB: weekly_work_reports_rows varchar(50) → text (회의록 참석자·담당자 다중 선택 저장)."""
    text_columns = (
        "user",
        "section",
        "content",
        "assignee",
        "team",
        "category",
    )
    for col in text_columns:
        quoted = f'"{col}"' if col == "user" else col
        try:
            cursor.execute(
                f"""
                alter table weekly_work_reports_rows
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
                "weekly_work_reports_rows.%s type migration skipped or already text",
                col,
                exc_info=True,
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


def _migrate_sales_register_text_columns(cursor) -> None:
    """구형 NAS DB: 영업관리대장 varchar(50) → text (긴 세부내용 보존)."""
    text_columns = (
        "client",
        "projectName",
        "projectCategory",
        "projectStage",
        "manager",
        "projectType",
        "department",
        "detail",
        "source",
        "salesNote",
        "actionRequest",
        "summary",
    )
    for col in text_columns:
        quoted = f'"{col}"'
        try:
            cursor.execute(
                f"""
                alter table sales_register_rows
                  alter column {quoted} type text
                  using (
                    case
                      when {quoted} is null then null::text
                      else {quoted}::text
                    end
                  )
                """
            )
        except Exception:
            logger.debug(
                "sales_register_rows.%s type migration skipped or already text",
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


def _migrate_contract_unit_price_items(cursor) -> None:
    """contracts_rows 단가 컬럼 → contract_unit_price_items 1:N 이관 후 Parent 컬럼 제거."""
    cursor.execute(
        """
        create table if not exists contract_unit_price_items (
          id uuid primary key default gen_random_uuid(),
          contract_id text not null,
          sort_order integer not null default 0,
          "costService" text not null default '',
          "itemName" text not null default '',
          "designUnitPrice" numeric(18, 0) not null default 0,
          pitch text not null default '',
          "capW" text not null default '',
          "capH" text not null default '',
          enclosure text not null default '',
          "structureSpec" text not null default '',
          "signboardQty" text not null default '',
          "replacementType" text not null default '',
          "quotePrice" numeric(18, 0) not null default 0,
          "constructionNote" text not null default '',
          "createdAt" timestamptz not null default now(),
          "updatedAt" timestamptz not null default now()
        )
        """
    )
    cursor.execute(
        """
        create index if not exists contract_unit_price_items_contract_id_idx
          on contract_unit_price_items (contract_id)
        """
    )
    cursor.execute(
        """
        create index if not exists contract_unit_price_items_contract_sort_idx
          on contract_unit_price_items (contract_id, sort_order)
        """
    )
    cursor.execute(
        """
        alter table contract_unit_price_items
          alter column contract_id type text using contract_id::text
        """
    )
    cursor.execute(
        """
        alter table contract_unit_price_items
          add column if not exists enclosure text not null default '',
          add column if not exists "quotePrice" numeric(18, 0) not null default 0,
          add column if not exists "replacementType" text not null default '',
          add column if not exists "structureSpec" text not null default '',
          add column if not exists "signboardQty" text not null default '',
          add column if not exists "constructionNote" text not null default ''
        """
    )
    cursor.execute(
        """
        do $$
        begin
          if not exists (
            select 1 from pg_constraint
            where conname = 'contract_unit_price_items_contract_id_fkey'
          ) and exists (
            select 1 from pg_constraint
            where conrelid = 'contracts_rows'::regclass
              and contype = 'p'
          ) then
            alter table contract_unit_price_items
              add constraint contract_unit_price_items_contract_id_fkey
              foreign key (contract_id) references contracts_rows (id) on delete cascade;
          end if;
        exception
          when others then null;
        end $$;
        """
    )

    legacy_parent_cols = (
        "costService",
        "cost_service",
        "itemName",
        "item_name",
        "designUnitPrice",
        "unit_price",
    )
    if not any(_pg_rel_column_exists(cursor, "contracts_rows", col) for col in legacy_parent_cols):
        return

    cost_service_expr = (
        "coalesce(nullif(c.\"costService\", ''), c.cost_service, '')"
        if _pg_rel_column_exists(cursor, "contracts_rows", "costService")
        else "coalesce(c.cost_service, '')"
    )
    item_name_expr = (
        "coalesce(nullif(c.\"itemName\", ''), c.item_name, '')"
        if _pg_rel_column_exists(cursor, "contracts_rows", "itemName")
        else "coalesce(c.item_name, '')"
    )
    unit_price_expr = (
        "coalesce(nullif(c.\"designUnitPrice\", 0::numeric), c.unit_price, 0::numeric)"
        if _pg_rel_column_exists(cursor, "contracts_rows", "designUnitPrice")
        else "coalesce(c.unit_price, 0::numeric)"
    )
    pitch_expr = "coalesce(c.pitch, '')" if _pg_rel_column_exists(cursor, "contracts_rows", "pitch") else "''"
    cap_w_expr = (
        "coalesce(nullif(c.\"capW\", ''), c.width_w, '')"
        if _pg_rel_column_exists(cursor, "contracts_rows", "capW")
        else "coalesce(c.width_w, '')"
    )
    cap_h_expr = (
        "coalesce(nullif(c.\"capH\", ''), c.height_h, '')"
        if _pg_rel_column_exists(cursor, "contracts_rows", "capH")
        else "coalesce(c.height_h, '')"
    )

    cursor.execute(
        f"""
        insert into contract_unit_price_items (
          contract_id,
          sort_order,
          "costService",
          "itemName",
          "designUnitPrice",
          pitch,
          "capW",
          "capH"
        )
        select
          c.id::text,
          0,
          {cost_service_expr},
          {item_name_expr},
          {unit_price_expr},
          {pitch_expr},
          {cap_w_expr},
          {cap_h_expr}
        from contracts_rows c
        where not exists (
          select 1
          from contract_unit_price_items i
          where i.contract_id::text = c.id::text
        )
        and (
          {cost_service_expr} <> ''
          or {item_name_expr} <> ''
          or {unit_price_expr} <> 0
          or {pitch_expr} <> ''
          or {cap_w_expr} <> ''
          or {cap_h_expr} <> ''
        )
        """
    )

    for col in (
        "costService",
        "itemName",
        "designUnitPrice",
        "pitch",
        "capW",
        "capH",
        "cost_service",
        "item_name",
        "unit_price",
        "width_w",
        "height_h",
    ):
        if _pg_rel_column_exists(cursor, "contracts_rows", col):
            cursor.execute(
                sql.SQL("alter table contracts_rows drop column if exists {}").format(
                    sql.Identifier(col)
                )
            )


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
                  summary text,
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                alter table sales_register_rows
                  add column if not exists summary text
                """
            )
            _migrate_sales_register_text_columns(cursor)
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
                create table if not exists contacts_rows (
                  id uuid primary key default gen_random_uuid(),
                  category text not null default '',
                  business_content text not null default '',
                  manager_name text not null default '',
                  position text not null default '',
                  phone text not null default '',
                  email text not null default '',
                  notes text not null default '',
                  created_at timestamptz not null default now(),
                  updated_at timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                create table if not exists project_discovery_rows (
                  id uuid primary key default gen_random_uuid(),
                  "permitDate" text,
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
                  "reportMarkedAt" text,
                  "isHidden" boolean not null default false,
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                alter table project_discovery_rows
                add column if not exists "projectStage" text not null default ''
                """
            )
            cursor.execute(
                """
                alter table project_discovery_rows
                add column if not exists "isHidden" boolean not null default false
                """
            )
            _migrate_project_discovery_row_columns(cursor)
            _migrate_project_discovery_text_columns(cursor)
            cursor.execute(
                """
                alter table project_discovery_rows
                  add column if not exists summary text
                """
            )
            cursor.execute(
                """
                alter table project_discovery_rows
                  add column if not exists "reportMarkedAt" text
                """
            )
            cursor.execute(
                """
                create table if not exists excluded_projects_rows (
                  id uuid primary key default gen_random_uuid(),
                  "orderNo" text not null default '',
                  "writeDate" date,
                  "openDate" date,
                  category text not null default '',
                  keyword text not null default '',
                  "shareStatus" text not null default '',
                  writer text not null default '',
                  "projectName" text not null default '',
                  client text not null default '',
                  "projectAmount" numeric(18, 0) not null default 0,
                  "exclusionReason" text not null default '',
                  "isHidden" boolean not null default false,
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                """
                alter table excluded_projects_rows
                add column if not exists "isHidden" boolean not null default false
                """
            )
            cursor.execute(
                """
                alter table excluded_projects_rows
                add column if not exists "shareStatus" text not null default ''
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
            _migrate_weekly_work_reports_text_columns(cursor)
            cursor.execute(
                """
                alter table contracts_rows
                  add column if not exists "identNo" text not null default ''
                """
            )
            _migrate_contracts_text_columns(cursor)
            cursor.execute(
                """
                alter table contracts_rows
                  add column if not exists "commencementCert" date,
                  add column if not exists "completionCert" date,
                  add column if not exists "warrantyStart" date,
                  add column if not exists "warrantyExpiry" date,
                  add column if not exists "guaranteeRate" text not null default '',
                  add column if not exists "inspectionRequestDate" date,
                  add column if not exists "taxInvoice" text not null default '',
                  add column if not exists "performanceCertStatus" text not null default ''
                """
            )
            _migrate_contract_unit_price_items(cursor)
            cursor.execute(
                """
                create table if not exists project_management_items (
                  id uuid primary key default gen_random_uuid(),
                  contract_id text,
                  contract_signature text not null default '',
                  "commencementCert" date,
                  "completionCert" date,
                  "warrantyStart" date,
                  "warrantyExpiry" date,
                  "guaranteeRate" text not null default '',
                  "performanceCertStatus" text not null default '',
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
                )
                """
            )
            _migrate_project_management_commencement_cert_to_text(cursor)
            cursor.execute(
                """
                create index if not exists project_management_items_contract_id_idx
                  on project_management_items (contract_id)
                """
            )
            cursor.execute(
                """
                create index if not exists project_management_items_signature_idx
                  on project_management_items (contract_signature)
                """
            )
            cursor.execute(
                """
                alter table project_management_items
                  add column if not exists "performanceCertStatus" text not null default ''
                """
            )
            cursor.execute(
                """
                alter table contract_unit_price_items
                  add column if not exists contract_signature text not null default ''
                """
            )
            cursor.execute(
                """
                create index if not exists contract_unit_price_items_signature_idx
                  on contract_unit_price_items (contract_signature)
                """
            )
            cursor.execute(
                """
                alter table contract_unit_price_items
                  drop constraint if exists contract_unit_price_items_contract_id_fkey
                """
            )
            cursor.execute(
                """
                update contract_unit_price_items i
                set contract_signature = case
                  when coalesce(nullif(trim(c."contractNo"), ''), '') <> ''
                    then 'contract:' || lower(regexp_replace(trim(c."contractNo"), '\\s+', '', 'g'))
                  else 'project:' || lower(regexp_replace(trim(c."projectName"), '\\s+', '', 'g'))
                    || '|client:' || lower(regexp_replace(trim(c.client), '\\s+', '', 'g'))
                    || '|date:' || coalesce(c."contractDate"::text, '')
                end
                from contracts_rows c
                where i.contract_id::text = c.id::text
                  and coalesce(i.contract_signature, '') = ''
                """
            )
            cursor.execute(
                """
                insert into project_management_items (
                  contract_id,
                  contract_signature,
                  "commencementCert",
                  "completionCert",
                  "warrantyStart",
                  "warrantyExpiry",
                  "guaranteeRate"
                )
                select
                  c.id::text,
                  case
                    when coalesce(nullif(trim(c."contractNo"), ''), '') <> ''
                      then 'contract:' || lower(regexp_replace(trim(c."contractNo"), '\\s+', '', 'g'))
                    else 'project:' || lower(regexp_replace(trim(c."projectName"), '\\s+', '', 'g'))
                      || '|client:' || lower(regexp_replace(trim(c.client), '\\s+', '', 'g'))
                      || '|date:' || coalesce(c."contractDate"::text, '')
                  end,
                  c."commencementCert",
                  c."completionCert",
                  c."warrantyStart",
                  c."warrantyExpiry",
                  c."guaranteeRate"
                from contracts_rows c
                where (
                  c."commencementCert" is not null
                  or c."completionCert" is not null
                  or c."warrantyStart" is not null
                  or c."warrantyExpiry" is not null
                  or coalesce(c."guaranteeRate", '') <> ''
                )
                and not exists (
                  select 1
                  from project_management_items p
                  where p.contract_id = c.id::text
                     or (
                       p.contract_signature <> ''
                       and p.contract_signature = case
                         when coalesce(nullif(trim(c."contractNo"), ''), '') <> ''
                           then 'contract:' || lower(regexp_replace(trim(c."contractNo"), '\\s+', '', 'g'))
                         else 'project:' || lower(regexp_replace(trim(c."projectName"), '\\s+', '', 'g'))
                           || '|client:' || lower(regexp_replace(trim(c.client), '\\s+', '', 'g'))
                           || '|date:' || coalesce(c."contractDate"::text, '')
                       end
                     )
                )
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
                alter table materials_board_posts
                  add column if not exists folder text not null default '기타'
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
