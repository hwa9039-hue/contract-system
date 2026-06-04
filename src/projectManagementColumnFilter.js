/** 사업관리 평면 리스트 — 헤더 열 필터·통합 검색 */

import { formatDateDisplay } from './dateFieldUtils.js'

export const PROJECT_MANAGEMENT_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'year',
  'client',
  'contractDate',
  'dueDate',
  'projectName',
  'salesOwner',
  'pm',
  'commencementCert',
  'completionCert',
  'warrantyStart',
  'warrantyExpiry',
  'guaranteeRate',
])

export const PROJECT_MANAGEMENT_COLUMN_FILTER_BLANK = '(비어 있음)'

const DATE_COLUMN_KEYS = new Set([
  'contractDate',
  'dueDate',
  'commencementCert',
  'completionCert',
  'warrantyStart',
  'warrantyExpiry',
])

const NUMERIC_SORT_COLUMN_KEYS = new Set(['year'])

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
  return compareKoreanText(a, b)
}

export function getProjectManagementColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (columnKey === 'year') {
    const label = getYearLabel(row.year)
    return label || PROJECT_MANAGEMENT_COLUMN_FILTER_BLANK
  }

  if (DATE_COLUMN_KEYS.has(columnKey)) {
    const displayed = formatDateDisplay(row[columnKey])
    return displayed || PROJECT_MANAGEMENT_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || PROJECT_MANAGEMENT_COLUMN_FILTER_BLANK
}

export function buildProjectManagementColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getProjectManagementColumnFilterCellValue(item, columnKey)
    if (cell === PROJECT_MANAGEMENT_COLUMN_FILTER_BLANK) return
    values.add(cell)
  })

  let sorted = [...values]
  if (NUMERIC_SORT_COLUMN_KEYS.has(columnKey)) {
    sorted.sort((a, b) => compareNumericColumnValues(a, b, columnKey))
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = list.some(
    (item) =>
      getProjectManagementColumnFilterCellValue(item, columnKey) ===
      PROJECT_MANAGEMENT_COLUMN_FILTER_BLANK
  )
  if (hasBlank) sorted = [PROJECT_MANAGEMENT_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function projectManagementMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  if (activeKeys.length === 0) return true

  return activeKeys.every((key) => {
    const selected = columnFilters[key]
    const cellValue = getProjectManagementColumnFilterCellValue(item, key)
    return selected.includes(cellValue)
  })
}

export function filterProjectManagementRowsByActiveFilters(rows, activeFilters) {
  const list = Array.isArray(rows) ? rows : []
  if (!hasActiveProjectManagementColumnFilters(activeFilters)) return list
  return list.filter((row) => projectManagementMatchesColumnFilters(row, activeFilters))
}

export function hasActiveProjectManagementColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.values(columnFilters).some((selected) => Array.isArray(selected) && selected.length > 0)
}

const SEARCH_KEYS = [
  'year',
  'client',
  'contractDate',
  'dueDate',
  'projectName',
  'salesOwner',
  'pm',
  'commencementCert',
  'completionCert',
  'warrantyStart',
  'warrantyExpiry',
  'guaranteeRate',
  'contractType',
  'contractNo',
]

export function projectManagementMatchesSearch(item, search) {
  const q = safeString(search).trim().toLowerCase()
  if (!q) return true
  const row = item && typeof item === 'object' ? item : {}
  return SEARCH_KEYS.some((key) => {
    const raw = DATE_COLUMN_KEYS.has(key)
      ? formatDateDisplay(row[key])
      : safeString(row[key]).trim()
    return raw.toLowerCase().includes(q)
  })
}
