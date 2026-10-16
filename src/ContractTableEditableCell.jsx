import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { AutoGrowTextarea } from './AutoGrowTextarea.jsx'
import { ContractTableCellShell } from './ContractTableCellShell.jsx'
import { TABLE_INLINE_INPUT_STANDARD_CLASS } from './tableInlineInputClass.js'
import { isLongTextTableColumn } from './tableColumnLayout.js'

let editSnapshot = null
const listeners = new Set()
const activeCache = new Map()

function emitContractCellEdit() {
  listeners.forEach((listener) => listener())
}

export function subscribeContractCellEdit(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readCellActive(rowKey, columnKey) {
  const active = editSnapshot != null && editSnapshot.rowKey === rowKey && editSnapshot.key === columnKey
  const id = `${rowKey}\0${columnKey}`
  const prev = activeCache.get(id)
  if (prev === active) return prev
  activeCache.set(id, active)
  return active
}

export function setContractCellEdit(next) {
  editSnapshot = next
  emitContractCellEdit()
}

export function clearContractCellEdit() {
  if (editSnapshot == null) return
  editSnapshot = null
  emitContractCellEdit()
}

export function findAdjacentContractEditColumn(columns, index, direction) {
  const step = direction === 'prev' ? -1 : 1
  for (let i = index + step; i >= 0 && i < columns.length; i += step) {
    if (columns[i]?.key === 'processStatus') continue
    return columns[i]
  }
  return null
}

function normalizeAmountInput(value) {
  if (value == null || value === '') return ''
  return String(value).replace(/[^\d]/g, '')
}

function ContractCellEditor({ column, columns, shellAlign, isLongCell, actionsRef }) {
  const shellRef = useRef(null)

  useLayoutEffect(() => {
    const el = shellRef.current?.querySelector('input, textarea, select')
    el?.focus({ preventScroll: true })
  }, [])

  const commitValue = (raw) => {
    const value = column.key === 'amount' ? normalizeAmountInput(raw) : raw
    actionsRef.current.draftRef.current = value
    return value
  }

  const moveByTab = (event) => {
    const direction = event.shiftKey ? 'prev' : 'next'
    const index = columns.findIndex((item) => item.key === column.key)
    const nextColumn = findAdjacentContractEditColumn(columns, index, direction)
    if (!nextColumn) return
    event.preventDefault()
    actionsRef.current.tabbingRef.current = true
    commitValue(event.currentTarget.value)
    void actionsRef.current.saveEdit()
    flushSync(() => {
      actionsRef.current.moveContractCellEdit(direction)
    })
  }

  const commonProps = {
    className: `${TABLE_INLINE_INPUT_STANDARD_CLASS} min-h-[2.5rem] py-2`,
    style: { textAlign: column.align || 'left' },
    defaultValue: actionsRef.current.draftRef.current ?? '',
    onChange: (event) => {
      const value = commitValue(event.target.value)
      if (event.target.value !== value) event.target.value = value
    },
    onBlur: () => {
      if (actionsRef.current.tabbingRef.current) {
        actionsRef.current.tabbingRef.current = false
        return
      }
      void actionsRef.current.saveEdit()
    },
    onClick: (event) => event.stopPropagation(),
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        actionsRef.current.cancelEdit()
        return
      }
      if (event.key === 'Tab') {
        moveByTab(event)
        return
      }
      const allowMultiline =
        column.type === 'textarea' || column.type === 'text' || isLongTextTableColumn(column)
      if (allowMultiline && event.shiftKey && event.key === 'Enter') return
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        commitValue(event.currentTarget.value)
        void actionsRef.current.saveEdit()
      }
    },
  }

  let control
  if (column.type === 'date') {
    control = <input {...commonProps} type="date" />
  } else if (column.type === 'textarea' || (column.type === 'text' && isLongTextTableColumn(column))) {
    control = (
      <AutoGrowTextarea
        {...commonProps}
        className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} registry-cell-autogrow-textarea resize-none min-h-[2.5rem] py-2`}
        rows={2}
      />
    )
  } else {
    control = <input {...commonProps} type="text" />
  }

  return (
    <div ref={shellRef} className="contents">
      <ContractTableCellShell align={shellAlign} multiline={isLongCell}>
        {control}
      </ContractTableCellShell>
    </div>
  )
}

export function ContractTableEditableCell({
  className,
  item,
  column,
  columns,
  rowSelectKey,
  canEdit,
  shellAlign,
  isLongCell,
  displayText,
  isEmpty,
  weekHighlightClass,
  weekBadge,
  actionsRef,
}) {
  const active = useSyncExternalStore(
    subscribeContractCellEdit,
    () => readCellActive(rowSelectKey, column.key),
    () => false
  )

  const open = (event) => {
    if (!canEdit) return
    event?.stopPropagation()
    actionsRef.current.startEdit(rowSelectKey, column.key, item?.[column.key], item)
  }

  return (
    <td
      className={className}
      onClick={canEdit && !active ? open : undefined}
    >
      {active ? (
        <ContractCellEditor
          column={column}
          columns={columns}
          shellAlign={shellAlign}
          isLongCell={isLongCell}
          actionsRef={actionsRef}
        />
      ) : (
        <ContractTableCellShell align={shellAlign} multiline={isLongCell}>
          <div
            className={`cell-display editable-text-cell-display editable-text-cell-display--${shellAlign}${
              isLongCell ? ' registry-cell-text-wrap' : ''
            }${isEmpty ? ' table-cell-empty-placeholder' : ''}${
              weekHighlightClass ? ` ${weekHighlightClass}` : ''
            }`}
            onClick={open}
          >
            {displayText}
            {weekBadge}
          </div>
        </ContractTableCellShell>
      )}
    </td>
  )
}
