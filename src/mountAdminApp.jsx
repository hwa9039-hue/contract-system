import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import LoginPage from './LoginPage.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
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
