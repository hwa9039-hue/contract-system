-- [필수] `invalid input syntax for type bigint` + parameter $4(contractNo) 가 나오면
-- 아래를 한 번도 실행하지 않은 것입니다. (코드만으로는 bigint 컬럼을 못 씁니다.)
--
-- psql 또는 DBeaver 등으로 DB 접속 후 전체 실행:
--   psql "postgresql://USER:PASSWORD@HOST:5433/smartdi" -f alter_contracts_contract_no_to_text.sql

-- 기존에 bigint로 저장된 값은 ::text 로 옮깁니다.
ALTER TABLE contracts_rows
  ALTER COLUMN "contractNo" TYPE text
  USING (
    CASE
      WHEN "contractNo" IS NULL THEN NULL::text
      ELSE trim("contractNo"::text)
    END
  );
