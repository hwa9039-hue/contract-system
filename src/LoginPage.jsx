import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { readRememberMePreference, readSavedLoginPassword } from './authSession.js'
import {
  loadStoredLoginPassword,
  LOGIN_CREDENTIAL_IDS,
  purgeSavedAdminPassword,
  saveLoginPassword,
} from './loginCredentials.js'
import './LoginPage.css'

const LOGIN_PAGE_ACTIVE_CLASS = 'login-page-active'

export default function LoginPage() {
  const { login } = useAuth()
  const [role, setRole] = useState('user')
  const [password, setPassword] = useState(() => readSavedLoginPassword('user'))
  const [rememberMe, setRememberMe] = useState(() => readRememberMePreference())
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isAdmin = role === 'admin'

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
    if (isAdmin) {
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
  }, [role, isAdmin])

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
    if (!isAdmin) {
      await saveLoginPassword('user', result.password || password, rememberMe)
    } else {
      purgeSavedAdminPassword()
    }
  }

  const switchRole = (nextRole) => {
    setRole(nextRole)
    setPassword(nextRole === 'user' ? readSavedLoginPassword('user') : '')
    setError('')
  }

  const credentialId = LOGIN_CREDENTIAL_IDS[role]

  return (
    <div className="login-page">
      <div className="login-page-card">
        <div className="login-page-brand">
          <img className="login-page-logo" src="/logo.png" alt="스마트DI" />
          <h1 className="login-page-title">스마트DI사업부 통합관리 시스템</h1>
          <p className="login-page-subtitle">공용 비밀번호로 로그인하세요.</p>
        </div>

        <div className="login-role-tabs" role="tablist" aria-label="로그인 권한">
          <button
            type="button"
            role="tab"
            aria-selected={role === 'user'}
            className={`login-role-tab${role === 'user' ? ' login-role-tab--active' : ''}`}
            onClick={() => switchRole('user')}
          >
            사용자
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isAdmin}
            className={`login-role-tab${isAdmin ? ' login-role-tab--active' : ''}`}
            onClick={() => switchRole('admin')}
          >
            관리자
          </button>
        </div>

        <form
          key={`login-form-${role}`}
          className="login-page-form"
          onSubmit={handleSubmit}
          autoComplete={isAdmin ? 'off' : 'on'}
          method="post"
          action="/login"
        >
          {!isAdmin ? (
            <>
              <label className="login-page-label" htmlFor="login-username-user">
                로그인 구분
              </label>
              <input
                id="login-username-user"
                type="text"
                name="username"
                className="login-page-input login-page-input--readonly"
                value={credentialId}
                readOnly
                autoComplete="username"
              />
            </>
          ) : null}
          <label className="login-page-label" htmlFor={`login-password-${role}`}>
            {isAdmin ? '관리자 비밀번호' : '공용 비밀번호'}
          </label>
          <input
            id={`login-password-${role}`}
            name={isAdmin ? 'admin-password' : 'password'}
            type="password"
            className="login-page-input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="비밀번호를 입력하세요"
            autoComplete={isAdmin ? 'new-password' : 'current-password'}
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
              {isAdmin ? '자동 로그인 (30일)' : '자동 로그인 · 비밀번호 저장 (30일)'}
            </span>
          </label>

          {error ? <div className="login-page-error">{error}</div> : null}

          <button type="submit" className="login-page-submit primary-btn" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <div className="login-page-permissions">
          <div className="login-page-permissions-heading">💡 로그인 권한 안내</div>

          <div className="login-page-permissions-role">관리자</div>
          <div className="login-page-permissions-item">- 모든 메뉴 편집 가능</div>

          <div className="login-page-permissions-role">일반 사용자</div>
          <div className="login-page-permissions-item login-page-permissions-item--single-line">
            - 주간업무보고서, 영업관리대장, 건축정보, 사업검색이력, 문서수발신대장 편집 가능
          </div>

          <div className="login-page-permissions-footnote">
            * 그 외 메뉴(계약현황, 설치사례, 게시판)는 조회(뷰어)만 가능
          </div>
        </div>
      </div>
    </div>
  )
}
