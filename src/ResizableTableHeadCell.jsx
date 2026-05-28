import { getTableAlignClass } from './useTableColumnResize.js'

export function ResizableTableHeadCell({
  label,
  className = '',
  alignClass = '',
  style,
  onResizeStart,
  children,
}) {
  return (
    <th
      className={`table-th-resizable ${className} ${alignClass}`.trim()}
      style={style}
    >
      <span className="table-th-label">{children ?? label}</span>
      <div
        className="table-col-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={`${label} 열 너비 조절`}
        onMouseDown={onResizeStart}
        onClick={(event) => event.stopPropagation()}
      />
    </th>
  )
}

export function RegistryResizableHeaderCells({
  columns,
  columnResize,
  getExtraThClassName,
  getAlignClass,
}) {
  if (!columns?.length || !columnResize) return null

  return columns.map((column) => (
    <ResizableTableHeadCell
      key={column.key}
      label={column.label}
      className={getExtraThClassName?.(column) ?? ''}
      alignClass={getAlignClass?.(column) ?? getTableAlignClass(column.align)}
      style={columnResize.getWidthStyle(column)}
      onResizeStart={(event) => columnResize.startResize(column.key, event)}
    />
  ))
}
