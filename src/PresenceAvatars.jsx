const AVATAR_TONES = [
  'bg-slate-100 text-slate-700',
  'bg-blue-50 text-blue-800',
  'bg-indigo-50 text-indigo-800',
  'bg-violet-50 text-violet-800',
  'bg-emerald-50 text-emerald-800',
  'bg-amber-50 text-amber-800',
  'bg-rose-50 text-rose-800',
  'bg-cyan-50 text-cyan-800',
]

const MAX_AVATAR_CIRCLES = 4

function hashPresenceId(id) {
  const text = String(id || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

export function colorForPresenceId(id) {
  return AVATAR_TONES[hashPresenceId(id) % AVATAR_TONES.length]
}

/** 예전 역할 기본 라벨 → 실제 표시명 */
const PERSON_DISPLAY_ALIASES = {
  사용자: '이용자',
}

const GENERIC_ACCOUNT_LABELS = new Set(['관리자', '부서장', '리자'])

/** 공용 역할 이름. 사람 계정으로 취급하지 않는다. */
export function isGenericAccountLabel(displayName) {
  const raw = String(displayName || '').trim()
  if (!raw) return false
  if (GENERIC_ACCOUNT_LABELS.has(raw)) return true
  const full = formatPersonDisplayName(raw)
  return GENERIC_ACCOUNT_LABELS.has(full)
}

const PRESENCE_MENU_CACHE_KEY = 'cms-presence-last-menus-v1'

/** '전기웅(영업)' → '전기웅'. 괄호·직함은 빼고 이름만 남긴다. */
export function presenceNameCore(displayName) {
  const stripped = String(displayName || '')
    .replace(/\s+/g, '')
    .replace(/[\(\（][^\)\）]*[\)\）]/g, '')
    .replace(/영업$/g, '')
  return PERSON_DISPLAY_ALIASES[stripped] || stripped
}

/** 화면 식별용. 세 글자를 넘기지 않는다. */
export function formatPersonDisplayName(displayName) {
  const aliased = presenceNameCore(displayName)
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

/** '정화영' → '화영', '김성수' → '성수'. 성 대신 이름 뒤 두 글자. */
export function formatPersonGivenName(displayName) {
  const full = presenceNameCore(displayName)
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
    if (!fullName || isGenericAccountLabel(raw) || isGenericAccountLabel(fullName)) return
    const menuTitle =
      readPresenceMenuTitle(user) || recalledPresenceMenuTitle(fullName) || recalledPresenceMenuTitle(raw)
    if (menuTitle) rememberPresenceMenuTitle(fullName, menuTitle)
    const next = {
      ...user,
      fullName: presenceNameCore(raw) || fullName,
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
      existing.fullName = presenceNameCore(fullName) || existing.fullName
      existing.shortName = formatPersonGivenName(existing.fullName) || existing.shortName
      seen.set(fullName, existing)
    }
  })

  if (unique.length === 0) return null

  const namedCount = unique.length > MAX_AVATAR_CIRCLES ? MAX_AVATAR_CIRCLES - 1 : unique.length
  const visible = unique.slice(0, namedCount)
  const overflow = unique.length - visible.length

  return (
    <div className="presence-cluster group relative">
      <ul
        className="presence-avatar-list flex -space-x-2"
        aria-label={`접속 중 ${unique.length}명`}
      >
        {visible.map((user, index) => (
          <li
            key={user.fullName}
            className="presence-avatar-item relative"
            style={{ zIndex: visible.length - index }}
          >
            <span
              className={`presence-avatar inline-flex w-8 h-8 items-center justify-center rounded-full text-[11px] font-bold tracking-tighter ring-2 ring-white ${colorForPresenceId(user.fullName)}`}
              aria-label={user.fullName}
            >
              {user.shortName || '?'}
            </span>
          </li>
        ))}
        {overflow > 0 ? (
          <li className="presence-avatar-item relative" style={{ zIndex: 0 }}>
            <span className="presence-avatar inline-flex w-8 h-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold tracking-tighter text-slate-600 ring-2 ring-white">
              +{overflow}
            </span>
          </li>
        ) : null}
      </ul>
      <div className="presence-avatar-tooltip" role="tooltip">
        {unique.map((user) => (
          <span key={user.fullName} className="presence-avatar-tooltip-row">
            {user.fullName} · {user.menuTitle || '메뉴 확인 중'}
          </span>
        ))}
      </div>
    </div>
  )
}
