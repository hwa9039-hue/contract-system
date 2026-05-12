-- `$8` 오류 = INSERT 8번째 컬럼 = "contractType"(계약분류)
-- 엑셀에 "W-W", "-" 같은 자리표시 문자가 오면 integer 컬럼은 반드시 실패합니다.
-- 아래는 계약 화면에서 글자로 쓰는 칸을 text 로 맞춥니다. (이미 type 이 text/varchar 면 그대로 두거나 오류는 무시)

ALTER TABLE contracts_rows
  ALTER COLUMN "contractType" TYPE text
  USING (
    CASE
      WHEN "contractType" IS NULL THEN NULL::text
      ELSE trim("contractType"::text)
    END
  );

ALTER TABLE contracts_rows
  ALTER COLUMN "contractMethod" TYPE text
  USING (
    CASE
      WHEN "contractMethod" IS NULL THEN NULL::text
      ELSE trim("contractMethod"::text)
    END
  );

ALTER TABLE contracts_rows
  ALTER COLUMN "department" TYPE text
  USING (
    CASE
      WHEN "department" IS NULL THEN NULL::text
      ELSE trim("department"::text)
    END
  );
