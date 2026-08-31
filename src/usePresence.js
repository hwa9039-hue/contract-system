import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { leavePresence, listOnlinePresence, pingPresence } from './presenceApi.js'

/**
 * 온라인 접속자 Heartbeat.
 *
 * 로그인되어 있으면 30초마다:
 *   1) POST /api/presence/ping  — 내가 살아 있다고 알림
 *   2) GET  /api/presence/online — 최근 ping 한 사람 목록
 *
 * 탭/브라우저를 닫거나 로그아웃하면 interval 을 지우고 leave 를 보낸다.
 *
 * ── 백엔드 가이드 ──────────────────────────────────────────
 * ping 을 받을 때마다 해당 유저의 last_active_time 을 DB 또는
 * 메모리(지금은 프로세스 dict, 다중 워커면 Redis)에 기록한다.
 * GET /online 은 현재 시각 기준 최근 1~2분 안에 ping 이 있었던
 * 유저만 반환하면 된다. WebSocket 은 쓰지 않는다.
 * 식별자는 JWT display_name (예: 전재우, 신상준).
 * ──────────────────────────────────────────────────────────
 */
export const PRESENCE_HEARTBEAT_MS = 30_000

function normalizeOnlineUsers(payload) {
  const rows = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : []
  return rows
    .map((row) => {
      const displayName = String(row?.displayName || row?.name || row?.id || '').trim()
      if (!displayName) return null
      return {
        id: String(row?.id || displayName).trim(),
        displayName,
        lastActiveAt: row?.lastActiveAt || '',
      }
    })
    .filter(Boolean)
}

export function usePresence() {
  const { isAuthenticated, roleLabel } = useAuth()
  const [onlineUsers, setOnlineUsers] = useState([])

  useEffect(() => {
    if (!isAuthenticated) {
      setOnlineUsers([])
      return undefined
    }

    const displayName = String(roleLabel || '').trim()
    const self = displayName
      ? [{ id: displayName, displayName, lastActiveAt: '' }]
      : []
    setOnlineUsers(self)

    let cancelled = false

    const mergeUsers = (payload) => {
      const fromServer = normalizeOnlineUsers(payload)
      if (!displayName) return fromServer
      if (fromServer.some((user) => user.id === displayName || user.displayName === displayName)) {
        return fromServer
      }
      return [...self, ...fromServer]
    }

    const tick = async () => {
      try {
        await pingPresence(displayName)
        if (cancelled) return
        const payload = await listOnlinePresence()
        if (cancelled) return
        setOnlineUsers(mergeUsers(payload))
      } catch {
        if (!cancelled) setOnlineUsers(self)
      }
    }

    tick()
    const timerId = window.setInterval(tick, PRESENCE_HEARTBEAT_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', onVisible)
      void leavePresence(displayName)
    }
  }, [isAuthenticated, roleLabel])

  return { onlineUsers }
}
