import { sendAuditLog } from './utils/logger.js'

const SECURITY_ALERT_MESSAGE = '🚨 보안 정책: 비정상적인 접근이 감지되었습니다.'
const CAPTURE_ALERT_MESSAGE = '🚨 보안 정책: 화면 캡처 시도가 감지되었습니다.'
const SHIELD_MESSAGE = '보안을 위해 화면이 임시 보호 처리되었습니다.'

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

function createScreenShield() {
  document.getElementById('cms-screen-shield')?.remove()
  const shield = document.createElement('div')
  shield.id = 'cms-screen-shield'
  shield.setAttribute('role', 'status')
  shield.textContent = SHIELD_MESSAGE
  Object.assign(shield.style, {
    display: 'none',
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#ffffff',
    color: '#111827',
    fontSize: '20px',
    fontWeight: '600',
    letterSpacing: '-0.01em',
  })
  document.body.appendChild(shield)
  return {
    show() {
      shield.style.display = 'flex'
    },
    hide() {
      shield.style.display = 'none'
    },
    remove() {
      shield.remove()
    },
  }
}

/**
 * 우클릭·개발자 도구 단축키를 막고 경고를 띄운다.
 * 창 포커스가 빠지면 화면 전체를 가려 외부 캡처 도구에 내용이 비치지 않게 한다.
 * 로컬 확인을 위해 개발 서버에서도 동작한다.
 */
export function installProductionGuard() {
  window.__cmsProductionGuardCleanup?.()

  let warningOpen = false
  let lastCaptureAt = 0
  let shiftHeld = false
  let metaHeld = false
  let captureChordAt = 0
  const screenShield = createScreenShield()

  const releaseShieldIfFocused = () => {
    if (document.hasFocus()) screenShield.hide()
  }

  const blockAndWarn = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (warningOpen) return
    sendAuditLog('SECURITY_VIOLATION', '개발자 도구(F12) 또는 우클릭 접근 시도')
    warningOpen = true
    window.alert(SECURITY_ALERT_MESSAGE)
    warningOpen = false
    releaseShieldIfFocused()
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
    releaseShieldIfFocused()
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
    if (!warningOpen) screenShield.show()
    if (Date.now() - captureChordAt > 800) return
    captureChordAt = 0
    reportCapture()
  }

  const onWindowFocus = () => {
    if (warningOpen) return
    screenShield.hide()
  }

  window.addEventListener('contextmenu', blockAndWarn)
  window.addEventListener('keydown', blockShortcut, true)
  document.addEventListener('keydown', trackCaptureChord, true)
  document.addEventListener('keyup', trackCaptureChord, true)
  document.addEventListener('keydown', warnCapture, true)
  document.addEventListener('keyup', warnCapture, true)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)

  if (!document.hasFocus()) screenShield.show()

  window.__cmsProductionGuardCleanup = () => {
    window.removeEventListener('contextmenu', blockAndWarn)
    window.removeEventListener('keydown', blockShortcut, true)
    document.removeEventListener('keydown', trackCaptureChord, true)
    document.removeEventListener('keyup', trackCaptureChord, true)
    document.removeEventListener('keydown', warnCapture, true)
    document.removeEventListener('keyup', warnCapture, true)
    window.removeEventListener('blur', onWindowBlur)
    window.removeEventListener('focus', onWindowFocus)
    screenShield.remove()
    window.__cmsProductionGuardCleanup = null
  }
}
