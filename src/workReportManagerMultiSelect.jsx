import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { computeFixedPortalPosition, fixedPortalStyle } from './portalMenuPosition.js'

/** 새로 고를 수 있는 담당자. 퇴사자는 넣지 않는다. */
export const WORK_REPORT_MANAGER_OPTIONS = [
  '전기웅',
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

/**
 * 담당자 배열 → API·DB용 CSV.
 * 선택 목록에 있는 이름은 목록 순서를 유지하고,
 * 목록에 없는 저장값(퇴사자 등)은 뒤에 그대로 붙여 지우지 않는다.
 */
export function serializeManagerMultiSelectValue(
  assignees,
  optionList = WORK_REPORT_MANAGER_OPTIONS
) {
  const selected = parseManagerMultiSelectValue(assignees)
  const selectedSet = new Set(selected)
  const optionSet = new Set(optionList)
  const known = optionList.filter((name) => selectedSet.has(name))
  const kept = selected.filter((name) => !optionSet.has(name))
  return [...known, ...kept].join(', ')
}

export function toggleManagerMultiSelectCsv(currentValue, managerName, optionList = WORK_REPORT_MANAGER_OPTIONS) {
  const parts = parseManagerMultiSelectValue(currentValue)
  const set = new Set(parts)
  if (set.has(managerName)) set.delete(managerName)
  else set.add(managerName)
  return serializeManagerMultiSelectValue([...set], optionList)
}

export function WorkReportExternalManagerMultiSelect({
  value,
  onChange,
  options = WORK_REPORT_MANAGER_OPTIONS,
  compact = false,
}) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const selected = useMemo(() => parseManagerMultiSelectValue(value), [value])

  const handleToggleOption = (option) => {
    onChange(toggleManagerMultiSelectCsv(value, option, options))
  }

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])

  const updateMenuPosition = useCallback(() => {
    setMenuPosition(
      computeFixedPortalPosition(triggerRef.current, {
        gap: 4,
        minWidth: 140,
        maxHeight: 240,
        preferBelowMinSpace: 96,
      })
    )
  }, [])

  useEffect(() => {
    if (!open) return undefined
    setBodyMenuOpen(true)
    return () => setBodyMenuOpen(false)
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return undefined
    }
    updateMenuPosition()
    const rafId = window.requestAnimationFrame(() => updateMenuPosition())
    const onReposition = () => updateMenuPosition()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, options.length, updateMenuPosition])

  useEffect(() => {
    if (!open) return undefined
    const onDocDown = (e) => {
      const target = e.target
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeMenu])

  const menuPortal =
    open && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className="work-report-external-manager-multi-menu work-report-external-manager-multi-menu--portal"
            role="listbox"
            aria-multiselectable="true"
            style={fixedPortalStyle(menuPosition, { zIndex: 10000 })}
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
          </div>,
          document.body
        )
      : null

  return (
    <div
      className={`work-report-external-manager-multi relative${open ? ' is-open' : ''}${compact ? ' is-compact' : ''}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="work-report-external-manager-multi-trigger flex items-center gap-1"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`work-report-external-manager-multi-value flex items-center gap-1${
            compact ? ' flex-nowrap' : ''
          }`}
        >
          {selected.length ? (
            compact ? (
              <>
                <span className="work-report-external-manager-multi-chip">
                  {selected[0]}
                </span>
                {selected.length > 1 ? (
                  <span
                    className="work-report-external-manager-multi-more"
                    data-tooltip={selected.join(', ')}
                    title={selected.join(', ')}
                  >
                    +{selected.length - 1}
                  </span>
                ) : null}
              </>
            ) : (
              selected.map((name) => (
                <span key={name} className="work-report-external-manager-multi-chip">
                  {name}
                </span>
              ))
            )
          ) : (
            <span className="work-report-external-manager-multi-placeholder">담당자 선택</span>
          )}
        </span>
        <span className="work-report-external-manager-multi-chevron" aria-hidden>
          ▼
        </span>
      </button>
      {menuPortal}
    </div>
  )
}
