/** 공유 주소의 첫 HTML 에 메신저 미리보기 제목을 넣는다. 자바스크립트 실행 전에도 읽힌다. */
const PUBLIC_SHARE_PAGE_TITLE = '(주)싸인텔레콤 설치사례'

export async function renderInstallCasePreview(context) {
  const assetUrl = new URL(context.request.url)
  assetUrl.pathname = '/index.html'
  const asset = await context.env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }))
  const html = await asset.text()
  const withTitle = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${PUBLIC_SHARE_PAGE_TITLE}</title>`,
  )
  const withMeta = withTitle.includes('property="og:title"')
    ? withTitle
    : withTitle.replace(
        '</head>',
        `  <meta property="og:title" content="${PUBLIC_SHARE_PAGE_TITLE}" />\n    <meta property="og:type" content="website" />\n  </head>`,
      )
  return new Response(withMeta, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  })
}
