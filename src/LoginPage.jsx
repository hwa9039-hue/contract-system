import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { readRememberMePreference, readSavedLoginPassword } from './authSession.js'
import {
  loadStoredLoginPassword,
  LOGIN_CREDENTIAL_IDS,
  purgeSavedAdminPassword,
  saveLoginPassword,
} from './loginCredentials.js'
import { ROLES } from './permissions.js'
import './LoginPage.css'

const LOGIN_PAGE_ACTIVE_CLASS = 'login-page-active'

/**
 * 로그인 탭 정의 — '일반 사용자' / '관리자' 2개만 노출합니다.
 *
 * 부서장(MANAGER)은 별도 탭이 없습니다. '일반 사용자' 탭에서 부서장 비밀번호
 * (kk2331!)를 입력하면 부서장 권한으로 로그인됩니다.
 * (역할 분기 로직: src/authSession.js 의 resolveEffectiveRole)
 */
const LOGIN_TABS = [
  { role: ROLES.USER, label: '사용자', passwordLabel: '공용 비밀번호' },
  { role: ROLES.ADMIN, label: '관리자', passwordLabel: '관리자 비밀번호' },
]

export default function LoginPage() {
  const { login, sessionExpiredNotice, clearSessionExpiredNotice } = useAuth()
  const [role, setRole] = useState(ROLES.USER)
  const [password, setPassword] = useState(() => readSavedLoginPassword('user'))
  const [rememberMe, setRememberMe] = useState(() => readRememberMePreference())
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 관리자·부서장 = "관리자급" 로그인: 비밀번호 자동저장/자동완성을 하지 않습니다.
  const isPrivilegedRole = role !== ROLES.USER
  const activeTab = LOGIN_TABS.find((tab) => tab.role === role) || LOGIN_TABS[0]

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

  useEffect(() => {
    // 관리자급(관리자·부서장) 탭에서는 저장된 비밀번호를 자동으로 채우지 않습니다.
    if (isPrivilegedRole) {
      setPassword('')
      return undefined
    }

    let cancelled = false
    const saved = readSavedLoginPassword('user')
    if (saved) {
      setPassword(saved)
      return undefined
    }

    ;(async () => {
      const storedPassword = await loadStoredLoginPassword('user')
      if (!cancelled && storedPassword) {
        setPassword(storedPassword)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [role, isPrivilegedRole])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(role, password, rememberMe)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error || '로그인에 실패했습니다.')
      return
    }
    // 비밀번호 저장은 일반 사용자만 (관리자·부서장은 저장하지 않음)
    if (role === ROLES.USER) {
      await saveLoginPassword('user', result.password || password, rememberMe)
    } else {
      purgeSavedAdminPassword()
    }
  }

  const switchRole = (nextRole) => {
    setRole(nextRole)
    setPassword(nextRole === ROLES.USER ? readSavedLoginPassword('user') : '')
    setError('')
  }

  const credentialId = LOGIN_CREDENTIAL_IDS[role]

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
          <p className="login-page-subtitle">공용 비밀번호로 로그인하세요.</p>
        </div>

        <div className="login-role-tabs" role="tablist" aria-label="로그인 권한">
          {LOGIN_TABS.map((tab) => (
            <button
              key={tab.role}
              type="button"
              role="tab"
              aria-selected={role === tab.role}
              className={`login-role-tab${role === tab.role ? ' login-role-tab--active' : ''}`}
              onClick={() => switchRole(tab.role)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form
          key={`login-form-${role}`}
          className="login-page-form"
          onSubmit={handleSubmit}
          autoComplete={isPrivilegedRole ? 'off' : 'on'}
          method="post"
          action="/login"
        >
          {!isPrivilegedRole ? (
            <input
              type="text"
              name="username"
              className="login-page-sr-only"
              value={credentialId}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="username"
            />
          ) : null}
          <label className="login-page-label" htmlFor={`login-password-${role}`}>
            {activeTab.passwordLabel}
          </label>
          <input
            id={`login-password-${role}`}
            name={isPrivilegedRole ? 'admin-password' : 'password'}
            type="password"
            className="login-page-input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="비밀번호를 입력하세요"
            autoComplete={isPrivilegedRole ? 'new-password' : 'current-password'}
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
            <span className="login-page-remember-label">
              {isPrivilegedRole ? '자동 로그인 (30일)' : '자동 로그인 · 비밀번호 저장 (30일)'}
            </span>
          </label>

          {error ? <div className="login-page-error">{error}</div> : null}

          <button type="submit" className="login-page-submit primary-btn" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <div className="login-page-permissions">
          <div className="login-page-permissions-heading">💡 로그인 권한 안내</div>

          <div className="login-page-permissions-role">관리자 &amp; 부서장</div>
          <div className="login-page-permissions-item">- 모든 메뉴 편집 가능</div>

          <div className="login-page-permissions-role">일반 사용자</div>
          <div className="login-page-permissions-item login-page-permissions-item--single-line">
            - 주간업무보고서, 영업관리대장, 건축정보, 사업검색이력, 문서수발신대장 편집 가능
          </div>

          <div className="login-page-permissions-footnote">
            * 그 외 메뉴는 조회(뷰어)만 가능
          </div>
        </div>
      </div>
    </div>
  )
}
