import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Filter } from 'lucide-react'
import { normalizeContractColumnFilterSelection } from './contractColumnFilter.js'

export function ContractColumnHeaderFilter({
  columnKey,
  options,
  selected,
  onApply,
  isOpen,
  onOpenChange,
}) {
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, minWidth: 0 })
  const [draft, setDraft] = useState(selected)
  const isActive = Array.isArray(selected) && selected.length > 0

  useEffect(() => {
    if (isOpen) setDraft(selected)
  }, [isOpen, selected])

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 168),
    })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return undefined
    updateMenuPosition()
    const onReposition = () => updateMenuPosition()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [isOpen, updateMenuPosition])

  const applyAndClose = useCallback(
    (nextDraft) => {
      const normalized = normalizeContractColumnFilterSelection(nextDraft, options)
      onApply(columnKey, normalized)
      onOpenChange(null)
    },
    [columnKey, onApply, onOpenChange, options]
  )

  useEffect(() => {
    if (!isOpen) return undefined
    const onDocDown = (e) => {
      const target = e.target
      if (rootRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.contract-column-filter-menu--portal')) return
      applyAndClose(draft)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [applyAndClose, draft, isOpen])

  const toggleOption = (option) => {
    setDraft((prev) => {
      const set = new Set(Array.isArray(prev) ? prev : [])
      if (set.has(option)) set.delete(option)
      else set.add(option)
      return [...set]
    })
  }

  const selectAll = () => setDraft([...options])
  const clearAll = () => setDraft([])

  const menu =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="contract-column-filter-menu contract-column-filter-menu--portal"
            role="dialog"
            aria-label="열 필터"
            style={{
              top: `${menuStyle.top}px`,
              left: `${menuStyle.left}px`,
              minWidth: `${menuStyle.minWidth}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="contract-column-filter-menu-actions">
              <button type="button" className="contract-column-filter-menu-link" onClick={selectAll}>
                전체 선택
              </button>
              <button type="button" className="contract-column-filter-menu-link" onClick={clearAll}>
                전체 해제
              </button>
            </div>
            <ul className="contract-column-filter-menu-list">
              {options.length === 0 ? (
                <li className="contract-column-filter-menu-empty">표시할 항목이 없습니다.</li>
              ) : (
                options.map((option) => {
                  const checked = draft.includes(option)
                  return (
                    <li key={option}>
                      <label className="contract-column-filter-menu-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOption(option)}
                        />
                        <span>{option}</span>
                      </label>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="contract-column-filter-menu-footer">
              <button
                type="button"
                className="contract-column-filter-menu-btn contract-column-filter-menu-btn--ghost"
                onClick={() => applyAndClose([])}
              >
                초기화
              </button>
              <button
                type="button"
                className="contract-column-filter-menu-btn contract-column-filter-menu-btn--primary"
                onClick={() => applyAndClose(draft)}
              >
                적용
              </button>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div className="contract-column-filter" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`contract-column-filter-trigger${isActive ? ' is-active' : ''}`}
        aria-label="열 필터"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation()
          onOpenChange(isOpen ? null : columnKey)
        }}
      >
        <Filter size={13} strokeWidth={2.25} aria-hidden />
      </button>
      {menu}
    </div>
  )
}
