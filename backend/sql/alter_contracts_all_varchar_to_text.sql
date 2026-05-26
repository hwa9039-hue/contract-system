-- 계약현황 엑셀 업로드: `value too long for type character varying(50)` 발생 시 실행
-- psql "postgresql://USER:PASSWORD@HOST:5433/smartdi" -f alter_contracts_all_varchar_to_text.sql

ALTER TABLE contracts_rows
  ALTER COLUMN segment TYPE text
  USING (CASE WHEN segment IS NULL THEN NULL::text ELSE trim(segment::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN "refNo" TYPE text
  USING (CASE WHEN "refNo" IS NULL THEN NULL::text ELSE trim("refNo"::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN "contractNo" TYPE text
  USING (CASE WHEN "contractNo" IS NULL THEN NULL::text ELSE trim("contractNo"::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN client TYPE text
  USING (CASE WHEN client IS NULL THEN NULL::text ELSE trim(client::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN department TYPE text
  USING (CASE WHEN department IS NULL THEN NULL::text ELSE trim(department::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN "contractMethod" TYPE text
  USING (CASE WHEN "contractMethod" IS NULL THEN NULL::text ELSE trim("contractMethod"::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN "contractType" TYPE text
  USING (CASE WHEN "contractType" IS NULL THEN NULL::text ELSE trim("contractType"::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN "identNo" TYPE text
  USING (CASE WHEN "identNo" IS NULL THEN NULL::text ELSE trim("identNo"::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN "projectName" TYPE text
  USING (CASE WHEN "projectName" IS NULL THEN NULL::text ELSE trim("projectName"::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN "salesOwner" TYPE text
  USING (CASE WHEN "salesOwner" IS NULL THEN NULL::text ELSE trim("salesOwner"::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN pm TYPE text
  USING (CASE WHEN pm IS NULL THEN NULL::text ELSE trim(pm::text) END);

ALTER TABLE contracts_rows
  ALTER COLUMN note TYPE text
  USING (CASE WHEN note IS NULL THEN NULL::text ELSE trim(note::text) END);
