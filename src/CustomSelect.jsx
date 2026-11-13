import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { computeFixedPortalPosition, fixedPortalStyle } from './portalMenuPosition.js'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 문자열 배열 또는 { value, label, disabled? } → 정규화 */
export function normalizeCustomSelectOptions(options = []) {
  return (Array.isArray(options) ? options : []).map((opt, index) => {
    if (opt && typeof opt === 'object' && !Array.isArray(opt)) {
      const value = safeString(opt.value)
      return {
        value,
        label: safeString(opt.label ?? opt.value),
        disabled: Boolean(opt.disabled),
        key: safeString(opt.key || `${value || 'empty'}-${index}`),
      }
    }
    const value = safeString(opt)
    return { value, label: value, disabled: false, key: `${value || 'empty'}-${index}` }
  })
}

/**
 * 브라우저 기본 select 대신 div/ul/li + Portal 목록을 쓰는 커스텀 Select.
 * onChange(nextValue: string) — native event 가 아니라 값만 전달한다.
 */
export function CustomSelect({
  value = '',
  onChange,
  options = [],
  placeholder = '선택',
  className = '',
  id,
  disabled = false,
  'aria-label': ariaLabel,
  name,
}) {
  const reactId = useId()
  const listboxId = `${reactId}-listbox`
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const items = useMemo(() => normalizeCustomSelectOptions(options), [options])
  const currentValue = safeString(value)
  const selected = items.find((item) => item.value === currentValue)
  const displayLabel = selected ? selected.label : placeholder
  const isPlaceholder = !selected

  const closeMenu = useCallback(() => setOpen(false), [])

  const updateMenuPosition = useCallback(() => {
    setMenuPosition(
      computeFixedPortalPosition(triggerRef.current, {
        gap: 6,
        minWidth: 0,
        maxHeight: 280,
        preferBelowMinSpace: 120,
      }),
    )
  }, [])

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
  }, [open, items.length, updateMenuPosition])

  useEffect(() => {
    if (!open) return undefined
    const onDocDown = (event) => {
      const target = event.target
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeMenu])

  useEffect(() => {
    if (disabled && open) closeMenu()
  }, [disabled, open, closeMenu])

  const handleSelect = (item) => {
    if (item.disabled) return
    if (typeof onChange === 'function') onChange(item.value)
    closeMenu()
    triggerRef.current?.focus()
  }

  const menuPortal =
    open && menuPosition
      ? createPortal(
          <ul
            ref={menuRef}
            id={listboxId}
            className="cms-custom-select-menu"
            role="listbox"
            aria-label={ariaLabel || placeholder}
            style={fixedPortalStyle(menuPosition, { zIndex: 12000 })}
            onMouseDown={(event) => event.preventDefault()}
          >
            {items.length === 0 ? (
              <li className="cms-custom-select-option is-empty" role="presentation">
                선택 가능한 항목이 없습니다
              </li>
            ) : (
              items.map((item) => {
                const isSelected = item.value === currentValue
                return (
                  <li
                    key={item.key}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={item.disabled || undefined}
                    className={`cms-custom-select-option${isSelected ? ' is-selected' : ''}${
                      item.disabled ? ' is-disabled' : ''
                    }`}
                    onClick={() => handleSelect(item)}
                  >
                    {item.label}
                  </li>
                )
              })
            )}
          </ul>,
          document.body,
        )
      : null

  const rootClass = [
    'cms-custom-select',
    open ? 'is-open' : '',
    disabled ? 'is-disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass} ref={rootRef} data-name={name || undefined}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="cms-custom-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel || placeholder}
        onClick={() => {
          if (disabled) return
          setOpen((prev) => !prev)
        }}
      >
        <span
          className={`cms-custom-select-value${isPlaceholder ? ' is-placeholder' : ''}`}
        >
          {displayLabel}
        </span>
        <span className="cms-custom-select-chevron" aria-hidden="true" />
      </button>
      {menuPortal}
    </div>
  )
}

export default CustomSelect
