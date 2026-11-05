import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { savePin } from './pinAuth.js'
import { markPinPassed, readPinProfile } from './pinProfile.js'
import './LoginPage.css'
import './PinLockPage.css'

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4)
}

const LOGIN_PAGE_ACTIVE_CLASS = 'login-page-active'

export default function PinSetupDialog({ gate = false }) {
  const {
    accessGranted,
    pinEnabled,
    pinLockActive,
    pinSetupOpen,
    closePinSetup,
    dismissPinSetup,
    markPinEnabled,
  } = useAuth()
  const [currentPin, setCurrentPin] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!gate) return undefined
    document.documentElement.classList.add(LOGIN_PAGE_ACTIVE_CLASS)
    document.body.classList.add(LOGIN_PAGE_ACTIVE_CLASS)
    return () => {
      document.documentElement.classList.remove(LOGIN_PAGE_ACTIVE_CLASS)
      document.body.classList.remove(LOGIN_PAGE_ACTIVE_CLASS)
    }
  }, [gate])

  if (!gate && (!accessGranted || pinLockActive || !pinSetupOpen)) return null

  const changing = !gate && (pinEnabled || Boolean(readPinProfile()?.pinEnabled))

  const close = () => {
    setCurrentPin('')
    setPin('')
    setConfirmPin('')
    setError('')
    if (gate) dismissPinSetup()
    else closePinSetup()
  }

  const handleSave = async () => {
    if (pin.length !== 4 || confirmPin.length !== 4) {
      setError('숫자 4자리를 입력해 주세요.')
      return
    }
    if (pin !== confirmPin) {
      setError('두 비밀번호가 같지 않습니다.')
      return
    }
    if (changing && currentPin.length !== 4) {
      setError('현재 간편 비밀번호를 입력해 주세요.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await savePin(pin, changing ? currentPin : '')
      markPinPassed()
      markPinEnabled(true)
      close()
    } catch (saveError) {
      setError(saveError?.message || '간편 비밀번호를 저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const fields = (
    <>
      {error ? <div className="login-page-error" role="alert">{error}</div> : null}
      {changing ? (
        <>
          <label className="pin-lock-label" htmlFor="pin-setup-current">현재 비밀번호</label>
          <input
            id="pin-setup-current"
            className="pin-lock-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={currentPin}
            onChange={(event) => setCurrentPin(digitsOnly(event.target.value))}
          />
        </>
      ) : null}
      <label className="pin-lock-label" htmlFor="pin-setup-next">{changing ? '새 비밀번호' : '비밀번호'}</label>
      <input
        id="pin-setup-next"
        className="pin-lock-input"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={4}
        value={pin}
        onChange={(event) => setPin(digitsOnly(event.target.value))}
      />
      <label className="pin-lock-label" htmlFor="pin-setup-confirm">한 번 더 입력</label>
      <input
        id="pin-setup-confirm"
        className="pin-lock-input"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={4}
        value={confirmPin}
        onChange={(event) => setConfirmPin(digitsOnly(event.target.value))}
      />
      <div className={gate ? 'pin-setup-actions pin-setup-actions-gate' : 'pin-setup-actions'}>
        {gate ? null : (
          <button type="button" className="pin-setup-later" onClick={close} disabled={busy}>
            닫기
          </button>
        )}
        <button type="button" className="primary-btn pin-setup-save" onClick={() => void handleSave()} disabled={busy}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </>
  )

  if (gate) {
    return (
      <div className="login-page">
        <div className="login-page-card" role="dialog" aria-modal="true" aria-labelledby="pin-setup-title">
          <div className="login-page-brand">
            <img className="login-page-logo" src="/logo.png" alt="스마트DI" />
            <h1 id="pin-setup-title" className="login-page-title">간편 비밀번호 설정</h1>
            <p className="login-page-subtitle">숫자 4자리를 정한 뒤에 업무 화면으로 들어갑니다.</p>
          </div>
          {fields}
        </div>
      </div>
    )
  }

  return (
    <div className="pin-setup-backdrop" role="presentation">
      <div className="pin-setup-card" role="dialog" aria-modal="true" aria-labelledby="pin-setup-title">
        <h2 id="pin-setup-title">{changing ? '간편 비밀번호 변경' : '간편 비밀번호 설정'}</h2>
        <p>이 브라우저에서 다시 열 때 숫자 4자리로 들어올 수 있습니다.</p>
        {fields}
      </div>
    </div>
  )
}
