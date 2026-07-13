import { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { EXCLUDED_INLINE_EDITOR_CLASS, REGISTRY_DATE_INPUT_FIELD_CLASS } from './tableInlineInputClass.js'

function openNativeDatePicker(inputEl) {
  if (!inputEl) return
  if (typeof inputEl.showPicker === 'function') {
    try {
      inputEl.showPicker()
      return
    } catch {
      /* 일부 브라우저는 사용자 제스처 없으면 거부 */
    }
  }
  inputEl.click()
}

export function RegistryTableDateInput({
  className: inputClassName = '',
  style = null,
  onClick,
  ...inputProps
}) {
  const inputRef = useRef(null)

  return (
    <div className="registry-table-date-input">
      <input
        ref={inputRef}
        type="date"
        className={`registry-table-date-input-field ${EXCLUDED_INLINE_EDITOR_CLASS} ${REGISTRY_DATE_INPUT_FIELD_CLASS}${
          inputClassName ? ` ${inputClassName}` : ''
        }`.trim()}
        style={style}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(e)
        }}
        {...inputProps}
      />
      <button
        type="button"
        className="registry-table-date-input-icon"
        tabIndex={-1}
        aria-label="날짜 선택"
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.stopPropagation()
          openNativeDatePicker(inputRef.current)
        }}
      >
        <Calendar size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}
