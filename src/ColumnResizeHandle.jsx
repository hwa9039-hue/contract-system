/** 테이블 헤더 우측 경계 — 드래그로 컬럼 너비 조절 */
export function ColumnResizeHandle({ columnKey, onResizeStart }) {
  return (
    <span
      className="column-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={`${columnKey} 열 너비 조절`}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onResizeStart(columnKey, event.clientX)
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    />
  )
}
