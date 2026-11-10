/** 견적·설계 반출 현황 테이블 헤더 다중 필터 — 문서수발신대장과 같은 클라이언트 필터 */

import { compareYearMonthDesc, toYearMonthFilterValue } from './dateFieldUtils.js'
import { resolveSenderName } from './userNameMap.js'

export const EMAIL_EXPORT_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'sentAt',
  'name',
  'sender',
  'recipient',
  'subject',
])

export const EMAIL_EXPORT_COLUMN_FILTER_BLANK = '(비어 있음)'

const YEAR_MONTH_FILTER_COLUMN_KEYS = new Set(['sentAt'])

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
export function getEmailExportColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (YEAR_MONTH_FILTER_COLUMN_KEYS.has(columnKey)) {
    const ym = toYearMonthFilterValue(row.sentAt)
    return ym || EMAIL_EXPORT_COLUMN_FILTER_BLANK
  }

  if (columnKey === 'name') {
    const name = safeString(resolveSenderName(row.sender)).trim()
    return name || EMAIL_EXPORT_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || EMAIL_EXPORT_COLUMN_FILTER_BLANK
}

export function buildEmailExportColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getEmailExportColumnFilterCellValue(item, columnKey)
    if (cell === EMAIL_EXPORT_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  if (YEAR_MONTH_FILTER_COLUMN_KEYS.has(columnKey)) {
    sorted.sort(compareYearMonthDesc)
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = list.some(
    (item) => getEmailExportColumnFilterCellValue(item, columnKey) === EMAIL_EXPORT_COLUMN_FILTER_BLANK,
  )
  if (hasBlank) sorted = [EMAIL_EXPORT_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function emailExportMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getEmailExportColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

/** [1단계] 원본 행 배열에 헤더 열 필터(AND) 적용 */
export function filterEmailExportRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveEmailExportColumnFilters(activeFilters)) return list
  return list.filter((item) => emailExportMatchesColumnFilters(item, activeFilters))
}

export function normalizeEmailExportColumnFilterSelection(selected, options) {
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

export function hasActiveEmailExportColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0,
  )
}
