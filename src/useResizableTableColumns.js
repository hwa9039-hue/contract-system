import { useCallback, useRef, useState } from 'react'

const MIN_COL_WIDTH = 48

/**
 * HTML table / colgroup 기반 컬럼 너비 드래그 조절.
 * DataGrid 등 라이브러리 없이 헤더 경계선 드래그로 동작한다.
 */
export function useResizableTableColumns(initialWidths) {
  const [widths, setWidths] = useState(() => ({ ...initialWidths }))
  const widthsRef = useRef(widths)
  widthsRef.current = widths
  const dragRef = useRef(null)

  const onResizeStart = useCallback((columnKey, clientX) => {
    const startWidth = widthsRef.current[columnKey]
    if (startWidth == null || Number.isNaN(Number(startWidth))) return

    dragRef.current = {
      columnKey,
      startX: clientX,
      startWidth: Number(startWidth),
    }

    const onMove = (event) => {
      const drag = dragRef.current
      if (!drag) return
      const next = Math.max(
        MIN_COL_WIDTH,
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
    return { width, minWidth: width, maxWidth: width }
  }, [widths])

  return { widths, onResizeStart, getColStyle }
}
