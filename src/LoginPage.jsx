import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import './LoginPage.css'

const LOGIN_PAGE_ACTIVE_CLASS = 'login-page-active'

export default function LoginPage() {
  const { login } = useAuth()
  const [role, setRole] = useState('user')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
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
    const result = await login(role, password, rememberMe)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error || '로그인에 실패했습니다.')
    }
  }

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
            onClick={() => {
              setRole('user')
              setPassword('')
              setError('')
            }}
          >
            사용자
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={role === 'admin'}
            className={`login-role-tab${role === 'admin' ? ' login-role-tab--active' : ''}`}
            onClick={() => {
              setRole('admin')
              setPassword('')
              setError('')
            }}
          >
            관리자
          </button>
        </div>

        <form className="login-page-form" onSubmit={handleSubmit} autoComplete="on">
          {/* Chrome/Edge 비밀번호 저장: 역할별 username + password 쌍 */}
          <input
            type="text"
            name="username"
            className="login-page-sr-only"
            value={role === 'admin' ? 'contract-admin' : 'contract-user'}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="username"
          />
          <label className="login-page-label" htmlFor="login-password">
            {role === 'admin' ? '관리자 비밀번호' : '공용 비밀번호'}
          </label>
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
            placeholder="비밀번호를 입력하세요"
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
            <span className="login-page-remember-label">자동 로그인</span>
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
