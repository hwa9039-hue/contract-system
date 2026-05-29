/** 연락처 테이블 헤더 다중 필터 — 공통 로직 */

export const CONTACTS_MANAGE_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'category',
  'business_content',
  'manager_name',
  'position',
  'phone',
  'email',
  'notes',
])

export const CONTACTS_MANAGE_COLUMN_FILTER_BLANK = '(비어 있음)'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function compareKoreanText(a, b) {
  return safeString(a).localeCompare(safeString(b), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

/** 행·컬럼 → 필터 비교용 표시값 (테이블 셀 표시와 동일 기준) */
export function getContactsManageColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}
  const raw = safeString(row[columnKey]).trim()
  return raw || CONTACTS_MANAGE_COLUMN_FILTER_BLANK
}

export function buildContactsManageColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items.filter((row) => !row?.isDraft) : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getContactsManageColumnFilterCellValue(item, columnKey)
    if (cell === CONTACTS_MANAGE_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  sorted.sort(compareKoreanText)

  const hasBlank = list.some(
    (item) => getContactsManageColumnFilterCellValue(item, columnKey) === CONTACTS_MANAGE_COLUMN_FILTER_BLANK
  )
  if (hasBlank) sorted = [CONTACTS_MANAGE_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function contactsManageMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getContactsManageColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

/** [1단계] 원본 행 배열에 헤더 열 필터(AND) 적용 */
export function filterContactsManageRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveContactsManageColumnFilters(activeFilters)) return list
  return list.filter(
    (item) => item?.isDraft || contactsManageMatchesColumnFilters(item, activeFilters)
  )
}

export function normalizeContactsManageColumnFilterSelection(selected, options) {
  if (!Array.isArray(selected) || selected.length === 0) return []
  if (!Array.isArray(options) || options.length === 0) return [...selected]
  if (
    options.length > 1 &&
    selected.length >= options.length &&
    options.every((option) => selected.includes(option))
  ) {
    return []
  }
  return [...selected]
}

export function hasActiveContactsManageColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0
  )
}
