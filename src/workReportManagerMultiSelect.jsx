import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
export function serializeManagerMultiSelectValue(assignees) {
  const selected = new Set(parseManagerMultiSelectValue(assignees))
  return WORK_REPORT_MANAGER_OPTIONS.filter((name) => selected.has(name)).join(', ')
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
  const triggerRef = useRef(null)
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0 })
  const selected = useMemo(() => parseManagerMultiSelectValue(value), [value])

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 140),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
    const onReposition = () => updateMenuPosition()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => {
      const target = e.target
      if (rootRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.work-report-external-manager-multi-menu--portal')) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="work-report-external-manager-multi-menu work-report-external-manager-multi-menu--portal"
            role="listbox"
            aria-multiselectable="true"
            style={{
              top: `${menuStyle.top}px`,
              left: `${menuStyle.left}px`,
              width: `${menuStyle.width}px`,
            }}
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
                  onClick={() => onChange(toggleManagerMultiSelectCsv(value, option, options))}
                >
                  <span className="work-report-external-manager-multi-tick" aria-hidden>
                    {isOn ? '✓' : ''}
                  </span>
                  {option}
                </button>
              )
            })}
          </div>,
          document.body
        )
      : null

  return (
    <div className="work-report-external-manager-multi" ref={rootRef}>
      <button
        ref={triggerRef}
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
          {open ? '▲' : '▼'}
        </span>
      </button>
      {menu}
    </div>
  )
}
