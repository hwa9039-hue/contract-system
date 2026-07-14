-- 단가 품목(Child) 테이블 생성 — contracts_rows 에 단가 컬럼이 없는 DB 용
-- (기존 Parent 에서 단가를 읽어올 컬럼이 없으므로 INSERT … SELECT 이관 없음)
--
-- 사용: psql "$DATABASE_URL" -f backend/sql/migrate_contract_unit_price_items.sql
--
-- contracts_rows.id 가 uuid 가 아닌 경우(예: integer):
--   contract_id 를 해당 타입으로 바꾸거나, FK 줄을 제거하고 contract_id text 로만 두세요.

BEGIN;

CREATE TABLE IF NOT EXISTS contract_unit_price_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  "costService" text NOT NULL DEFAULT '',
  "itemName" text NOT NULL DEFAULT '',
  "designUnitPrice" numeric(18, 0) NOT NULL DEFAULT 0,
  pitch text NOT NULL DEFAULT '',
  "capW" text NOT NULL DEFAULT '',
  "capH" text NOT NULL DEFAULT '',
  enclosure text NOT NULL DEFAULT '',
  "structureSpec" text NOT NULL DEFAULT '',
  "signboardQty" text NOT NULL DEFAULT '',
  "replacementType" text NOT NULL DEFAULT '',
  "quotePrice" numeric(18, 0) NOT NULL DEFAULT 0,
  "constructionNote" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_unit_price_items_contract_id_fkey
    FOREIGN KEY (contract_id)
    REFERENCES contracts_rows (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS contract_unit_price_items_contract_id_idx
  ON contract_unit_price_items (contract_id);

CREATE INDEX IF NOT EXISTS contract_unit_price_items_contract_sort_idx
  ON contract_unit_price_items (contract_id, sort_order);

ALTER TABLE contract_unit_price_items
  ADD COLUMN IF NOT EXISTS enclosure text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "quotePrice" numeric(18, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "replacementType" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "structureSpec" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "signboardQty" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "constructionNote" text NOT NULL DEFAULT '';

COMMIT;
