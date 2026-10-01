const SECURITY_ALERT_MESSAGE =
  '🚨 보안 정책에 의해 소스코드 조회가 차단되었습니다. 비정상적인 접근이 감지되었습니다.'

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

  const blockAndWarn = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (warningOpen) return
    warningOpen = true
    window.alert(SECURITY_ALERT_MESSAGE)
    warningOpen = false
  }

  const blockShortcut = (event) => {
    if (!isBlockedShortcut(event)) return
    blockAndWarn(event)
  }

  window.addEventListener('contextmenu', blockAndWarn)
  window.addEventListener('keydown', blockShortcut, true)
}
