import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const WORK_REPORT_MANAGER_OPTIONS = [
  '전기웅',
  '유영무',
  '김성수',
  '이재승',
  '이용자',
  '박재범',
  '전재우',
  '정화영',
  '정주희',
  '신상준',
]

const BODY_MENU_OPEN_CLASS = 'work-report-manager-menu-open'
let openMenuCount = 0

function setBodyMenuOpen(isOpen) {
  if (isOpen) {
    openMenuCount += 1
    document.body.classList.add(BODY_MENU_OPEN_CLASS)
    return
  }
  openMenuCount = Math.max(0, openMenuCount - 1)
  if (openMenuCount === 0) {
    document.body.classList.remove(BODY_MENU_OPEN_CLASS)
  }
}

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 문자열(CSV) 또는 배열 → 담당자 배열 */
export function parseManagerMultiSelectValue(value) {
  if (Array.isArray(value)) {
    return value.map((name) => safeString(name).trim()).filter(Boolean)
  }
  return safeString(value)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

/** 담당자 배열 → API·DB용 CSV (옵션 순서 유지) */
export function serializeManagerMultiSelectValue(
  assignees,
  optionList = WORK_REPORT_MANAGER_OPTIONS
) {
  const selected = new Set(parseManagerMultiSelectValue(assignees))
  return optionList.filter((name) => selected.has(name)).join(', ')
}

export function toggleManagerMultiSelectCsv(currentValue, managerName, optionList = WORK_REPORT_MANAGER_OPTIONS) {
  const parts = parseManagerMultiSelectValue(currentValue)
  const set = new Set(parts)
  if (set.has(managerName)) set.delete(managerName)
  else set.add(managerName)
  return optionList.filter((option) => set.has(option)).join(', ')
}

export function WorkReportExternalManagerMultiSelect({ value, onChange, options = WORK_REPORT_MANAGER_OPTIONS }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selected = useMemo(() => parseManagerMultiSelectValue(value), [value])

  const handleToggleOption = (option) => {
    onChange(toggleManagerMultiSelectCsv(value, option, options))
  }

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    setBodyMenuOpen(true)
    return () => setBodyMenuOpen(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => {
      const target = e.target
      if (rootRef.current?.contains(target)) return
      closeMenu()
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open, closeMenu])

  return (
    <div
      className={`work-report-external-manager-multi relative${open ? ' is-open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="work-report-external-manager-multi-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="work-report-external-manager-multi-value">
          {selected.length ? (
            selected.map((name) => (
              <span key={name} className="work-report-external-manager-multi-chip">
                {name}
              </span>
            ))
          ) : (
            <span className="work-report-external-manager-multi-placeholder">담당자 선택</span>
          )}
        </span>
        <span className="work-report-external-manager-multi-chevron" aria-hidden>
          ▼
        </span>
      </button>
      {open ? (
        <div
          className="work-report-external-manager-multi-menu"
          role="listbox"
          aria-multiselectable="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map((option) => {
            const isOn = selected.includes(option)
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={isOn}
                className={`work-report-external-manager-multi-item${isOn ? ' is-selected' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleToggleOption(option)}
              >
                <span className="work-report-external-manager-multi-tick" aria-hidden>
                  {isOn ? '✓' : ''}
                </span>
                {option}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
