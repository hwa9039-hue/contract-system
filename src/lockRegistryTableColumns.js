/**
 * 연도 아코디언이 행을 걷어내도 열 너비가 다시 계산되지 않도록,
 * 데이터 행이 보이는 동안 헤더 칸의 실제 폭을 col 에 고정한다.
 * 한 번 고정한 뒤에는 행이 사라지거나 다시 나타나도 같은 폭을 유지한다.
 */
export function lockRegistryTableColumns(root = document) {
  const tables = root.querySelectorAll('table.excel-table.registry-table')
  tables.forEach((table) => {
    if (!table.querySelector('tbody tr.contract-year-row')) return

    const cols = table.querySelectorAll(':scope > colgroup > col')
    const headerCells = table.querySelectorAll(':scope > thead > tr:first-child > th')
    if (!cols.length || cols.length !== headerCells.length) return

    const lockedCount = Number(table.getAttribute('data-cols-locked') || 0)
    const missingLock = Array.from(cols).some((col, index) => {
      const cell = headerCells[index]
      if (typeof cell.className === 'string' && cell.className.includes('sticky')) return false
      return !col.style.getPropertyValue('--locked-col-width')
    })
    if (lockedCount === cols.length && !missingLock) return

    const dataRow = table.querySelector(
      ':scope > tbody > tr:not(.contract-year-row):not(.contract-category-group-row)'
    )
    if (!dataRow) return

    let measured = true
    headerCells.forEach((cell, index) => {
      const width = cell.offsetWidth
      if (!width) {
        measured = false
        return
      }
      // 틀고정 열은 CSS 폭이 left 좌표와 묶여 있으므로 측정값으로 덮지 않는다.
      if (typeof cell.className === 'string' && cell.className.includes('sticky')) {
        cols[index].style.removeProperty('--locked-col-width')
        return
      }
      cols[index].style.setProperty('--locked-col-width', `${width}px`)
    })
    if (measured) table.setAttribute('data-cols-locked', String(cols.length))
  })
}
