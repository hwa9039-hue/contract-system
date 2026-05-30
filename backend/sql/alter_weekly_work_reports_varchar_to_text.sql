-- 회의록 저장: `value too long for type character varying(50)` 발생 시 실행
-- 참석자·담당자 다중 선택(CSV) 및 긴 section/category 값 대응

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
