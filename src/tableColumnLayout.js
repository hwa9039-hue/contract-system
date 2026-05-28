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
])

/** 줄바꿈 없이 한 줄로 유지할 고정 포맷 컬럼 */
const STRICT_NOWRAP_COLUMN_KEYS = new Set([
  'year',
  'refNo',
  'contractNo',
  'identNo',
  'contractDate',
  'dueDate',
  'amount',
  'projectAmount',
  'registerDate',
  'writeDate',
  'openDate',
  'docDate',
  'docNo',
  'contractMethod',
  'contractType',
  'salesOwner',
  'pm',
  'manager',
  'projectCategory',
  'projectStage',
  'category',
  'keyword',
  'writer',
  'method',
  'checkStatus',
  'salesTarget',
  'permitDate',
  'completionPeriod',
])

export function getTableAlignClass(align) {
  if (align === 'right') return 'th-align-right'
  if (align === 'left') return 'th-align-left'
  return 'th-align-center'
}

export function isLongTextTableColumn(column) {
  if (!column) return false
  if (column.type === 'date' || column.type === 'amount' || column.type === 'select' || column.type === 'importance') {
    return false
  }
  if (STRICT_NOWRAP_COLUMN_KEYS.has(column.key)) {
    return false
  }
  if (column.type === 'textarea') return true
  return LONG_TEXT_COLUMN_KEYS.has(column.key)
}

export function isStrictNowrapTableColumn(column) {
  return !isLongTextTableColumn(column)
}

export function getTableColumnLayoutClass(column) {
  return isLongTextTableColumn(column) ? 'table-col-long' : 'table-col-tight'
}
