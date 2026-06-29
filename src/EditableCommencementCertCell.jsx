import { useEffect, useState } from 'react'
import { TABLE_INLINE_INPUT_STANDARD_CLASS } from './tableInlineInputClass.js'
import {
  COMMENCEMENT_CERT_OMIT_LABEL,
  isCommencementCertOmitValue,
  toCommencementCertApiValue,
  toDateInputValue,
} from './dateFieldUtils.js'
import { tableCellStateClass } from './tableCellEmptyState.js'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeCommencementCertApiValue(raw) {
  if (isCommencementCertOmitValue(raw)) return null
  return toCommencementCertApiValue(raw)
}

function currentCommencementCertApiValue(value) {
  if (isCommencementCertOmitValue(value)) return null
  return toCommencementCertApiValue(value)
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
  const stateClass = tableCellStateClass(isEmpty)
  const [omitMode, setOmitMode] = useState(omitActive)
  const [draft, setDraft] = useState(displayDate)
  const hasDateValue = !omitActive && safeString(draft).trim() !== ''

  useEffect(() => {
    const nextOmit = isCommencementCertOmitValue(value)
    setOmitMode(nextOmit)
    setDraft(nextOmit ? '' : toDateInputValue(value))
  }, [value])

  const commitValue = (nextRaw) => {
    if (isCommencementCertOmitValue(nextRaw)) {
      if (!isCommencementCertOmitValue(value)) {
        onSave?.(COMMENCEMENT_CERT_OMIT_LABEL)
      }
      return
    }

    const nextApi = normalizeCommencementCertApiValue(nextRaw)
    const prevApi = currentCommencementCertApiValue(value)
    if (nextApi !== prevApi) {
      onSave?.(nextRaw === null || safeString(nextRaw).trim() === '' ? null : safeString(nextRaw).trim())
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
        className={`cell-display editable-date-cell-display text-center ${
          omitActive ? 'commencement-cert-readonly-omit' : stateClass
        } ${isEmpty && !omitActive ? 'table-cell-empty-placeholder' : ''} ${className}`.trim()}
      >
        {omitActive ? COMMENCEMENT_CERT_OMIT_LABEL : displayDate || '\u00a0'}
      </div>
    )
  }

  return (
    <div
      className={`commencement-cert-cell${omitMode ? ' is-omit' : ' is-date'}${omitMode ? '' : ` ${stateClass}`} ${className}`.trim()}
    >
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
            className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} editable-date-cell-input commencement-cert-date-input${
              hasDateValue ? ' has-value' : ''
            }`}
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
