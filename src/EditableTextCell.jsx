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

export function EditableTextCell({
  value,
  onSave,
  disabled = false,
  align = 'left',
  className = '',
  suffix = null,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(() => (value == null ? '' : String(value)))

  useEffect(() => {
    if (!isEditing) {
      setDraft(value == null ? '' : String(value))
    }
  }, [value, isEditing])

  const displayValue = value == null ? '' : String(value)
  const isEmpty = isTableCellEmpty(displayValue)
  const stateClass = tableCellStateClass(isEmpty)

  const handleCommit = () => {
    setIsEditing(false)
    const next = draft
    if (next !== displayValue) {
      onSave?.(next)
    }
  }

  const handleCancel = () => {
    setDraft(displayValue)
    setIsEditing(false)
  }

  if (disabled) {
    return (
      <div
        className={`cell-display editable-text-cell-display editable-text-cell-display--${align} ${stateClass} ${
          isEmpty ? 'table-cell-empty-placeholder' : ''
        } ${className}`.trim()}
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
        className={TABLE_INLINE_INPUT_STANDARD_CLASS}
        style={{ textAlign: align }}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
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
