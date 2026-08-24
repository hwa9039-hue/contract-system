import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { readRememberMePreference } from './authSession.js'
import { purgeSavedAdminPassword } from './loginCredentials.js'
import './LoginPage.css'

const LOGIN_PAGE_ACTIVE_CLASS = 'login-page-active'

export default function LoginPage() {
  const { login, sessionExpiredNotice, clearSessionExpiredNotice } = useAuth()
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => readRememberMePreference())
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!sessionExpiredNotice) return undefined
    const timer = window.setTimeout(() => clearSessionExpiredNotice(), 8000)
    return () => window.clearTimeout(timer)
  }, [sessionExpiredNotice, clearSessionExpiredNotice])

  useEffect(() => {
    purgeSavedAdminPassword()
    document.documentElement.classList.add(LOGIN_PAGE_ACTIVE_CLASS)
    document.body.classList.add(LOGIN_PAGE_ACTIVE_CLASS)
    return () => {
      document.documentElement.classList.remove(LOGIN_PAGE_ACTIVE_CLASS)
      document.body.classList.remove(LOGIN_PAGE_ACTIVE_CLASS)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(password, rememberMe)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error || '로그인에 실패했습니다.')
    }
  }

  return (
    <div className="login-page">
      {sessionExpiredNotice ? (
        <div className="login-page-session-toast" role="status">
          {sessionExpiredNotice}
        </div>
      ) : null}
      <div className="login-page-card">
        <div className="login-page-brand">
          <img className="login-page-logo" src="/logo.png" alt="스마트DI" />
          <h1 className="login-page-title">스마트DI사업부 통합관리 시스템</h1>
          <p className="login-page-subtitle">본인 계정으로 로그인하세요.</p>
        </div>

        <form className="login-page-form" onSubmit={handleSubmit} autoComplete="off" method="post" action="/login">
          <input
            id="login-password"
            name="password"
            type="password"
            className="login-page-input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="계정을 입력하세요"
            aria-label="계정을 입력하세요"
            autoComplete="current-password"
            autoFocus
          />

          <label className="login-page-remember">
            <input
              type="checkbox"
              className="login-page-remember-input"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span className="login-page-remember-box" aria-hidden="true" />
            <span className="login-page-remember-label">자동 로그인 (30일)</span>
          </label>

          {error ? <div className="login-page-error">{error}</div> : null}

          <button type="submit" className="login-page-submit primary-btn" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
