import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { verifyPin } from './pinAuth.js'
import { readPinProfile } from './pinProfile.js'
import './LoginPage.css'
import './PinLockPage.css'

const LOGIN_PAGE_ACTIVE_CLASS = 'login-page-active'

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4)
}

export default function PinLockPage() {
  const { acceptKakaoSession, preferKakaoLogin } = useAuth()
  const profile = readPinProfile()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add(LOGIN_PAGE_ACTIVE_CLASS)
    document.body.classList.add(LOGIN_PAGE_ACTIVE_CLASS)
    return () => {
      document.documentElement.classList.remove(LOGIN_PAGE_ACTIVE_CLASS)
      document.body.classList.remove(LOGIN_PAGE_ACTIVE_CLASS)
    }
  }, [])

  const submit = async (nextPin) => {
    const code = digitsOnly(nextPin)
    if (code.length !== 4 || busy) return
    setBusy(true)
    setError('')
    const result = await verifyPin(profile?.accountId, code)
    if (!result.ok) {
      setPin('')
      setError(result.error || '간편 비밀번호가 올바르지 않습니다.')
      setBusy(false)
      return
    }
    const applied = acceptKakaoSession(result.data, false)
    setBusy(false)
    if (!applied.ok) setError(applied.error || '로그인에 실패했습니다.')
  }

  return (
    <div className="login-page">
      <div className="login-page-card">
        <div className="login-page-brand">
          <img className="login-page-logo" src="/logo.png" alt="스마트DI" />
          <h1 className="login-page-title">간편 비밀번호</h1>
          <p className="login-page-subtitle">
            {profile?.displayName ? `${profile.displayName}님, ` : ''}숫자 4자리를 입력하세요.
          </p>
        </div>
        {error ? (
          <div className="login-page-error" role="alert">
            {error}
          </div>
        ) : null}
        <label className="pin-lock-label" htmlFor="pin-lock-input">
          간편 비밀번호
        </label>
        <input
          id="pin-lock-input"
          className="pin-lock-input"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={pin}
          autoFocus
          disabled={busy}
          onChange={(event) => {
            const next = digitsOnly(event.target.value)
            setPin(next)
            if (next.length === 4) void submit(next)
          }}
        />
        <button
          type="button"
          className="primary-btn login-page-submit"
          disabled={busy || pin.length !== 4}
          onClick={() => void submit(pin)}
        >
          {busy ? '확인 중…' : '잠금 해제'}
        </button>
        <button type="button" className="pin-lock-kakao" onClick={preferKakaoLogin}>
          카카오 로그인
        </button>
      </div>
    </div>
  )
}
