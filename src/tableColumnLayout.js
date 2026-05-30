/** 테이블 컬럼 — 짧은 고정 vs 긴 텍스트(3줄 clamp) 분류 */

const LONG_TEXT_COLUMN_KEYS = new Set([
  'client',
  'department',
  'identNo',
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

export function getTableAlignClass(align, column) {
  if (column && isLongTextTableColumn(column)) {
    if (align === 'right') return 'th-align-right'
    return 'th-align-left'
  }
  if (column && isStrictNowrapTableColumn(column)) {
    return 'th-align-center'
  }
  if (align === 'right') return 'th-align-right'
  if (align === 'left') return 'th-align-left'
  return 'th-align-center'
}

/** 본문 셀 정렬 — 고정 포맷은 가운데, 긴 텍스트는 좌측 */
export function getTableBodyAlignClass(column) {
  if (!column) return 'td-align-center'
  if (isLongTextTableColumn(column)) {
    if (column.align === 'right') return 'td-align-right'
    if (column.align === 'center') return 'td-align-center'
    return 'td-align-left'
  }
  return 'td-align-center'
}

export function isLongTextTableColumn(column) {
  if (!column) return false
  if (
    column.type === 'date' ||
    column.type === 'amount' ||
    column.type === 'select' ||
    column.type === 'importance' ||
    column.type === 'salesDetailHistory'
  ) {
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
