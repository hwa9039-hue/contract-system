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

const BODY_MENU_OPEN_CLASS = 'work-report-manager-menu-open'
const MENU_MAX_HEIGHT_PX = 240
const MENU_GAP_PX = 4
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

/** body CSS zoom — fixed 포털 좌표와 getBoundingClientRect 보정용 */
function getBodyCssZoom() {
  try {
    const raw = getComputedStyle(document.body).zoom
    if (!raw || raw === 'normal') return 1
    const parsed = parseFloat(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  } catch {
    return 1
  }
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

/**
 * 트리거 바로 아래(공간 부족 시 위)에 붙는 fixed 좌표.
 * body { zoom } 환경에서는 rect를 zoom으로 나눠 CSS fixed 좌표계에 맞춘다.
 */
function computeMenuPosition(triggerEl) {
  if (!triggerEl) return null
  const rect = triggerEl.getBoundingClientRect()
  const zoom = getBodyCssZoom()
  const top = rect.top / zoom
  const bottom = rect.bottom / zoom
  const leftRaw = rect.left / zoom
  const width = rect.width / zoom
  const viewportH = window.innerHeight / zoom
  const viewportW = window.innerWidth / zoom

  const spaceBelow = viewportH - bottom - MENU_GAP_PX
  const spaceAbove = top - MENU_GAP_PX
  // 기본은 트리거 바로 아래. 아래가 거의 없을 때만 위로.
  const openUpward = spaceBelow < 96 && spaceAbove > spaceBelow

  const maxHeight = Math.max(
    96,
    Math.min(MENU_MAX_HEIGHT_PX, openUpward ? spaceAbove : Math.max(spaceBelow, 96))
  )
  const menuWidth = Math.max(width, 140)
  let left = leftRaw
  left = Math.min(left, viewportW - menuWidth - 8)
  left = Math.max(8, left)

  if (openUpward) {
    return {
      top: null,
      bottom: viewportH - top + MENU_GAP_PX,
      left,
      width: menuWidth,
      maxHeight,
      openUpward: true,
    }
  }
  return {
    top: bottom + MENU_GAP_PX,
    bottom: null,
    left,
    width: menuWidth,
    maxHeight,
    openUpward: false,
  }
}

export function WorkReportExternalManagerMultiSelect({ value, onChange, options = WORK_REPORT_MANAGER_OPTIONS }) {
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
    const next = computeMenuPosition(triggerRef.current)
    setMenuPosition(next)
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
    // 레이아웃·zoom 반영 직후 한 번 더 보정
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
            style={{
              position: 'fixed',
              top: menuPosition.openUpward ? 'auto' : `${menuPosition.top}px`,
              bottom: menuPosition.openUpward ? `${menuPosition.bottom}px` : 'auto',
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`,
              minWidth: `${menuPosition.width}px`,
              maxHeight: `${menuPosition.maxHeight}px`,
              zIndex: 10000,
            }}
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
      className={`work-report-external-manager-multi relative${open ? ' is-open' : ''}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="work-report-external-manager-multi-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
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
      {menuPortal}
    </div>
  )
}
