-- 기존 계약 공정상태 일괄 세팅
-- 준공일 경과 → 준공완료 / 그 외(미래·당일·준공일 없음) → 진행중
-- 보류 옵션은 UI에서 제거됨

ALTER TABLE contracts_rows
  ADD COLUMN IF NOT EXISTS "processStatus" text NOT NULL DEFAULT '';

-- 구버전·보류 정리 후 날짜 기준으로 재배정
UPDATE contracts_rows
SET "processStatus" = CASE
  WHEN nullif(trim("dueDate"::text), '') IS NOT NULL
       AND ("dueDate"::text)::date < CURRENT_DATE
  THEN '준공완료'
  ELSE '진행중'
END;
