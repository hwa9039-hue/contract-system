import { useEffect, useRef } from 'react'

/** 활동이 없으면 로그아웃할 때까지의 시간. 분 단위로 바꾸려면 이 값만 수정한다. */
export const IDLE_LOGOUT_MS = 30 * 60 * 1000

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'click', 'keydown', 'scroll', 'touchstart', 'wheel']
const IDLE_CHECK_MS = 15 * 1000

/**
 * 마우스·키보드·스크롤이 IDLE_LOGOUT_MS 동안 없으면 onIdle 을 한 번 호출한다.
 */
export function useIdleLogout({ enabled, onIdle }) {
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!enabled) return undefined
    let lastActivityAt = Date.now()
    let fired = false
    const markActivity = () => {
      lastActivityAt = Date.now()
    }
    ACTIVITY_EVENTS.forEach((name) => {
      window.addEventListener(name, markActivity, { passive: true })
    })
    const timer = window.setInterval(() => {
      if (fired) return
      if (Date.now() - lastActivityAt < IDLE_LOGOUT_MS) return
      fired = true
      onIdleRef.current()
    }, IDLE_CHECK_MS)
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActivity))
      window.clearInterval(timer)
    }
  }, [enabled])
}
