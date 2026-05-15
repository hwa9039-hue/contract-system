import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import './LoginPage.css'

export default function LoginPage() {
  const { login } = useAuth()
  const [role, setRole] = useState('user')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(role, password)
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
              setError('')
            }}
          >
            관리자
          </button>
        </div>

        <form className="login-page-form" onSubmit={handleSubmit}>
          <label className="login-page-label" htmlFor="login-password">
            공용 비밀번호
          </label>
          <input
            id="login-password"
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

          {error ? <div className="login-page-error">{error}</div> : null}

          <button type="submit" className="login-page-submit primary-btn" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
