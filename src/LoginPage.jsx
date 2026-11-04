import { useEffect, useState } from 'react'
import { RESTRICTED_LOGIN_MESSAGE, useAuth } from './AuthContext.jsx'
import { purgeSavedAdminPassword } from './loginCredentials.js'
import { beginKakaoLogin } from './kakaoAuth.js'
import './LoginPage.css'

const LOGIN_PAGE_ACTIVE_CLASS = 'login-page-active'

export default function LoginPage() {
  const { acceptKakaoSession, sessionExpiredNotice, clearSessionExpiredNotice } = useAuth()
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

  const handleKakaoLogin = async () => {
    setError('')
    setSubmitting(true)
    const result = await beginKakaoLogin()
    if (result.authDisabled) {
      const applied = acceptKakaoSession(result.data, false)
      setSubmitting(false)
      if (!applied.ok) setError(applied.error || '로그인에 실패했습니다.')
      return
    }
    if (!result.ok) {
      setSubmitting(false)
      setError(result.error || '카카오 로그인을 시작하지 못했습니다.')
    }
  }

  return (
    <div className="login-page">
      {error === RESTRICTED_LOGIN_MESSAGE ? (
        <div className="login-page-session-toast" role="alert">
          {error}
        </div>
      ) : sessionExpiredNotice ? (
        <div className="login-page-session-toast" role="status">
          {sessionExpiredNotice}
        </div>
      ) : null}
      <div className="login-page-card">
        <div className="login-page-brand">
          <img className="login-page-logo" src="/logo.png" alt="스마트DI" />
          <h1 className="login-page-title">스마트DI사업부 통합관리 시스템</h1>
          <p className="login-page-subtitle">카카오 계정으로 로그인하세요.</p>
        </div>

        {error ? (
          <div className="login-page-error" role="alert">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          className="login-page-kakao"
          onClick={handleKakaoLogin}
          disabled={submitting}
        >
          {submitting ? '카카오 로그인 중…' : '카카오 로그인'}
        </button>
      </div>
    </div>
  )
}
