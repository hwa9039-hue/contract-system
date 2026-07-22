import { useCallback, useMemo, useRef, useState } from 'react'

/** 일반 데이터 컬럼 — 찌그러짐 방지 최소 너비 */
const DEFAULT_MIN_COL_WIDTH = 80

/** 아이콘·체크 등 좁은 전용 컬럼 */
const NARROW_COL_MIN_WIDTHS = {
  __check: 44,
  __archive: 56,
  __record: 56,
  importance: 64,
  shareStatus: 64,
}

function resolveColMinWidth(columnKey, minWidths) {
  if (minWidths && minWidths[columnKey] != null) return Number(minWidths[columnKey])
  if (NARROW_COL_MIN_WIDTHS[columnKey] != null) return NARROW_COL_MIN_WIDTHS[columnKey]
  return DEFAULT_MIN_COL_WIDTH
}

/**
 * HTML table / colgroup 기반 독립 컬럼 너비 드래그 조절.
 * 테이블 총 너비 = 컬럼 너비 합 → 한 칸을 늘려도 옆 칸을 줄이지 않고 가로 스크롤이 생긴다.
 */
export function useResizableTableColumns(initialWidths, options = {}) {
  const minWidths = options.minWidths || {}
  const [widths, setWidths] = useState(() => {
    const next = { ...initialWidths }
    for (const key of Object.keys(next)) {
      const minW = resolveColMinWidth(key, minWidths)
      next[key] = Math.max(Number(next[key]) || minW, minW)
    }
    return next
  })
  const widthsRef = useRef(widths)
  widthsRef.current = widths
  const dragRef = useRef(null)
  const minWidthsRef = useRef(minWidths)
  minWidthsRef.current = minWidths

  const onResizeStart = useCallback((columnKey, clientX) => {
    const startWidth = widthsRef.current[columnKey]
    if (startWidth == null || Number.isNaN(Number(startWidth))) return

    dragRef.current = {
      columnKey,
      startX: clientX,
      startWidth: Number(startWidth),
      minWidth: resolveColMinWidth(columnKey, minWidthsRef.current),
    }

    const onMove = (event) => {
      const drag = dragRef.current
      if (!drag) return
      const next = Math.max(
        drag.minWidth,
        Math.round(drag.startWidth + (event.clientX - drag.startX))
      )
      setWidths((prev) =>
        prev[drag.columnKey] === next ? prev : { ...prev, [drag.columnKey]: next }
      )
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('is-column-resizing')
    }

    document.body.classList.add('is-column-resizing')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const getColStyle = useCallback((columnKey) => {
    const width = widths[columnKey]
    if (width == null) return undefined
    const minW = resolveColMinWidth(columnKey, minWidthsRef.current)
    const w = Math.max(Number(width), minW)
    // width/min/max를 동일 픽셀로 고정 → CSS 클래스 max-width에 막히지 않고 독립 리사이즈
    return { width: w, minWidth: w, maxWidth: w }
  }, [widths])

  const tableWidth = useMemo(() => {
    let sum = 0
    for (const key of Object.keys(widths)) {
      const minW = resolveColMinWidth(key, minWidths)
      sum += Math.max(Number(widths[key]) || 0, minW)
    }
    return sum
  }, [widths, minWidths])

  const tableStyle = useMemo(
    () => ({
      width: tableWidth,
      minWidth: tableWidth,
      maxWidth: 'none',
      tableLayout: 'fixed',
    }),
    [tableWidth]
  )

  return { widths, onResizeStart, getColStyle, tableWidth, tableStyle }
}
