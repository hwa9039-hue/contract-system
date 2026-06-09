-- 건축정보 엑셀 업로드: note 등 varchar(50) 제한으로 잘리거나 오류 날 때 실행
-- psql "postgresql://USER:PASSWORD@HOST:5433/smartdi" -f alter_project_discovery_varchar_to_text.sql

ALTER TABLE project_discovery_rows
  ALTER COLUMN "checkStatus" TYPE text
  USING (CASE WHEN "checkStatus" IS NULL THEN NULL::text ELSE trim("checkStatus"::text) END);

ALTER TABLE project_discovery_rows
  ALTER COLUMN "salesTarget" TYPE text
  USING (CASE WHEN "salesTarget" IS NULL THEN NULL::text ELSE trim("salesTarget"::text) END);

ALTER TABLE project_discovery_rows
  ALTER COLUMN "projectCategory" TYPE text
  USING (CASE WHEN "projectCategory" IS NULL THEN NULL::text ELSE trim("projectCategory"::text) END);

ALTER TABLE project_discovery_rows
  ALTER COLUMN "localGov" TYPE text
  USING (CASE WHEN "localGov" IS NULL THEN NULL::text ELSE trim("localGov"::text) END);

ALTER TABLE project_discovery_rows
  ALTER COLUMN client TYPE text
  USING (CASE WHEN client IS NULL THEN NULL::text ELSE trim(client::text) END);

ALTER TABLE project_discovery_rows
  ALTER COLUMN "projectName" TYPE text
  USING (CASE WHEN "projectName" IS NULL THEN NULL::text ELSE trim("projectName"::text) END);

ALTER TABLE project_discovery_rows
  ALTER COLUMN "completionPeriod" TYPE text
  USING (CASE WHEN "completionPeriod" IS NULL THEN NULL::text ELSE trim("completionPeriod"::text) END);

ALTER TABLE project_discovery_rows
  ALTER COLUMN manager TYPE text
  USING (CASE WHEN manager IS NULL THEN NULL::text ELSE trim(manager::text) END);

ALTER TABLE project_discovery_rows
  ALTER COLUMN note TYPE text
  USING (CASE WHEN note IS NULL THEN NULL::text ELSE trim(note::text) END);
