const AVATAR_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#059669',
  '#0891b2',
  '#4f46e5',
  '#c026d3',
  '#ca8a04',
  '#0f766e',
]

export function colorForPresenceId(id) {
  const text = String(id || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/** 예전 역할 기본 라벨 → 실제 표시명 */
const PERSON_DISPLAY_ALIASES = {
  사용자: '이용자',
}

const PRESENCE_MENU_CACHE_KEY = 'cms-presence-last-menus-v1'

/** '전기웅(영업)' → '전기웅' — 화면에는 이름 세 글자만. */
export function formatPersonDisplayName(displayName) {
  const stripped = String(displayName || '')
    .replace(/\s+/g, '')
    .replace(/[\(\（][^\)\）]*[\)\）]/g, '')
    .replace(/영업$/g, '')
  const aliased = PERSON_DISPLAY_ALIASES[stripped] || stripped
  if (!aliased) return ''
  return aliased.slice(0, 3)
}

export function readPresenceMenuTitle(row) {
  return String(row?.menuTitle || row?.menu_title || row?.pageTitle || '').trim()
}

export function samePresencePerson(left, right) {
  const a = formatPersonDisplayName(left)
  const b = formatPersonDisplayName(right)
  if (!a || !b) return false
  if (a === b) return true
  return a.endsWith(b) || b.endsWith(a)
}

export function rememberPresenceMenuTitle(name, menuTitle) {
  const id = formatPersonDisplayName(name)
  const title = String(menuTitle || '').trim()
  if (!id || !title) return
  try {
    const raw = JSON.parse(sessionStorage.getItem(PRESENCE_MENU_CACHE_KEY) || '{}')
    if (!raw || typeof raw !== 'object') return
    raw[id] = title
    sessionStorage.setItem(PRESENCE_MENU_CACHE_KEY, JSON.stringify(raw))
  } catch {
    /* ignore */
  }
}

export function recalledPresenceMenuTitle(name) {
  const id = formatPersonDisplayName(name)
  if (!id) return ''
  try {
    const raw = JSON.parse(sessionStorage.getItem(PRESENCE_MENU_CACHE_KEY) || '{}')
    if (raw && typeof raw === 'object' && raw[id]) return String(raw[id] || '').trim()
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw)) {
        if (samePresencePerson(key, id) && value) return String(value).trim()
      }
    }
  } catch {
    /* ignore */
  }
  return ''
}

export function getPresenceInitials(displayName) {
  return formatPersonGivenName(displayName) || '?'
}

/** '전기웅(영업)' → '기웅' — 원 안에는 성 빼고 두 글자. */
export function formatPersonGivenName(displayName) {
  const full = formatPersonDisplayName(displayName)
  if (!full) return ''
  return full.slice(-2)
}

export function PresenceAvatars({ users = [] }) {
  if (!Array.isArray(users) || users.length === 0) return null

  const unique = []
  const seen = new Map()
  users.forEach((user) => {
    const raw = user.displayName || user.id
    const fullName = formatPersonDisplayName(raw) || raw
    if (!fullName) return
    const menuTitle =
      readPresenceMenuTitle(user) || recalledPresenceMenuTitle(fullName) || recalledPresenceMenuTitle(raw)
    if (menuTitle) rememberPresenceMenuTitle(fullName, menuTitle)
    const next = {
      ...user,
      fullName,
      shortName: formatPersonGivenName(raw) || fullName,
      menuTitle,
    }
    const existing =
      seen.get(fullName) ||
      unique.find((row) => samePresencePerson(row.fullName, fullName))
    if (!existing) {
      seen.set(fullName, next)
      unique.push(next)
      return
    }
    if (menuTitle) existing.menuTitle = menuTitle
    if (fullName.length > existing.fullName.length) {
      existing.fullName = fullName
      existing.shortName = formatPersonGivenName(fullName) || existing.shortName
      seen.set(fullName, existing)
    }
  })

  return (
    <div className="presence-cluster">
      <ul
        className="presence-avatar-list flex"
        aria-label={`접속 중 ${unique.length}명`}
      >
        {unique.map((user, index) => (
          <li
            key={user.fullName}
            className="presence-avatar-item relative"
            style={{ zIndex: index + 1 }}
          >
            <span
              className="presence-avatar w-8 h-8 rounded-full ring-2 ring-white shadow-sm"
              style={{ backgroundColor: colorForPresenceId(user.fullName) }}
              title={user.menuTitle ? `${user.fullName} · ${user.menuTitle}` : user.fullName}
              aria-label={user.menuTitle ? `${user.fullName} · ${user.menuTitle}` : user.fullName}
            >
              {user.shortName || '?'}
            </span>
            <span className="presence-avatar-tooltip" role="tooltip">
              {user.fullName}
              {user.menuTitle ? ` · ${user.menuTitle}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {unique.length > 1 ? (
        <span className="presence-count" aria-hidden="true">
          {unique.length}
        </span>
      ) : null}
    </div>
  )
}
