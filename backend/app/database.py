import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/contract_management")


@contextmanager
def get_connection():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        yield connection


def init_db():
    with get_connection() as connection:
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
            cursor.execute(
                """
                create table if not exists weekly_work_reports_rows (
                  id uuid primary key default gen_random_uuid(),
                  date date not null default current_date,
                  "user" text not null default '',
                  section text not null default '',
                  content text not null default '',
                  "orderIndex" integer not null default 1,
                  "createdAt" timestamptz not null default now(),
                  "updatedAt" timestamptz not null default now()
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
        connection.commit()
