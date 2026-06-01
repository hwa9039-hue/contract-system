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
  normalizeSelection = normalizeContractColumnFilterSelection,
}) {
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const wasOpenRef = useRef(false)
  const [draft, setDraft] = useState(() => (Array.isArray(selected) ? [...selected] : []))
  const draftRef = useRef(draft)
  const [menuPosition, setMenuPosition] = useState(null)
  const isActive = Array.isArray(selected) && selected.length > 0

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current
    wasOpenRef.current = isOpen
    if (!justOpened) return
    const initialDraft = Array.isArray(selected) ? [...selected] : []
    setDraft(initialDraft)
    draftRef.current = initialDraft
  }, [isOpen, selected])

  const updateMenuPosition = useCallback(() => {
    const trigger = rootRef.current
    if (!trigger) return null
    const rect = trigger.getBoundingClientRect()
    return {
      top: rect.bottom + 8,
      left: rect.left,
    }
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null)
      return
    }
    setMenuPosition(updateMenuPosition())
    const onReposition = () => setMenuPosition(updateMenuPosition())
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [isOpen, options.length, updateMenuPosition])

  const applyAndClose = useCallback(
    (nextDraft) => {
      const draftValues = Array.isArray(nextDraft) ? [...nextDraft] : []
      const normalized = normalizeSelection(draftValues, options)
      onApply(columnKey, normalized)
      onOpenChange(null)
    },
    [columnKey, normalizeSelection, onApply, onOpenChange, options]
  )

  const handleFilterClick = useCallback(
    (e) => {
      e.stopPropagation()
      onOpenChange(isOpen ? null : columnKey)
    },
    [columnKey, isOpen, onOpenChange]
  )

  useEffect(() => {
    if (!isOpen) return undefined
    const onDocDown = (e) => {
      const target = e.target
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      applyAndClose(draftRef.current)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [applyAndClose, isOpen])

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

  const filterMenu =
    isOpen && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className="contract-column-filter-menu contract-column-filter-menu--portal"
            role="dialog"
            aria-label="열 필터"
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              zIndex: 3000,
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
                onClick={() => applyAndClose(draftRef.current)}
              >
                적용
              </button>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div className={`contract-column-filter${isOpen ? ' is-open' : ''}`}>
      <button
        ref={rootRef}
        type="button"
        className={`contract-column-filter-trigger${isActive ? ' is-active' : ''}`}
        aria-label="열 필터"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={handleFilterClick}
      >
        <Filter size={13} strokeWidth={2.25} aria-hidden />
      </button>
      {filterMenu}
    </div>
  )
}
