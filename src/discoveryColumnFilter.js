/** 건축정보 테이블 헤더 다중 필터 — 공통 로직 */

export const DISCOVERY_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'permitDate',
  'checkStatus',
  'salesTarget',
  'projectCategory',
  'client',
  'projectName',
  'projectAmount',
  'completionPeriod',
  'manager',
  'note',
])

export const DISCOVERY_COLUMN_FILTER_BLANK = '(비어 있음)'

const NUMERIC_SORT_COLUMN_KEYS = new Set(['projectAmount'])

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function formatAmountForFilter(value) {
  const raw = safeString(value).replace(/[^\d]/g, '')
  if (!raw) return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return safeString(value).trim()
  return n.toLocaleString('ko-KR')
}

function compareKoreanText(a, b) {
  return safeString(a).localeCompare(safeString(b), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

function compareNumericColumnValues(a, b) {
  const na = Number(safeString(a).replace(/[^\d]/g, '')) || 0
  const nb = Number(safeString(b).replace(/[^\d]/g, '')) || 0
  if (na !== nb) return nb - na
  return compareKoreanText(a, b)
}

/** 행·컬럼 → 필터 비교용 표시값 (테이블 셀 표시와 동일 기준) */
export function getDiscoveryColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (columnKey === 'projectAmount') {
    const displayed = formatAmountForFilter(row.projectAmount)
    return displayed || DISCOVERY_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || DISCOVERY_COLUMN_FILTER_BLANK
}

export function buildDiscoveryColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items.filter((row) => !row?.isDraft) : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getDiscoveryColumnFilterCellValue(item, columnKey)
    if (cell === DISCOVERY_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  if (NUMERIC_SORT_COLUMN_KEYS.has(columnKey)) {
    sorted.sort((a, b) => compareNumericColumnValues(a, b))
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = list.some(
    (item) => getDiscoveryColumnFilterCellValue(item, columnKey) === DISCOVERY_COLUMN_FILTER_BLANK
  )
  if (hasBlank) sorted = [DISCOVERY_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function discoveryMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getDiscoveryColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

/** [1단계] 원본 행 배열에 헤더 열 필터(AND) 적용 */
export function filterDiscoveryRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveDiscoveryColumnFilters(activeFilters)) return list
  return list.filter(
    (item) => item?.isDraft || discoveryMatchesColumnFilters(item, activeFilters)
  )
}

export function normalizeDiscoveryColumnFilterSelection(selected, options) {
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

export function hasActiveDiscoveryColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0
  )
}
