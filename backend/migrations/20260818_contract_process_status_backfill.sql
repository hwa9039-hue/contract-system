-- 기존 계약 공정상태 1회성 세팅 (한국 날짜 기준)
-- 준공일 < 오늘 → 준공완료 / 그 외(당일·미래·준공일 없음) → 진행중
-- 이미 진행중/준공완료인 수기 값은 유지. 빈 값·구버전(시공중/준공)만 갱신.

ALTER TABLE contracts_rows
  ADD COLUMN IF NOT EXISTS "processStatus" text NOT NULL DEFAULT '';

UPDATE contracts_rows
SET "processStatus" = CASE
  WHEN "dueDate" IS NOT NULL
       AND "dueDate" < (timezone('Asia/Seoul', now()))::date
  THEN '준공완료'
  ELSE '진행중'
END
WHERE btrim(coalesce("processStatus", '')) = ''
   OR "processStatus" IN ('시공중', '준공');
