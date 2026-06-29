function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** DB·엑셀 등에 남아 있는 placeholder 날짜 — 미입력과 동일 처리 */
export const PLACEHOLDER_EMPTY_DATE_YMD = Object.freeze(['2000-01-01', '1970-01-01'])

export function isPlaceholderEmptyDateYmd(ymd) {
  const s = safeString(ymd).trim()
  if (!s) return true
  return PLACEHOLDER_EMPTY_DATE_YMD.includes(s)
}

export function isValidCalendarDateYmd(ymd) {
  const match = safeString(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}

export function parseDateOnly(value) {
  const str = safeString(value).trim()
  if (!str) return null

  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  const date = new Date(str)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatDateInput(date) {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** API·input[type=date]용 YYYY-MM-DD 또는 null (빈 값·placeholder 날짜는 null) */
export function toDbDate(value) {
  if (value === null || value === undefined) return null
  const str = safeString(value).trim()
  if (!str) return null
  if (isValidCalendarDateYmd(str)) {
    return isPlaceholderEmptyDateYmd(str) ? null : str
  }
  const parsed = parseDateOnly(str)
  if (!parsed) return null
  const ymd = formatDateInput(parsed)
  return isPlaceholderEmptyDateYmd(ymd) ? null : ymd
}

/** 사업관리 착수계 — 날짜 대신 표시·저장하는 예외 텍스트 */
export const COMMENCEMENT_CERT_OMIT_LABEL = '생략'

export function isCommencementCertOmitValue(value) {
  return safeString(value).trim() === COMMENCEMENT_CERT_OMIT_LABEL
}

/** 착수계 표시용 (날짜 YYYY-MM-DD 또는 '생략') */
export function formatCommencementCertDisplay(value) {
  if (isCommencementCertOmitValue(value)) return COMMENCEMENT_CERT_OMIT_LABEL
  return formatDateDisplay(value)
}

/** 착수계 API 저장용 (YYYY-MM-DD | '생략' | null) */
export function toCommencementCertDbValue(value) {
  if (value === null || value === undefined) return null
  const str = safeString(value).trim()
  if (!str) return null
  if (isCommencementCertOmitValue(str)) return COMMENCEMENT_CERT_OMIT_LABEL
  return toDbDate(str)
}

export function isCommencementCertCellEmpty(value) {
  if (isCommencementCertOmitValue(value)) return false
  return !safeString(toDateInputValue(value)).trim()
}

/** 테이블 표시용 YYYY-MM-DD (빈 값은 '') */
export function toDateInputValue(value) {
  return toDbDate(value) ?? ''
}

export function formatDateDisplay(value) {
  const ymd = toDbDate(value)
  return ymd || ''
}
