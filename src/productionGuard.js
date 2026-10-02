import { sendAuditLog } from './utils/logger.js'

const SECURITY_ALERT_MESSAGE = '🚨 보안 정책에 의해 비정상적인 접근이 감지되었습니다.'
const CAPTURE_ALERT_MESSAGE = '🚨 보안 정책: 화면 캡처 시도가 감지되어 기록되었습니다.'

function isCaptureShortcut(event) {
  const key = String(event.key || '')
  const code = String(event.code || '')
  const shift = event.shiftKey
  const meta = event.metaKey
  const ctrl = event.ctrlKey
  if (key === 'PrintScreen' || code === 'PrintScreen' || event.keyCode === 44) return true
  if ((meta || ctrl) && shift && (key === 'S' || key === 's')) return true
  if (meta && shift && (key === '3' || key === '4' || key === '5')) return true
  return false
}

function isBlockedShortcut(event) {
  const key = String(event.key || '')
  const ctrl = event.ctrlKey || event.metaKey
  const shift = event.shiftKey
  if (key === 'F12' || event.keyCode === 123) return true
  if (ctrl && shift && (key === 'I' || key === 'i' || key === 'J' || key === 'j')) return true
  if (ctrl && !shift && (key === 'U' || key === 'u')) return true
  return false
}

/**
 * 우클릭·개발자 도구 단축키를 막고 경고를 띄운다.
 * 로컬 확인을 위해 개발 서버에서도 동작한다.
 */
export function installProductionGuard() {
  let warningOpen = false
  let lastCaptureAt = 0

  const blockAndWarn = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (warningOpen) return
    sendAuditLog('SECURITY_VIOLATION', '개발자 도구(F12) 또는 우클릭 접근 시도')
    warningOpen = true
    window.alert(SECURITY_ALERT_MESSAGE)
    warningOpen = false
  }

  const blockShortcut = (event) => {
    if (!isBlockedShortcut(event)) return
    blockAndWarn(event)
  }

  const warnCapture = (event) => {
    if (!isCaptureShortcut(event)) return
    event.preventDefault()
    const now = Date.now()
    if (warningOpen || now - lastCaptureAt < 1500) return
    lastCaptureAt = now
    sendAuditLog('SECURITY_VIOLATION', '화면 캡처 시도 감지')
    warningOpen = true
    window.alert(CAPTURE_ALERT_MESSAGE)
    warningOpen = false
  }

  window.addEventListener('contextmenu', blockAndWarn)
  window.addEventListener('keydown', blockShortcut, true)
  window.addEventListener('keydown', warnCapture, true)
  window.addEventListener('keyup', warnCapture, true)
}
