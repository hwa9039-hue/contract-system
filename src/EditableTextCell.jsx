import { useEffect, useState } from 'react'
import { TABLE_INLINE_INPUT_STANDARD_CLASS } from './tableInlineInputClass.js'
import {
  TABLE_CELL_EMPTY_LABEL,
  isTableCellEmpty,
  tableCellStateClass,
} from './tableCellEmptyState.js'

/** 날짜·금액·드롭다운·중요도가 아닌 순수 텍스트 컬럼 */
export function isEditableTextColumn(column) {
  if (!column) return false
  const type = column.type
  if (type === 'date' || type === 'amount' || type === 'select' || type === 'importance') {
    return false
  }
  return type === 'text' || type === 'textarea'
}

/** @deprecated — use isEditableTextColumn */
export const isContractEditableTextColumn = isEditableTextColumn

function normalizeAmountDigits(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(value).replace(/[^0-9]/g, '')
}

/** 금액 입력용: 숫자만 남겨 3자리 콤마로 표시 (예: 1000000 → 1,000,000) */
export function formatAmountInputValue(value) {
  const raw = normalizeAmountDigits(value)
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

export function EditableTextCell({
  value,
  onSave,
  disabled = false,
  align = 'left',
  className = '',
  inputClassName = '',
  inputStyle = null,
  displayStyle = null,
  suffix = null,
  /** 'amount' 이면 입력 중에도 콤마 포맷 + 숫자만 허용 */
  formatMode = null,
}) {
  const toDisplay = (raw) => {
    if (formatMode === 'amount') return formatAmountInputValue(raw)
    return raw == null ? '' : String(raw)
  }

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(() => toDisplay(value))

  useEffect(() => {
    if (!isEditing) {
      setDraft(toDisplay(value))
    }
  }, [value, isEditing, formatMode])

  const displayValue = toDisplay(value)
  const isEmpty = isTableCellEmpty(displayValue)
  const stateClass = tableCellStateClass(isEmpty)

  const handleCommit = () => {
    setIsEditing(false)
    const next = formatMode === 'amount' ? formatAmountInputValue(draft) : draft
    if (next !== displayValue) {
      onSave?.(next)
    }
  }

  const handleCancel = () => {
    setDraft(displayValue)
    setIsEditing(false)
  }

  const handleChange = (e) => {
    const next = e.target.value
    if (formatMode === 'amount') {
      setDraft(formatAmountInputValue(next))
      return
    }
    setDraft(next)
  }

  if (disabled) {
    return (
      <div
        className={`cell-display editable-text-cell-display editable-text-cell-display--${align} ${stateClass} ${
          isEmpty ? 'table-cell-empty-placeholder' : ''
        } ${className}`.trim()}
        style={displayStyle || undefined}
      >
        {isEmpty ? TABLE_CELL_EMPTY_LABEL : displayValue}
        {suffix}
      </div>
    )
  }

  if (isEditing) {
    return (
      <input
        type="text"
        inputMode={formatMode === 'amount' ? 'numeric' : undefined}
        className={`${TABLE_INLINE_INPUT_STANDARD_CLASS}${inputClassName ? ` ${inputClassName}` : ''}`.trim()}
        style={{ ...(inputStyle || {}), textAlign: align }}
        value={draft}
        autoFocus
        onChange={handleChange}
        onBlur={handleCommit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleCommit()
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            handleCancel()
          }
        }}
      />
    )
  }

  return (
    <div
      className={`cell-display editable-text-cell-display editable-text-cell-display--${align} ${stateClass} ${
        isEmpty ? 'table-cell-empty-placeholder' : ''
      } ${className}`.trim()}
      style={displayStyle || undefined}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setIsEditing(true)
        }
      }}
    >
      {isEmpty ? TABLE_CELL_EMPTY_LABEL : displayValue}
      {suffix}
    </div>
  )
}
