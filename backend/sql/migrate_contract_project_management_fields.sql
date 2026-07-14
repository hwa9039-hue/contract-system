-- 사업관리(contracts_rows / project_management_items) 추가 컬럼
-- psql "$DATABASE_URL" -f backend/sql/migrate_contract_project_management_fields.sql

ALTER TABLE contracts_rows
  ADD COLUMN IF NOT EXISTS "commencementCert" date,
  ADD COLUMN IF NOT EXISTS "completionCert" date,
  ADD COLUMN IF NOT EXISTS "warrantyStart" date,
  ADD COLUMN IF NOT EXISTS "warrantyExpiry" date,
  ADD COLUMN IF NOT EXISTS "guaranteeRate" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "inspectionRequestDate" date,
  ADD COLUMN IF NOT EXISTS "taxInvoice" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "performanceCertStatus" text NOT NULL DEFAULT '';

ALTER TABLE project_management_items
  ADD COLUMN IF NOT EXISTS "performanceCertStatus" text NOT NULL DEFAULT '';
