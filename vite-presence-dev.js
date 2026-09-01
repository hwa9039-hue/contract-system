/**
 * npm run dev 전용 접속자 저장소.
 * 메모리 + 파일(data/presence-online.json)을 같이 써서
 * 서버가 재시작되어도 일반 창·시크릿 창이 한 목록을 나눈다.
 */
import fs from 'node:fs'
import path from 'node:path'

const ONLINE_WINDOW_MS = 120_000
const STORE_FILE = path.join(process.cwd(), 'data', 'presence-online.json')
const lastActive = loadStore()

function toRecord(value) {
  if (value && typeof value === 'object') {
    const ts = Number(value.ts)
    return {
      ts: Number.isFinite(ts) ? ts : 0,
      menuTitle: String(value.menuTitle || '').trim(),
    }
  }
  const ts = Number(value)
  return { ts: Number.isFinite(ts) ? ts : 0, menuTitle: '' }
}

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8')
    const obj = JSON.parse(raw)
    return new Map(
      Object.entries(obj)
        .map(([id, value]) => [id, toRecord(value)])
        .filter(([, rec]) => rec.ts > 0)
    )
  } catch {
    return new Map()
  }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true })
    fs.writeFileSync(STORE_FILE, JSON.stringify(Object.fromEntries(lastActive)), 'utf8')
  } catch {
    // 로컬 파일 잠금 실패는 메모리 목록으로 계속한다.
  }
}

function prune() {
  const cutoff = Date.now() - ONLINE_WINDOW_MS
  let changed = false
  for (const [id, rec] of lastActive) {
    if ((rec?.ts || 0) < cutoff) {
      lastActive.delete(id)
      changed = true
    }
  }
  if (changed) persist()
}

function listOnline() {
  prune()
  return [...lastActive.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([id, rec]) => ({
      id,
      displayName: id,
      lastActiveAt: new Date(rec.ts).toISOString(),
      menuTitle: rec.menuTitle || '',
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
  const pathName = raw.split('?')[0]
  const idx = pathName.indexOf('/api/presence')
  return idx >= 0 ? pathName.slice(idx) : pathName
}

export function presenceDevMiddleware() {
  return {
    name: 'presence-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const reqPath = presencePath(req)
        if (!reqPath.startsWith('/api/presence')) {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (reqPath === '/api/presence/ping' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const name = String(body.displayName || '').trim()
          if (!name) {
            sendJson(res, 400, { detail: 'displayName is required' })
            return
          }
          const menuTitle = String(body.menuTitle || '').trim().slice(0, 40)
          const prev = lastActive.get(name)
          lastActive.set(name, {
            ts: Date.now(),
            menuTitle: menuTitle || prev?.menuTitle || '',
          })
          persist()
          sendJson(res, 200, {
            id: name,
            displayName: name,
            lastActiveAt: new Date().toISOString(),
            menuTitle,
            users: listOnline(),
          })
          return
        }

        if (reqPath === '/api/presence/online' && req.method === 'GET') {
          sendJson(res, 200, { users: listOnline() })
          return
        }

        if (reqPath === '/api/presence/leave' && req.method === 'POST') {
          sendJson(res, 200, { ok: true, users: listOnline() })
          return
        }

        next()
      })
    },
  }
}
