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
  note text NOT NULL DEFAULT '',
  "commencementCert" date,
  "completionCert" date,
  "warrantyStart" date,
  "warrantyExpiry" date,
  "guaranteeRate" text NOT NULL DEFAULT '',
  "inspectionRequestDate" date,
  "taxInvoice" text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS contract_unit_price_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  "costService" text NOT NULL DEFAULT '',
  "itemName" text NOT NULL DEFAULT '',
  "designUnitPrice" numeric(18, 0) NOT NULL DEFAULT 0,
  pitch text NOT NULL DEFAULT '',
  "capW" text NOT NULL DEFAULT '',
  "capH" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_unit_price_items_contract_id_idx
  ON contract_unit_price_items (contract_id);

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
  "permitDate" text,
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
  "isHidden" boolean NOT NULL DEFAULT false,
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
  "shareStatus" text NOT NULL DEFAULT '',
  writer text NOT NULL DEFAULT '',
  "projectName" text NOT NULL DEFAULT '',
  client text NOT NULL DEFAULT '',
  "projectAmount" numeric(18, 0) NOT NULL DEFAULT 0,
  "exclusionReason" text NOT NULL DEFAULT '',
  "isHidden" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE excluded_projects_rows ADD COLUMN IF NOT EXISTS "isHidden" boolean NOT NULL DEFAULT false;
ALTER TABLE excluded_projects_rows ADD COLUMN IF NOT EXISTS "shareStatus" text NOT NULL DEFAULT '';

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

-- 구형 NAS: varchar(50) → text (회의록 참석자·담당자 다중 선택)
ALTER TABLE weekly_work_reports_rows
  ALTER COLUMN "user" TYPE text
  USING (CASE WHEN "user" IS NULL THEN NULL::text ELSE trim("user"::text) END);
ALTER TABLE weekly_work_reports_rows
  ALTER COLUMN section TYPE text
  USING (CASE WHEN section IS NULL THEN NULL::text ELSE trim(section::text) END);
ALTER TABLE weekly_work_reports_rows
  ALTER COLUMN content TYPE text
  USING (CASE WHEN content IS NULL THEN NULL::text ELSE trim(content::text) END);
ALTER TABLE weekly_work_reports_rows
  ALTER COLUMN assignee TYPE text
  USING (CASE WHEN assignee IS NULL THEN NULL::text ELSE trim(assignee::text) END);
ALTER TABLE weekly_work_reports_rows
  ALTER COLUMN team TYPE text
  USING (CASE WHEN team IS NULL THEN NULL::text ELSE trim(team::text) END);
ALTER TABLE weekly_work_reports_rows
  ALTER COLUMN category TYPE text
  USING (CASE WHEN category IS NULL THEN NULL::text ELSE trim(category::text) END);

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
  "middleCategory" text NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS materials_board_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  folder text NOT NULL DEFAULT '기타',
  "registeredAt" date NOT NULL DEFAULT CURRENT_DATE,
  "downloadCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS materials_board_posts_registered_at_idx
  ON materials_board_posts ("registeredAt" DESC);

CREATE TABLE IF NOT EXISTS calendar_manual_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dateStart" date,
  "dateEnd" date,
  title text NOT NULL DEFAULT '',
  owner text NOT NULL DEFAULT '',
  pm text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_manual_events_date_start_idx
  ON calendar_manual_events ("dateStart" DESC);
