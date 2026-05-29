/** 사업검색이력 테이블 헤더 다중 필터 — 공통 로직 */

import {
  getImportanceStyle,
  resolveRegistryImportanceStatus,
} from './registryImportance.jsx'

export const EXCLUDED_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'importance',
  'writeDate',
  'category',
  'writer',
  'projectName',
  'client',
  'projectAmount',
  'exclusionReason',
])

export const EXCLUDED_COLUMN_FILTER_BLANK = '(비어 있음)'

const NUMERIC_SORT_COLUMN_KEYS = new Set(['projectAmount'])

const EXCLUDED_IMPORTANCE_COLUMN = Object.freeze({
  key: 'importance',
  type: 'importance',
  statusKey: 'category',
})

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
export function getExcludedColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (columnKey === 'importance') {
    const { label } = getImportanceStyle(
      resolveRegistryImportanceStatus(row, EXCLUDED_IMPORTANCE_COLUMN)
    )
    return label || EXCLUDED_COLUMN_FILTER_BLANK
  }

  if (columnKey === 'projectAmount') {
    const displayed = formatAmountForFilter(row.projectAmount)
    return displayed || EXCLUDED_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || EXCLUDED_COLUMN_FILTER_BLANK
}

export function buildExcludedColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items.filter((row) => !row?.isDraft) : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getExcludedColumnFilterCellValue(item, columnKey)
    if (cell === EXCLUDED_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  if (NUMERIC_SORT_COLUMN_KEYS.has(columnKey)) {
    sorted.sort((a, b) => compareNumericColumnValues(a, b))
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = list.some(
    (item) => getExcludedColumnFilterCellValue(item, columnKey) === EXCLUDED_COLUMN_FILTER_BLANK
  )
  if (hasBlank) sorted = [EXCLUDED_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function excludedMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getExcludedColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

/** [1단계] 원본 행 배열에 헤더 열 필터(AND) 적용 */
export function filterExcludedRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveExcludedColumnFilters(activeFilters)) return list
  return list.filter(
    (item) => item?.isDraft || excludedMatchesColumnFilters(item, activeFilters)
  )
}

export function normalizeExcludedColumnFilterSelection(selected, options) {
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

export function hasActiveExcludedColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0
  )
}
