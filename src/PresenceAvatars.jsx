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

/** '전기웅(영업)' → '전기웅' — 화면에는 이름 세 글자만. */
export function formatPersonDisplayName(displayName) {
  const stripped = String(displayName || '')
    .replace(/\s+/g, '')
    .replace(/\([^)]*\)/g, '')
  if (!stripped) return ''
  return stripped.slice(0, 3)
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
  const seen = new Set()
  users.forEach((user) => {
    const raw = user.displayName || user.id
    const fullName = formatPersonDisplayName(raw) || raw
    if (!fullName || seen.has(fullName)) return
    seen.add(fullName)
    unique.push({ ...user, fullName, shortName: formatPersonGivenName(raw) || fullName })
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
              title={user.fullName}
              aria-label={user.fullName}
            >
              {user.shortName || '?'}
            </span>
            <span className="presence-avatar-tooltip" role="tooltip">
              {user.fullName}
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
