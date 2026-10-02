import { sendAuditLog } from './utils/logger.js'

const SECURITY_ALERT_MESSAGE = '🚨 보안 정책: 비정상적인 접근이 감지되었습니다.'
const CAPTURE_ALERT_MESSAGE = '🚨 보안 정책: 화면 캡처 시도가 감지되었습니다.'

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

function isMetaKey(event) {
  const key = String(event.key || '')
  const code = String(event.code || '')
  return key === 'Meta' || key === 'OS' || code === 'MetaLeft' || code === 'MetaRight'
}

/**
 * 우클릭·개발자 도구 단축키를 막고 경고를 띄운다.
 * 로컬 확인을 위해 개발 서버에서도 동작한다.
 */
export function installProductionGuard() {
  window.__cmsProductionGuardCleanup?.()
  document.getElementById('cms-screen-shield')?.remove()

  let warningOpen = false
  let lastCaptureAt = 0
  let shiftHeld = false
  let metaHeld = false
  let captureChordAt = 0

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

  const reportCapture = () => {
    const now = Date.now()
    if (warningOpen || now - lastCaptureAt < 1500) return
    lastCaptureAt = now
    sendAuditLog('SECURITY_VIOLATION', '화면 캡처 시도 감지')
    warningOpen = true
    window.alert(CAPTURE_ALERT_MESSAGE)
    warningOpen = false
  }

  const warnCapture = (event) => {
    if (!isCaptureShortcut(event)) return
    event.preventDefault()
    reportCapture()
  }

  const trackCaptureChord = (event) => {
    const down = event.type === 'keydown'
    if (event.key === 'Shift') shiftHeld = down
    if (isMetaKey(event)) metaHeld = down
    if (shiftHeld && metaHeld) captureChordAt = Date.now()
  }

  const onWindowBlur = () => {
    if (Date.now() - captureChordAt > 800) return
    captureChordAt = 0
    reportCapture()
  }

  window.addEventListener('contextmenu', blockAndWarn)
  window.addEventListener('keydown', blockShortcut, true)
  document.addEventListener('keydown', trackCaptureChord, true)
  document.addEventListener('keyup', trackCaptureChord, true)
  document.addEventListener('keydown', warnCapture, true)
  document.addEventListener('keyup', warnCapture, true)
  window.addEventListener('blur', onWindowBlur)

  window.__cmsProductionGuardCleanup = () => {
    window.removeEventListener('contextmenu', blockAndWarn)
    window.removeEventListener('keydown', blockShortcut, true)
    document.removeEventListener('keydown', trackCaptureChord, true)
    document.removeEventListener('keyup', trackCaptureChord, true)
    document.removeEventListener('keydown', warnCapture, true)
    document.removeEventListener('keyup', warnCapture, true)
    window.removeEventListener('blur', onWindowBlur)
    window.__cmsProductionGuardCleanup = null
  }
}
