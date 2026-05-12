-- 구분(segment)이 비어 있으면 앱은 "" 를 보냅니다.
-- 컬럼이 integer 이면: invalid input syntax for type integer: ""
-- parameter $2 = segment (INSERT 시 year 다음)

ALTER TABLE contracts_rows
  ALTER COLUMN segment TYPE text
  USING (
    CASE
      WHEN segment IS NULL THEN NULL::text
      ELSE trim(segment::text)
    END
  );
