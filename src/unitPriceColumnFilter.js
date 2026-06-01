/** 단가관리 평면 리스트 — 헤더 열 필터·통합 검색 */

export const UNIT_PRICE_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'year',
  'client',
  'projectName',
  'contractNo',
  'itemName',
  'costService',
  'designUnitPrice',
  'pitch',
  'capW',
  'capH',
])

export const UNIT_PRICE_COLUMN_FILTER_BLANK = '(비어 있음)'

const NUMERIC_SORT_COLUMN_KEYS = new Set(['year', 'designUnitPrice'])

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function getYearLabel(value) {
  const s = safeString(value).trim()
  if (!s) return ''
  const match = s.match(/\d{4}/)
  return match ? match[0] : s
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

function compareNumericColumnValues(a, b, columnKey) {
  if (columnKey === 'year') {
    const ya = Number(getYearLabel(a)) || 0
    const yb = Number(getYearLabel(b)) || 0
    if (ya !== yb) return yb - ya
    return compareKoreanText(a, b)
  }
  if (columnKey === 'designUnitPrice') {
    const na = Number(safeString(a).replace(/[^\d]/g, '')) || 0
    const nb = Number(safeString(b).replace(/[^\d]/g, '')) || 0
    if (na !== nb) return nb - na
    return compareKoreanText(a, b)
  }
  return compareKoreanText(a, b)
}

export function getUnitPriceColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (columnKey === 'year') {
    const label = getYearLabel(row.year)
    return label || UNIT_PRICE_COLUMN_FILTER_BLANK
  }

  if (columnKey === 'designUnitPrice') {
    const displayed = formatAmountForFilter(row.designUnitPrice)
    return displayed || UNIT_PRICE_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || UNIT_PRICE_COLUMN_FILTER_BLANK
}

export function buildUnitPriceColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getUnitPriceColumnFilterCellValue(item, columnKey)
    if (cell === UNIT_PRICE_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  if (NUMERIC_SORT_COLUMN_KEYS.has(columnKey)) {
    sorted.sort((a, b) => compareNumericColumnValues(a, b, columnKey))
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = list.some(
    (item) => getUnitPriceColumnFilterCellValue(item, columnKey) === UNIT_PRICE_COLUMN_FILTER_BLANK
  )
  if (hasBlank) sorted = [UNIT_PRICE_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function unitPriceMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getUnitPriceColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

export function filterUnitPriceRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveUnitPriceColumnFilters(activeFilters)) return list
  return list.filter((item) => unitPriceMatchesColumnFilters(item, activeFilters))
}

export function unitPriceMatchesSearch(item, search) {
  const q = safeString(search).trim().toLowerCase()
  if (!q) return true

  const row = item && typeof item === 'object' ? item : {}
  const text = UNIT_PRICE_FILTERABLE_COLUMN_KEYS.map((key) =>
    getUnitPriceColumnFilterCellValue(row, key)
  )
    .join(' ')
    .toLowerCase()

  return text.includes(q)
}

export function hasActiveUnitPriceColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0
  )
}
