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
})
