import { useEffect } from 'react'
import { checkRemoteVersion } from './appVersion.js'

/** 5분마다 */
export const VERSION_POLL_INTERVAL_MS = 300000

/**
 * 화면이 켜져 있는 동안 배포된 버전이 바뀌었는지 감시한다.
 *  - 5분마다 확인
 *  - 다른 탭/창에 있다가 이 탭으로 돌아올 때(visibilitychange) 즉시 확인
 */
export function useAppVersionPolling() {
  useEffect(() => {
    const timerId = window.setInterval(checkRemoteVersion, VERSION_POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkRemoteVersion()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}
