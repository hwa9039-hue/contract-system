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

/** '전기웅(영업)' → '기웅', '전재우' → '재우' */
export function getPresenceInitials(displayName) {
  const stripped = String(displayName || '')
    .replace(/\s+/g, '')
    .replace(/\([^)]*\)/g, '')
  if (!stripped) return '?'
  return stripped.slice(-2)
}

export function PresenceAvatars({ users = [] }) {
  if (!Array.isArray(users) || users.length === 0) return null

  return (
    <ul
      className="presence-avatar-list flex -space-x-2"
      aria-label={`접속 중 ${users.length}명`}
    >
      {users.map((user) => {
        const name = user.displayName || user.id
        return (
          <li key={user.id} className="presence-avatar-item relative">
            <span
              className="presence-avatar w-8 h-8 rounded-full ring-2 ring-white shadow-sm"
              style={{ backgroundColor: colorForPresenceId(user.id) }}
              title={name}
              aria-label={name}
            >
              {getPresenceInitials(name)}
            </span>
            <span className="presence-avatar-tooltip" role="tooltip">
              {name}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
