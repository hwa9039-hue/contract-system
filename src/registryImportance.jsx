/** 상태값 → 중요도 색상 (영업관리대장·사업검색이력 공통) */

const IMPORTANCE_RED_STATUSES = new Set(['확인필요', '보류'])
const IMPORTANCE_YELLOW_STATUSES = new Set(['대기', '대응중'])
const IMPORTANCE_GREEN_STATUSES = new Set(['발주계획', '사전규격', '입찰공고', '정보공개'])
const IMPORTANCE_GRAY_STATUSES = new Set(['계약', '마감', '완료'])

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function normalizeStatusForImportance(status) {
  const trimmed = safeString(status).trim()
  if (!trimmed) return ''
  return trimmed === '완료' ? '마감' : trimmed
}

/**
 * @param {string} status
 * @returns {{ tone: 'red'|'yellow'|'green'|'gray'|'none', label: string, badgeClass: string, dotClass: string, textClass: string }}
 */
const IMPORTANCE_STYLE_FALLBACK = {
  tone: 'gray',
  label: '기타',
  badgeClass: 'registry-importance-badge registry-importance-badge--gray',
  dotClass: 'registry-importance-dot',
  textClass: 'registry-importance-label registry-importance-label--gray',
}

export function getImportanceStyle(status) {
  const normalized = normalizeStatusForImportance(status)

  if (!normalized) {
    return {
      tone: 'none',
      label: '',
      badgeClass: 'registry-importance-badge registry-importance-badge--none',
      dotClass: 'registry-importance-dot',
      textClass: 'registry-importance-label',
    }
  }

  if (IMPORTANCE_RED_STATUSES.has(normalized)) {
    return {
      tone: 'red',
      label: '긴급',
      badgeClass: 'registry-importance-badge registry-importance-badge--red',
      dotClass: 'registry-importance-dot',
      textClass: 'registry-importance-label registry-importance-label--red',
    }
  }

  if (IMPORTANCE_YELLOW_STATUSES.has(normalized)) {
    return {
      tone: 'yellow',
      label: '진행',
      badgeClass: 'registry-importance-badge registry-importance-badge--yellow',
      dotClass: 'registry-importance-dot',
      textClass: 'registry-importance-label registry-importance-label--yellow',
    }
  }

  if (IMPORTANCE_GREEN_STATUSES.has(normalized)) {
    return {
      tone: 'green',
      label: '기회',
      badgeClass: 'registry-importance-badge registry-importance-badge--green',
      dotClass: 'registry-importance-dot',
      textClass: 'registry-importance-label registry-importance-label--green',
    }
  }

  if (IMPORTANCE_GRAY_STATUSES.has(normalized)) {
    return {
      tone: 'gray',
      label: '종료',
      badgeClass: 'registry-importance-badge registry-importance-badge--gray',
      dotClass: 'registry-importance-dot',
      textClass: 'registry-importance-label registry-importance-label--gray',
    }
  }

  return { ...IMPORTANCE_STYLE_FALLBACK }
}

export function getImportanceStatusFromRow(row, column) {
  if (!column || !row) return ''
  const statusKey = column.statusKey || column.importanceStatusKey
  if (!statusKey) return ''
  return safeString(row[statusKey]).trim()
}

/** 테이블 행·컬럼 정의에서 중요도 계산용 상태 문자열 추출 */
export function resolveRegistryImportanceStatus(row, column) {
  try {
    const raw = getImportanceStatusFromRow(row, column)
    return normalizeStatusForImportance(raw)
  } catch {
    return ''
  }
}

export function RegistryImportanceBadge({ status }) {
  let style
  let title = ''

  try {
    title = normalizeStatusForImportance(status)
    style = getImportanceStyle(status)
  } catch {
    return <span className="registry-importance-empty">-</span>
  }

  if (!style?.label) {
    return <span className="registry-importance-empty">-</span>
  }

  return (
    <span className={style.badgeClass} title={title || undefined}>
      <span className={style.dotClass} aria-hidden="true" />
      <span className={style.textClass}>{style.label}</span>
    </span>
  )
}
