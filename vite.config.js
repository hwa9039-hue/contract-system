import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { presenceDevMiddleware } from './vite-presence-dev.js'

const rootDir = dirname(fileURLToPath(import.meta.url))

/** npm run dev 에서 index.html 의 api-config.js(운영 URL) 로드를 제거 */
function skipApiConfigInDev() {
  return {
    name: 'skip-api-config-in-dev',
    transformIndexHtml(html, ctx) {
      if (ctx.server) {
        return html.replace(
          /\s*<script src="\/api-config\.js[^"]*"><\/script>/i,
          '<!-- api-config.js: dev 에서는 로드하지 않음 (apiClient → localhost:8000) -->'
        )
      }
      return html
    },
  }
}

/** 개발 서버에서도 공유 주소는 og:title 이 있는 share.html 을 내려준다. */
function serveShareHtmlInDev() {
  const sharePaths = new Set(['/share/installations', '/public/install-cases'])
  return {
    name: 'serve-share-html-in-dev',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = String(req.url || '').split('?')[0].replace(/\/+$/, '')
        if (sharePaths.has(pathname)) req.url = '/share.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), skipApiConfigInDev(), serveShareHtmlInDev(), presenceDevMiddleware()],
  server: {
    host: '0.0.0.0',
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        share: resolve(rootDir, 'share.html'),
      },
    },
    // 프로덕션 번들에 .map 을 만들지 않는다. Sources 탭에 원본 경로·JSX가 붙지 않는다.
    sourcemap: false,
    // Vite 8 기본 압축기. 식별자 축약·공백 제거가 프로덕션 빌드에 항상 켜진다.
    minify: 'oxc',
    cssMinify: 'lightningcss',
  },
})
