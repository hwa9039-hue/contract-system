import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from './AuthContext.jsx'

const MARK_COUNT = 80

function formatStamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function Watermark() {
  const { isAuthenticated, roleLabel } = useAuth()
  const [now, setNow] = useState(() => new Date())
  const [ip, setIp] = useState('확인 중')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('https://api.ipify.org?format=json')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setIp(String(data?.ip || '').trim() || '확인 불가')
      })
      .catch(() => {
        if (!cancelled) setIp('확인 불가')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const who = isAuthenticated ? roleLabel || '접속자' : '미로그인'
  const text = `스마트DI사업부 | ${who} | ${ip} | ${formatStamp(now)}`

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden select-none"
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 grid w-max -translate-x-1/2 -translate-y-1/2 -rotate-45 grid-cols-[repeat(4,max-content)] gap-x-28 gap-y-24"
        style={{ opacity: 0.1 }}
      >
        {Array.from({ length: MARK_COUNT }, (_, index) => (
          <span
            key={index}
            className="whitespace-nowrap text-lg font-semibold tracking-wide text-slate-900"
          >
            {text}
          </span>
        ))}
      </div>
    </div>,
    document.body,
  )
}
