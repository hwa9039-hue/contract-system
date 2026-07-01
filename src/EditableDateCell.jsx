import { useEffect, useState } from 'react'
import { TABLE_INLINE_INPUT_STANDARD_CLASS } from './tableInlineInputClass.js'
import { formatDateDisplay, toDateInputValue } from './dateFieldUtils.js'
import {
  TABLE_CELL_EMPTY_LABEL,
  isDateTableCellEmpty,
  tableCellStateClass,
} from './tableCellEmptyState.js'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function EditableDateCell({
  value,
  onSave,
  disabled = false,
  className = '',
}) {
  const displayValue = toDateInputValue(value)
  const isEmpty = isDateTableCellEmpty(value)
  const stateClass = tableCellStateClass(isEmpty)
  const displayText = isEmpty ? TABLE_CELL_EMPTY_LABEL : formatDateDisplay(value)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(displayValue)

  useEffect(() => {
    if (!isEditing) {
      setDraft(displayValue)
    }
  }, [displayValue, isEditing])

  const commitValue = (nextRaw) => {
    const nextDb = safeString(nextRaw).trim() === '' ? null : safeString(nextRaw).trim()
    const prevDb = displayValue.trim() === '' ? null : displayValue.trim()
    if (nextDb !== prevDb) {
      onSave?.(nextDb)
    }
  }

  const commitDraft = () => {
    commitValue(draft)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setDraft(displayValue)
    setIsEditing(false)
  }

  if (disabled) {
    return (
      <div
        className={`cell-display editable-date-cell-display text-center ${stateClass} ${
          isEmpty ? 'table-cell-empty-placeholder' : ''
        } ${className}`.trim()}
      >
        {displayText}
      </div>
    )
  }

  if (isEditing) {
    return (
      <input
        type="date"
        className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} editable-date-cell-input ${stateClass}${
          draft.trim() ? ' has-value' : ''
        } ${className}`.trim()}
        value={draft}
        disabled={disabled}
        autoFocus
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          if (next.trim() === '') {
            commitValue('')
          }
        }}
        onBlur={commitDraft}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            handleCancel()
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            commitDraft()
          }
        }}
      />
    )
  }

  return (
    <div
      className={`cell-display editable-date-cell-display text-center ${stateClass} ${
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
      {displayText}
    </div>
  )
}
