import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import LoginPage from './LoginPage.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { enforceAppVersion } from './appVersion.js'
import { isPublicSharePath } from './publicShare/publicSharePaths.js'
import { bootstrapCmsApiProbe } from './cmsApiProbe.js'
import { installProductionGuard } from './productionGuard.js'
import { Watermark } from './Watermark.jsx'

const LOGIN_PATH = '/login'

function AppRoot() {
  const { isAuthenticated, authHydrated, accessGranted } = useAuth()

  useEffect(() => {
    if (!authHydrated) return
    if (!isAuthenticated) {
      if (window.location.pathname !== LOGIN_PATH) {
        window.history.replaceState(null, '', LOGIN_PATH)
      }
      return
    }
    if (!accessGranted) return
    if (window.location.pathname === LOGIN_PATH) {
      window.history.replaceState(null, '', '/')
    }
  }, [authHydrated, isAuthenticated, accessGranted])

  if (!authHydrated) return null
  if (!isAuthenticated) return <LoginPage />
  return <App />
}

/** 관리자 시스템 진입점 (로그인·워터마크·보안 가드 포함) */
export function mountAdminApp(rootElement) {
  // 공유 주소는 로그인·버전 검사 없이 설치사례만 연다.
  if (isPublicSharePath(window.location.pathname)) {
    import('./publicShare/mountPublicShare.jsx').then(({ mountPublicShare }) => {
      mountPublicShare(rootElement)
    })
    return
  }

  // 버전이 다르면 저장소를 비우고 /login 으로 보낸다. 세션 복원(AuthProvider)보다 먼저 실행해야 한다.
  if (enforceAppVersion()) return

  bootstrapCmsApiProbe()
  installProductionGuard()

  createRoot(rootElement).render(
    <StrictMode>
      <AuthProvider>
        <Watermark />
        <AppRoot />
      </AuthProvider>
    </StrictMode>,
  )
}
