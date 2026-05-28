import { useCallback, useEffect, useRef, useState } from 'react'

const WIDTH_CLASS_DEFAULTS = {
  'discovery-w-12': 48,
  'discovery-w-24': 96,
  'discovery-w-32': 128,
  'discovery-w-40': 160,
  'discovery-w-p12': 200,
  'discovery-w-p20': 240,
  'discovery-w-p35': 320,
}

const MIN_COLUMN_WIDTH = 48
const MAX_COLUMN_WIDTH = 720

export function getDefaultColumnWidth(column) {
  if (!column) return 120
  if (column.width != null && Number.isFinite(Number(column.width))) {
    return Number(column.width)
  }
  const widthClass = safeString(column.widthClass)
  if (widthClass) {
    for (const [token, width] of Object.entries(WIDTH_CLASS_DEFAULTS)) {
      if (widthClass.includes(token)) return width
    }
  }
  return 120
}

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function loadStoredWidths(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function useTableColumnResize(tableId, columns) {
  const storageKey = `cms_table_col_widths_${tableId}`
  const [widths, setWidths] = useState(() => loadStoredWidths(storageKey))
  const dragRef = useRef(null)

  useEffect(() => {
    const onMouseMove = (event) => {
      const drag = dragRef.current
      if (!drag) return
      const delta = event.clientX - drag.startX
      const next = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, drag.startWidth + delta))
      setWidths((prev) => ({ ...prev, [drag.columnKey]: next }))
    }

    const onMouseUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setWidths((prev) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(prev))
        } catch {
          /* ignore quota */
        }
        return prev
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [storageKey])

  const getColumnWidth = useCallback(
    (column) => {
      if (!column?.key) return getDefaultColumnWidth(column)
      const stored = widths[column.key]
      if (stored != null && Number.isFinite(Number(stored))) return Number(stored)
      return getDefaultColumnWidth(column)
    },
    [widths]
  )

  const getWidthStyle = useCallback(
    (column) => {
      const width = getColumnWidth(column)
      return {
        width,
        minWidth: width,
        maxWidth: width,
      }
    },
    [getColumnWidth]
  )

  const startResize = useCallback(
    (columnKey, event) => {
      event.preventDefault()
      event.stopPropagation()
      const column = columns.find((col) => col.key === columnKey)
      if (!column) return
      dragRef.current = {
        columnKey,
        startX: event.clientX,
        startWidth: getColumnWidth(column),
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [columns, getColumnWidth]
  )

  return {
    getColumnWidth,
    getWidthStyle,
    startResize,
  }
}

export function getTableAlignClass(align) {
  if (align === 'right') return 'th-align-right'
  if (align === 'left') return 'th-align-left'
  return 'th-align-center'
}
