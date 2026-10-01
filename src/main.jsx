import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LoginPage from './LoginPage.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { bootstrapCmsApiProbe } from './cmsApiProbe.js'
import { installProductionGuard } from './productionGuard.js'
import { Watermark } from './Watermark.jsx'

bootstrapCmsApiProbe()
installProductionGuard()

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Watermark />
      <AppRoot />
    </AuthProvider>
  </StrictMode>
)
