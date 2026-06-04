import { useEffect, useState } from 'react'
import { TABLE_INLINE_INPUT_STANDARD_CLASS } from './tableInlineInputClass.js'
import { toDateInputValue } from './dateFieldUtils.js'
import { isDateTableCellEmpty, tableCellStateClass } from './tableCellEmptyState.js'

export function EditableDateCell({
  value,
  onSave,
  disabled = false,
  className = '',
}) {
  const displayValue = toDateInputValue(value)
  const isEmpty = isDateTableCellEmpty(value)
  const stateClass = tableCellStateClass(isEmpty)
  const [draft, setDraft] = useState(displayValue)

  useEffect(() => {
    setDraft(displayValue)
  }, [displayValue])

  const commitDraft = () => {
    if (draft !== displayValue) {
      onSave?.(draft || null)
    }
  }

  if (disabled) {
    return (
      <div
        className={`cell-display editable-date-cell-display text-center ${stateClass} ${
          isEmpty ? 'table-cell-empty-placeholder' : ''
        } ${className}`.trim()}
      >
        {displayValue || '\u00a0'}
      </div>
    )
  }

  return (
    <input
      type="date"
      className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} editable-date-cell-input ${stateClass} ${className}`.trim()}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitDraft()
        }
      }}
    />
  )
}
