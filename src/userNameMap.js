/** 이메일 아이디(@ 앞부분) → 성명 */
export const userNameMap = Object.freeze({
  kk2331: '전기웅',
  nov1st: '유영무',
  sskim: '김성수',
  yongja_lee: '이용자',
  pjb9878: '박재범',
  jslee: '이재승',
  wizard1221: '전재우',
  ssj8845: '신상준',
  hy9039: '정화영',
  jhjoung: '정주희',
})

/** 'hy9039@signtelecom.com' → 'hy9039' (@ 앞부분, 소문자·공백 제거). 이메일이 아니면 ''. */
export function extractEmailId(email) {
  const raw = String(email ?? '').trim()
  if (!raw) return ''
  const [id] = raw.split('@')
  return id.trim().toLowerCase()
}

/**
 * 보낸사람 이메일 → 성명.
 *  - 등록된 아이디면 이름 (hy9039@gmail.com 도 hy9039 로 같은 사람)
 *  - 미등록(외부 메일 등)이면 아이디를 괄호로 감싸 표시: (someone)
 *  - 비어 있으면 ''
 */
export function resolveSenderName(email) {
  const id = extractEmailId(email)
  if (!id) return ''
  if (Object.hasOwn(userNameMap, id)) return userNameMap[id]
  return `(${id})`
}
