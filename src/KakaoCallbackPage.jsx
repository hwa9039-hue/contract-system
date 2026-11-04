import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import {
  exchangeKakaoCode,
  isKakaoCallbackPath,
  readKakaoCallbackParams,
} from './kakaoAuth.js'
import './LoginPage.css'

const LOGIN_PAGE_ACTIVE_CLASS = 'login-page-active'

export default function KakaoCallbackPage() {
  const { acceptKakaoSession } = useAuth()
  const [phase, setPhase] = useState('working')
  const [error, setError] = useState('')

  useEffect(() => {
    document.documentElement.classList.add(LOGIN_PAGE_ACTIVE_CLASS)
    document.body.classList.add(LOGIN_PAGE_ACTIVE_CLASS)
    return () => {
      document.documentElement.classList.remove(LOGIN_PAGE_ACTIVE_CLASS)
      document.body.classList.remove(LOGIN_PAGE_ACTIVE_CLASS)
    }
  }, [])

  useEffect(() => {
    if (!isKakaoCallbackPath()) return undefined
    const { code, kakaoError } = readKakaoCallbackParams()
    if (kakaoError || !code) {
      setPhase('error')
      setError(kakaoError ? '카카오 로그인을 취소했습니다.' : '카카오 인증 코드가 없습니다.')
      return undefined
    }
    let cancelled = false
    exchangeKakaoCode(code).then((result) => {
      if (cancelled) return
      if (result.pending || result.code === 'kakao_pending') {
        setPhase('pending')
        setError('')
        return
      }
      if (result.ok) {
        const applied = acceptKakaoSession(result.data, false)
        if (!applied.ok) {
          setPhase('error')
          setError(applied.error || '로그인에 실패했습니다.')
          return
        }
        window.history.replaceState(null, '', '/')
        return
      }
      setPhase('error')
      setError(result.error || '카카오 로그인에 실패했습니다.')
    })
    return () => {
      cancelled = true
    }
  }, [acceptKakaoSession])

  return (
    <div className="login-page">
      <div className="login-page-card">
        <div className="login-page-brand">
          <img className="login-page-logo" src="/logo.png" alt="스마트DI" />
          <h1 className="login-page-title">카카오 로그인</h1>
          <p className="login-page-subtitle">
            {phase === 'pending' ? '승인 대기' : '카카오 계정을 확인하고 있습니다.'}
          </p>
        </div>
        {phase === 'pending' ? (
          <div className="login-page-error" role="status" style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}>
            관리자에게 계정 연동이 요청되었습니다. 승인 후 접속 가능합니다.
          </div>
        ) : error ? (
          <div className="login-page-error" role="alert">
            {error}
          </div>
        ) : (
          <p className="login-page-subtitle">잠시만 기다려 주세요.</p>
        )}
        {phase === 'pending' || phase === 'error' ? (
          <button
            type="button"
            className="login-page-submit primary-btn"
            onClick={() => {
              window.history.replaceState(null, '', '/login')
              window.location.assign('/login')
            }}
          >
            로그인 화면으로
          </button>
        ) : null}
      </div>
    </div>
  )
}
