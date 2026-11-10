/** 영업정보 연락처 테이블 헤더 다중 필터 */

export const SALES_CONTACTS_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'managerName',
  'position',
  'phone',
  'email',
  'division',
  'companyName',
  'department',
  'status',
  'linkedProject',
  'review',
  'address',
  'notes',
])

export const SALES_CONTACTS_COLUMN_FILTER_BLANK = '(비어 있음)'

const STATUS_LABEL = Object.freeze({
  active: '활성',
  inactive: '비활성',
})

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

function normalizeStatusLabel(value) {
  const raw = safeString(value).trim().toLowerCase()
  if (
    raw === 'inactive' ||
    raw === '비활성' ||
    raw === '비활성화' ||
    raw === 'disabled' ||
    raw === 'n' ||
    raw === '0'
  ) {
    return STATUS_LABEL.inactive
  }
  if (!raw) return SALES_CONTACTS_COLUMN_FILTER_BLANK
  return STATUS_LABEL.active
}

function linkedProjectFilterText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeString(item).trim()).filter(Boolean).join(', ')
  }
  return safeString(value).trim()
}

/** 행·컬럼 → 필터 비교용 표시값 (테이블 셀 표시와 동일 기준) */
export function getSalesContactsColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (columnKey === 'status') {
    return normalizeStatusLabel(row.status)
  }

  if (columnKey === 'linkedProject') {
    const text = linkedProjectFilterText(row.linkedProject)
    return text || SALES_CONTACTS_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || SALES_CONTACTS_COLUMN_FILTER_BLANK
}

export function buildSalesContactsColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getSalesContactsColumnFilterCellValue(item, columnKey)
    if (cell === SALES_CONTACTS_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  sorted.sort(compareKoreanText)

  const hasBlank = list.some(
    (item) =>
      getSalesContactsColumnFilterCellValue(item, columnKey) === SALES_CONTACTS_COLUMN_FILTER_BLANK,
  )
  if (hasBlank) sorted = [SALES_CONTACTS_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function salesContactsMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getSalesContactsColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

export function filterSalesContactsRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveSalesContactsColumnFilters(activeFilters)) return list
  return list.filter((item) => salesContactsMatchesColumnFilters(item, activeFilters))
}

export function normalizeSalesContactsColumnFilterSelection(selected, options) {
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

export function hasActiveSalesContactsColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0,
  )
}
