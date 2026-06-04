/** 단가관리 · 사업관리 — 공통 페이지/테이블 레이아웃 클래스 */

export const UNIT_PRICE_PAGE_ROOT = 'unit-price-management h-full min-h-0 w-full'

export const UNIT_PRICE_TABLE_PANEL =
  'contract-table-panel unit-price-table-panel flex flex-col flex-1 min-h-0 w-full'

export const UNIT_PRICE_PAGE_STACK = 'unit-price-page-stack w-full'

export const UNIT_PRICE_TOOLBAR =
  'table-toolbar contract-toolbar-simple unit-price-toolbar-search w-full'

export const UNIT_PRICE_SEARCH_INPUT = 'table-search-input w-full'

export const UNIT_PRICE_TABLE_WRAP_BASE =
  'table-wrap contracts-only-scroll unit-price-table-scroll w-full'

export const UNIT_PRICE_TABLE_CLASS =
  'contract-table excel-table registry-table ledger-table-ui contracts-fixed-table unit-price-table'

export const UNIT_PRICE_TABLE_PROJECT_MODIFIER = 'unit-price-table--project-mgmt'

export function unitPriceTableWrapClass({ refetching = false, tableBusy = false } = {}) {
  return `${UNIT_PRICE_TABLE_WRAP_BASE}${
    refetching || tableBusy ? ' unit-price-table-wrap--refetching' : ''
  }`
}

export function getUnitPriceColStyle(column) {
  if (column?.flexGrow) {
    return { minWidth: column.width }
  }
  return { width: column.width, minWidth: column.width }
}
