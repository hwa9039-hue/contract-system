import { useEffect, useState } from 'react'
import { TABLE_INLINE_INPUT_STANDARD_CLASS } from './tableInlineInputClass.js'
import { toDateInputValue } from './dateFieldUtils.js'

export function EditableDateCell({
  value,
  onSave,
  disabled = false,
  className = '',
}) {
  const displayValue = toDateInputValue(value)
  const [draft, setDraft] = useState(displayValue)

  useEffect(() => {
    setDraft(displayValue)
  }, [displayValue])

  const handleChange = (next) => {
    setDraft(next)
    if (next !== displayValue) {
      onSave?.(next || null)
    }
  }

  if (disabled) {
    return (
      <div className={`cell-display editable-date-cell-display text-center ${className}`.trim()}>
        {displayValue || '\u00a0'}
      </div>
    )
  }

  return (
    <input
      type="date"
      className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} editable-date-cell-input ${className}`.trim()}
      value={draft}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    />
  )
}
