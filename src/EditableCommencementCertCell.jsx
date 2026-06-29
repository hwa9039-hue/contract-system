import { useEffect, useState } from 'react'
import { TABLE_INLINE_INPUT_STANDARD_CLASS } from './tableInlineInputClass.js'
import {
  COMMENCEMENT_CERT_OMIT_LABEL,
  isCommencementCertOmitValue,
  toCommencementCertDbValue,
  toDateInputValue,
} from './dateFieldUtils.js'
import { tableCellStateClass } from './tableCellEmptyState.js'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeCommencementCertSaveValue(raw) {
  const normalized = toCommencementCertDbValue(raw)
  return normalized === null ? null : normalized
}

export function EditableCommencementCertCell({
  value,
  onSave,
  disabled = false,
  className = '',
}) {
  const omitActive = isCommencementCertOmitValue(value)
  const displayDate = omitActive ? '' : toDateInputValue(value)
  const isEmpty = !omitActive && displayDate.trim() === ''
  const stateClass = tableCellStateClass(!omitActive && isEmpty)
  const [omitMode, setOmitMode] = useState(omitActive)
  const [draft, setDraft] = useState(displayDate)

  useEffect(() => {
    const nextOmit = isCommencementCertOmitValue(value)
    setOmitMode(nextOmit)
    setDraft(nextOmit ? '' : toDateInputValue(value))
  }, [value])

  const commitValue = (nextRaw) => {
    const nextDb = normalizeCommencementCertSaveValue(nextRaw)
    const prevDb = normalizeCommencementCertSaveValue(
      isCommencementCertOmitValue(value) ? COMMENCEMENT_CERT_OMIT_LABEL : value
    )
    if (nextDb !== prevDb) {
      onSave?.(nextDb)
    }
  }

  const commitDraft = () => {
    if (omitMode) {
      commitValue(COMMENCEMENT_CERT_OMIT_LABEL)
      return
    }
    commitValue(draft)
  }

  const enableOmitMode = () => {
    setOmitMode(true)
    setDraft('')
    commitValue(COMMENCEMENT_CERT_OMIT_LABEL)
  }

  const enableDateMode = () => {
    setOmitMode(false)
    setDraft('')
    commitValue(null)
  }

  if (disabled) {
    return (
      <div
        className={`cell-display editable-date-cell-display text-center ${stateClass} ${
          isEmpty && !omitActive ? 'table-cell-empty-placeholder' : ''
        } ${className}`.trim()}
      >
        {omitActive ? COMMENCEMENT_CERT_OMIT_LABEL : displayDate || '\u00a0'}
      </div>
    )
  }

  return (
    <div className={`commencement-cert-cell ${stateClass} ${className}`.trim()}>
      {omitMode ? (
        <>
          <span className="commencement-cert-omit-label">{COMMENCEMENT_CERT_OMIT_LABEL}</span>
          <button
            type="button"
            className="commencement-cert-mode-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={enableDateMode}
          >
            날짜
          </button>
        </>
      ) : (
        <>
          <input
            type="date"
            className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} editable-date-cell-input commencement-cert-date-input`}
            value={draft}
            disabled={disabled}
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
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDraft()
              }
            }}
          />
          <button
            type="button"
            className="commencement-cert-mode-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={enableOmitMode}
          >
            {COMMENCEMENT_CERT_OMIT_LABEL}
          </button>
        </>
      )}
    </div>
  )
}
