/** BIT 이력관리 테이블 헤더 다중 필터 — 문서수발신대장과 같은 클라이언트 필터 */

import { compareYearMonthDesc, toYearMonthFilterValue } from './dateFieldUtils.js'

export const BIT_COLUMN_FILTER_BLANK = '(비어 있음)'

const YEAR_MONTH_FILTER_COLUMN_KEYS = new Set(['contractDate', 'dueDate'])

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function formatAmountComma(value) {
  const raw = safeString(value).replace(/[^\d]/g, '')
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

function compareKoreanText(a, b) {
  return safeString(a).localeCompare(safeString(b), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

/** 행·컬럼 → 필터 비교용 표시값 (테이블 셀 표시와 동일 기준) */
export function getBitColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (YEAR_MONTH_FILTER_COLUMN_KEYS.has(columnKey)) {
    const ym = toYearMonthFilterValue(row[columnKey])
    return ym || BIT_COLUMN_FILTER_BLANK
  }

  if (columnKey === 'contractAmount') {
    return formatAmountComma(row[columnKey]) || BIT_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || BIT_COLUMN_FILTER_BLANK
}

export function buildBitColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getBitColumnFilterCellValue(item, columnKey)
    if (cell === BIT_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  if (YEAR_MONTH_FILTER_COLUMN_KEYS.has(columnKey)) {
    sorted.sort(compareYearMonthDesc)
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = list.some(
    (item) => getBitColumnFilterCellValue(item, columnKey) === BIT_COLUMN_FILTER_BLANK,
  )
  if (hasBlank) sorted = [BIT_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function bitMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getBitColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

export function filterBitRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveBitColumnFilters(activeFilters)) return list
  return list.filter((item) => bitMatchesColumnFilters(item, activeFilters))
}

export function normalizeBitColumnFilterSelection(selected, options) {
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

export function hasActiveBitColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0,
  )
}
