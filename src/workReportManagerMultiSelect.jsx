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

const MENU_GAP_PX = 4

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

function applyMenuPosition(triggerEl, menuEl) {
  const rect = triggerEl.getBoundingClientRect()
  const x = Math.round(rect.left)
  const y = Math.round(rect.bottom + MENU_GAP_PX)
  const width = Math.round(rect.width)

  // transform translate + fixed(0,0): body zoom(0.8) 환경에서도 버튼과 정확히 맞춤
  menuEl.style.setProperty('position', 'fixed', 'important')
  menuEl.style.setProperty('top', '0', 'important')
  menuEl.style.setProperty('left', '0', 'important')
  menuEl.style.setProperty('width', `${width}px`, 'important')
  menuEl.style.setProperty('min-width', `${width}px`, 'important')
  menuEl.style.setProperty('right', 'auto', 'important')
  menuEl.style.setProperty('bottom', 'auto', 'important')
  menuEl.style.setProperty('margin', '0', 'important')
  menuEl.style.setProperty('transform', `translate(${x}px, ${y}px)`, 'important')
  menuEl.style.setProperty('z-index', '3000', 'important')
  menuEl.style.visibility = 'visible'
}

export function WorkReportExternalManagerMultiSelect({ value, onChange, options = WORK_REPORT_MANAGER_OPTIONS }) {
  const [open, setOpen] = useState(false)
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

  const syncMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    applyMenuPosition(trigger, menu)
  }, [])

  useLayoutEffect(() => {
    if (!open) return

    const menu = menuRef.current
    if (menu) {
      menu.style.visibility = 'hidden'
    }

    syncMenuPosition()
    const rafId = requestAnimationFrame(syncMenuPosition)

    const onResize = () => {
      syncMenuPosition()
    }

    const onScroll = (event) => {
      const target = event.target
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }

    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, options.length, selected.length, closeMenu, syncMenuPosition])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => {
      const target = e.target
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open, closeMenu])

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          className="work-report-external-manager-multi-menu work-report-external-manager-multi-menu--portal"
          role="listbox"
          aria-multiselectable="true"
          style={{ visibility: 'hidden', pointerEvents: 'auto' }}
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
    <div className="work-report-external-manager-multi relative" ref={rootRef}>
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
          ▼
        </span>
      </button>
      {menu}
    </div>
  )
}
