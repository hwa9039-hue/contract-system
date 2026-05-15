-- 계약관리 API 전체 테이블 생성 (PostgreSQL)
-- 사용: psql "$DATABASE_URL" -f schema_all.sql
-- 또는 NAS에서 DB 클라이언트로 실행.
-- 레거시 컬럼 이름 정리(projectamount → "projectAmount" 등)는 앱 기동 시 init_db() 가 수행합니다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS contracts_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer,
  segment text NOT NULL DEFAULT '',
  "refNo" text NOT NULL DEFAULT '',
  "contractNo" text NOT NULL DEFAULT '',
  client text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  "contractMethod" text NOT NULL DEFAULT '',
  "contractType" text NOT NULL DEFAULT '',
  "identNo" text NOT NULL DEFAULT '',
  "contractDate" date,
  "dueDate" date,
  "projectName" text NOT NULL DEFAULT '',
  amount numeric(18, 0) NOT NULL DEFAULT 0,
  "salesOwner" text NOT NULL DEFAULT '',
  pm text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sales_register_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "registerDate" date,
  client text NOT NULL DEFAULT '',
  "projectName" text NOT NULL DEFAULT '',
  "projectAmount" numeric(18, 0) NOT NULL DEFAULT 0,
  "projectCategory" text NOT NULL DEFAULT '',
  "projectStage" text NOT NULL DEFAULT '',
  manager text NOT NULL DEFAULT '',
  "projectType" text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  "salesNote" text NOT NULL DEFAULT '',
  "actionRequest" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_progress_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "registerDate" date,
  "localGov" text NOT NULL DEFAULT '',
  "projectName" text NOT NULL DEFAULT '',
  "budgetAmount" numeric(18, 0) NOT NULL DEFAULT 0,
  manager text NOT NULL DEFAULT '',
  "projectStage" text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  "salesMatch" text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_register_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "docDate" date,
  "docNo" text NOT NULL DEFAULT '',
  "senderReceiver" text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  method text NOT NULL DEFAULT '',
  writer text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_discovery_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "permitDate" date,
  "checkStatus" text NOT NULL DEFAULT '',
  "salesTarget" text NOT NULL DEFAULT '',
  "projectCategory" text NOT NULL DEFAULT '',
  "localGov" text NOT NULL DEFAULT '',
  client text NOT NULL DEFAULT '',
  "projectName" text NOT NULL DEFAULT '',
  "projectAmount" numeric(18, 0) NOT NULL DEFAULT 0,
  "completionPeriod" text NOT NULL DEFAULT '',
  manager text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS excluded_projects_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderNo" text NOT NULL DEFAULT '',
  "writeDate" date,
  "openDate" date,
  category text NOT NULL DEFAULT '',
  keyword text NOT NULL DEFAULT '',
  writer text NOT NULL DEFAULT '',
  "projectName" text NOT NULL DEFAULT '',
  client text NOT NULL DEFAULT '',
  "projectAmount" numeric(18, 0) NOT NULL DEFAULT 0,
  "exclusionReason" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weekly_work_reports_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT current_date,
  "user" text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  order_index integer NOT NULL DEFAULT 1,
  "reportYear" integer,
  "reportMonth" integer,
  "weekNumber" integer,
  "weekStartDate" date,
  "reportDate" date,
  assignee text NOT NULL DEFAULT '',
  team text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS order_index integer;
ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS "reportYear" integer;
ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS "reportMonth" integer;
ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS "weekNumber" integer;
ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS "weekStartDate" date;
ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS "reportDate" date;
ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS assignee text NOT NULL DEFAULT '';
ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS team text NOT NULL DEFAULT '';
ALTER TABLE weekly_work_reports_rows ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'weekly_work_reports_rows'
      AND column_name = 'orderIndex'
  ) THEN
    EXECUTE '
      UPDATE weekly_work_reports_rows
      SET order_index = coalesce(order_index, "orderIndex", 1)
      WHERE order_index IS NULL
    ';
  END IF;
END $$;

UPDATE weekly_work_reports_rows SET order_index = 1 WHERE order_index IS NULL;

ALTER TABLE weekly_work_reports_rows
  ALTER COLUMN order_index SET DEFAULT 1;

ALTER TABLE contracts_rows
  ADD COLUMN IF NOT EXISTS "identNo" text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS contracts_rows_year_idx
  ON contracts_rows (year DESC);

CREATE INDEX IF NOT EXISTS contracts_rows_contract_date_idx
  ON contracts_rows ("contractDate" DESC);

CREATE TABLE IF NOT EXISTS install_cases_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectName" text NOT NULL DEFAULT '',
  "heroImage" text NOT NULL DEFAULT '',
  environment text NOT NULL DEFAULT 'indoor',
  audience text NOT NULL DEFAULT 'public',
  year text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  client text NOT NULL DEFAULT '',
  specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS install_cases_rows_created_at_idx
  ON install_cases_rows ("createdAt" DESC);
