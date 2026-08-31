/**
 * npm run dev 전용 접속자 저장소.
 * 일반 창·시크릿 창이 같은 Vite 서버를 쓰므로 아바타가 한 목록으로 모인다.
 */
const ONLINE_WINDOW_MS = 120_000
const lastActive = new Map()

function prune() {
  const cutoff = Date.now() - ONLINE_WINDOW_MS
  for (const [id, ts] of lastActive) {
    if (ts < cutoff) lastActive.delete(id)
  }
}

function listOnline() {
  prune()
  return [...lastActive.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([id, ts]) => ({
      id,
      displayName: id,
      lastActiveAt: new Date(ts).toISOString(),
    }))
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.end(JSON.stringify(body))
}

function presencePath(req) {
  const raw = String(req.originalUrl || req.url || '')
  const path = raw.split('?')[0]
  const idx = path.indexOf('/api/presence')
  return idx >= 0 ? path.slice(idx) : path
}

export function presenceDevMiddleware() {
  return {
    name: 'presence-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = presencePath(req)
        if (!path.startsWith('/api/presence')) {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (path === '/api/presence/ping' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const name = String(body.displayName || '').trim()
          if (!name) {
            sendJson(res, 400, { detail: 'displayName is required' })
            return
          }
          lastActive.set(name, Date.now())
          sendJson(res, 200, {
            id: name,
            displayName: name,
            lastActiveAt: new Date().toISOString(),
          })
          return
        }

        if (path === '/api/presence/online' && req.method === 'GET') {
          sendJson(res, 200, { users: listOnline() })
          return
        }

        if (path === '/api/presence/leave' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const name = String(body.displayName || '').trim()
          const ts = name ? lastActive.get(name) : null
          // StrictMode/HMR cleanup leave 가 ping 직후 도착해도 지우지 않는다.
          if (name && ts != null && Date.now() - ts > 4000) {
            lastActive.delete(name)
          }
          sendJson(res, 200, { ok: true })
          return
        }

        next()
      })
    },
  }
}
