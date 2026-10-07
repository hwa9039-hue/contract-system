/** 공유 주소의 첫 HTML 에 메신저 미리보기 제목·만료일을 넣는다. 자바스크립트 실행 전에도 읽힌다. */
const PUBLIC_SHARE_PAGE_TITLE = '(주)싸인텔레콤 설치사례'

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

/** JWT payload 의 exp 만 읽는다. 서명은 백엔드가 확인하고, 여기는 미리보기 문구만 만든다. */
function readShareExpiryDescription(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return ''
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const json = JSON.parse(atob(padded))
    const exp = Number(json.exp)
    if (!Number.isFinite(exp)) return ''
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(exp * 1000))
    const pick = (type) => parts.find((item) => item.type === type)?.value || ''
    const year = pick('year')
    const month = pick('month')
    const day = pick('day')
    const hour = pick('hour')
    const minute = pick('minute')
    if (!year || !month || !day || !hour || !minute) return ''
    return `열람 만료일: ${year}년 ${month}월 ${day}일 ${hour}:${minute}`
  } catch {
    return ''
  }
}

export async function renderInstallCasePreview(context) {
  const requestUrl = new URL(context.request.url)
  const description = readShareExpiryDescription(requestUrl.searchParams.get('token') || '')
  const assetUrl = new URL(context.request.url)
  assetUrl.pathname = '/index.html'
  assetUrl.search = ''
  const asset = await context.env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }))
  const html = await asset.text()
  let next = html.replace(/<title>[^<]*<\/title>/, `<title>${PUBLIC_SHARE_PAGE_TITLE}</title>`)
  if (!next.includes('property="og:title"')) {
    next = next.replace(
      '</head>',
      `  <meta property="og:title" content="${PUBLIC_SHARE_PAGE_TITLE}" />\n    <meta property="og:type" content="website" />\n  </head>`,
    )
  }
  if (description) {
    const tag = `<meta property="og:description" content="${escapeAttr(description)}" />`
    next = next.includes('property="og:description"')
      ? next.replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, tag)
      : next.replace('</head>', `  ${tag}\n  </head>`)
  }
  return new Response(next, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  })
}
