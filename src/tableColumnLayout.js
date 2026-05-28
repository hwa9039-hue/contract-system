/** 테이블 컬럼 — 짧은 고정 vs 긴 텍스트(3줄 clamp) 분류 */

const LONG_TEXT_COLUMN_KEYS = new Set([
  'client',
  'department',
  'projectName',
  'detail',
  'source',
  'salesNote',
  'actionRequest',
  'note',
  'exclusionReason',
  'senderReceiver',
  'title',
  'completionPeriod',
])

export function getTableAlignClass(align) {
  if (align === 'right') return 'th-align-right'
  if (align === 'left') return 'th-align-left'
  return 'th-align-center'
}

export function isLongTextTableColumn(column) {
  if (!column) return false
  if (column.type === 'textarea') return true
  return LONG_TEXT_COLUMN_KEYS.has(column.key)
}

export function getTableColumnLayoutClass(column) {
  return isLongTextTableColumn(column) ? 'table-col-long' : 'table-col-tight'
}
