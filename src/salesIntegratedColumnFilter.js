/** 영업관리(통합) 테이블 헤더 다중 필터 */

import { compareYearMonthDesc, toYearMonthFilterValue } from './dateFieldUtils.js'

export const SALES_INTEGRATED_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'statusLabel',
  'sourceMenu',
  'date',
  'client',
  'title',
  'amount',
  'manager',
  'note',
])

export const SALES_INTEGRATED_COLUMN_FILTER_BLANK = '(비어 있음)'

const YEAR_MONTH_FILTER_COLUMN_KEYS = new Set(['date'])

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
export function getSalesIntegratedColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (columnKey === 'statusLabel') {
    const raw = safeString(row.stage || row.statusLabel).trim()
    return raw || SALES_INTEGRATED_COLUMN_FILTER_BLANK
  }

  if (YEAR_MONTH_FILTER_COLUMN_KEYS.has(columnKey)) {
    const ym = toYearMonthFilterValue(row.date)
    return ym || SALES_INTEGRATED_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || SALES_INTEGRATED_COLUMN_FILTER_BLANK
}

export function buildSalesIntegratedColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getSalesIntegratedColumnFilterCellValue(item, columnKey)
    if (cell === SALES_INTEGRATED_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  if (YEAR_MONTH_FILTER_COLUMN_KEYS.has(columnKey)) {
    sorted.sort(compareYearMonthDesc)
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = list.some(
    (item) =>
      getSalesIntegratedColumnFilterCellValue(item, columnKey) ===
      SALES_INTEGRATED_COLUMN_FILTER_BLANK,
  )
  if (hasBlank) sorted = [SALES_INTEGRATED_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function salesIntegratedMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getSalesIntegratedColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

export function filterSalesIntegratedRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveSalesIntegratedColumnFilters(activeFilters)) return list
  return list.filter((item) => salesIntegratedMatchesColumnFilters(item, activeFilters))
}

export function normalizeSalesIntegratedColumnFilterSelection(selected, options) {
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

export function hasActiveSalesIntegratedColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0,
  )
}
