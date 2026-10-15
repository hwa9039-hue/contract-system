/**
 * 캘린더 · 계약현황 D-Day · 대시보드 다가오는 일정이 같이 쓰는 상태 색.
 * App.css 는 var(--status-*) 로 그리고, 이 값이 그 변수를 채운다.
 */
export const SCHEDULE_STATUS_THEME = {
  contract: { label: '계약', bg: '#fef9c3', fg: '#713f12', border: '#eab308', solid: '#eab308', pulse: '#fef08a' },
  due: { label: '준공', bg: '#dbeafe', fg: '#1e40af', border: '#2563eb', solid: '#2563eb', pulse: '#93c5fd' },
  manual: { label: '기타', bg: '#dcfce7', fg: '#14532d', border: '#22c55e', solid: '#22c55e', pulse: '#bbf7d0' },
  imminent: { label: '임박', bg: '#fee2e2', fg: '#b91c1c', border: '#ef4444', solid: '#dc2626', pulse: '#fca5a5' },
  delayed: { label: '지연', bg: '#f3e8ff', fg: '#6b21a8', border: '#a855f7', solid: '#7c3aed', pulse: '#d8b4fe' },
}

const CSS_VARS = {
  '--status-contract-bg': SCHEDULE_STATUS_THEME.contract.bg,
  '--status-contract-fg': SCHEDULE_STATUS_THEME.contract.fg,
  '--status-contract-border': SCHEDULE_STATUS_THEME.contract.border,
  '--status-contract-solid': SCHEDULE_STATUS_THEME.contract.solid,
  '--status-contract-pulse': SCHEDULE_STATUS_THEME.contract.pulse,
  '--status-due-bg': SCHEDULE_STATUS_THEME.due.bg,
  '--status-due-fg': SCHEDULE_STATUS_THEME.due.fg,
  '--status-due-border': SCHEDULE_STATUS_THEME.due.border,
  '--status-due-solid': SCHEDULE_STATUS_THEME.due.solid,
  '--status-due-pulse': SCHEDULE_STATUS_THEME.due.pulse,
  '--status-manual-bg': SCHEDULE_STATUS_THEME.manual.bg,
  '--status-manual-fg': SCHEDULE_STATUS_THEME.manual.fg,
  '--status-manual-border': SCHEDULE_STATUS_THEME.manual.border,
  '--status-manual-solid': SCHEDULE_STATUS_THEME.manual.solid,
  '--status-manual-pulse': SCHEDULE_STATUS_THEME.manual.pulse,
  '--status-imminent-bg': SCHEDULE_STATUS_THEME.imminent.bg,
  '--status-imminent-fg': SCHEDULE_STATUS_THEME.imminent.fg,
  '--status-imminent-border': SCHEDULE_STATUS_THEME.imminent.border,
  '--status-imminent-solid': SCHEDULE_STATUS_THEME.imminent.solid,
  '--status-imminent-pulse': SCHEDULE_STATUS_THEME.imminent.pulse,
  '--status-delayed-bg': SCHEDULE_STATUS_THEME.delayed.bg,
  '--status-delayed-fg': SCHEDULE_STATUS_THEME.delayed.fg,
  '--status-delayed-border': SCHEDULE_STATUS_THEME.delayed.border,
  '--status-delayed-solid': SCHEDULE_STATUS_THEME.delayed.solid,
  '--status-delayed-pulse': SCHEDULE_STATUS_THEME.delayed.pulse,
}

export function applyScheduleStatusTheme() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  Object.entries(CSS_VARS).forEach(([name, value]) => {
    root.style.setProperty(name, value)
  })
}

/** 계약 모바일 카드 뱃지 톤. 준공지연=보라, 준공임박=빨강, 준공진행=파랑. */
export function scheduleStatusMobileTone(label) {
  const text = String(label || '').trim()
  if (text === '준공지연') return 'purple'
  if (text === '준공임박') return 'red'
  if (text === '준공진행' || text === '준공') return 'blue'
  return ''
}
