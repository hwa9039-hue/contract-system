/**
 * 계약현황 표 — td 내부를 꽉 채우는 flex 래퍼로 세로 중앙 정렬
 * @param {'left' | 'center' | 'right'} align
 */
export function ContractTableCellShell({ children, align = 'left', multiline = false, className = '' }) {
  const justifyClass =
    align === 'right'
      ? 'contract-table-cell-shell--right justify-end text-right'
      : align === 'center'
        ? 'contract-table-cell-shell--center justify-center text-center'
        : 'justify-start text-left'

  return (
    <div
      className={[
        'contract-table-cell-shell',
        'flex',
        'items-center',
        'h-full',
        'min-h-[3rem]',
        'w-full',
        'box-border',
        'py-2',
        'px-3',
        justifyClass,
        multiline ? 'contract-table-cell-shell--multiline' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

export function ContractTableHeaderShell({ children, align = 'center', className = '' }) {
  const justifyClass =
    align === 'right'
      ? 'justify-end'
      : align === 'left'
        ? 'justify-start'
        : 'justify-center'

  return (
    <div
      className={[
        'contract-table-header-shell',
        'flex',
        'items-center',
        'h-full',
        'min-h-[2.75rem]',
        'w-full',
        'box-border',
        'py-2',
        'px-2',
        justifyClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

/** 계약현황 본문 td — 패딩은 셸에서만 (대칭 py) */
export const CONTRACT_TABLE_DATA_TD_CLASS = 'contract-table-data-cell p-0 align-middle'

/** 계약현황 헤더 th */
export const CONTRACT_TABLE_HEADER_TH_CLASS = 'contract-table-header-cell p-0 align-middle'
