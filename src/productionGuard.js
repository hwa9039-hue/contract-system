/**
 * 프로덕션에서만 우클릭·개발자 도구 단축키를 막는다.
 * `npm run dev` 는 import.meta.env.DEV 가 true 라서 이 함수가 바로 반환한다.
 * Vite 가 그 분기를 빌드 시 상수로 바꾸므로, 개발 서버에는 리스너가 등록되지 않는다.
 */
export function installProductionGuard() {
  if (import.meta.env.DEV) return

  const blockContextMenu = (event) => {
    event.preventDefault()
  }

  const blockShortcut = (event) => {
    const key = String(event.key || '')
    const ctrl = event.ctrlKey || event.metaKey
    const shift = event.shiftKey

    if (key === 'F12') {
      event.preventDefault()
      return
    }
    if (ctrl && shift && (key === 'I' || key === 'i' || key === 'J' || key === 'j')) {
      event.preventDefault()
      return
    }
    if (ctrl && !shift && (key === 'U' || key === 'u')) {
      event.preventDefault()
    }
  }

  window.addEventListener('contextmenu', blockContextMenu)
  window.addEventListener('keydown', blockShortcut, true)
}
