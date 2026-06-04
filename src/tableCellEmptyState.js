import { formatDateDisplay, toDateInputValue } from './dateFieldUtils.js'

/** 표 셀 — 미입력 placeholder 문구 */
export const TABLE_CELL_EMPTY_LABEL = '미입력'

/** null·undefined·공백만 — 하이픈(-)은 유효 입력값 */
export function isTableCellEmpty(value) {
  if (value === null || value === undefined) return true
  return String(value).trim() === ''
}

export function isDateTableCellEmpty(value) {
  return isTableCellEmpty(toDateInputValue(value))
}

/** td / cell-display 조건부 배경 */
export function tableCellStateClass(isEmpty) {
  return isEmpty ? 'table-cell--empty' : 'table-cell--filled'
}

export function formatEditableTableCellText(value, { isDate = false } = {}) {
  if (isDate) {
    if (isDateTableCellEmpty(value)) {
      return { isEmpty: true, text: TABLE_CELL_EMPTY_LABEL }
    }
    const displayed = formatDateDisplay(value)
    return { isEmpty: false, text: displayed || TABLE_CELL_EMPTY_LABEL }
  }
  const text = value == null ? '' : String(value).trim()
  if (isTableCellEmpty(text)) {
    return { isEmpty: true, text: TABLE_CELL_EMPTY_LABEL }
  }
  return { isEmpty: false, text }
}
