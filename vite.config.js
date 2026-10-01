import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { presenceDevMiddleware } from './vite-presence-dev.js'

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

export default defineConfig({
  plugins: [react(), skipApiConfigInDev(), presenceDevMiddleware()],
  server: {
    host: '0.0.0.0',
  },
  build: {
    // 프로덕션 번들에 .map 을 만들지 않는다. Sources 탭에 원본 경로·JSX가 붙지 않는다.
    sourcemap: false,
    // Vite 8 기본 압축기. 식별자 축약·공백 제거가 프로덕션 빌드에 항상 켜진다.
    minify: 'oxc',
    cssMinify: 'lightningcss',
  },
})
