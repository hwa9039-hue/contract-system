/**
 * 운영 배포(npm run build) 전용 런타임 설정.
 * npm run dev 에서는 src/apiClient.js 가 이 파일을 무시하고 http://localhost:8000 을 씁니다.
 *
 * - Cloudflare Pages 등 정적 호스트만 있고 `/api` 프록시가 없으면
 *   `__CMS_FORCE_SAME_ORIGIN_API__` 만 true 로 두면 POST 가 405 날 수 있습니다.
 *   이 경우 `__CMS_API_BASE_URL__` 에 실제 FastAPI HTTPS 주소를 넣으세요.
 * - contract 도메인에 Nginx 로 `/api` → 백엔드가 있을 때만 FORCE 를 true 로 두고 URL 은 비우세요.
 */
window.__CMS_FORCE_SAME_ORIGIN_API__ = false

/** 운영 API 베이스 — 프로덕션 빌드에서만 apiClient.js 가 참조합니다. */
window.__CMS_API_BASE_URL__ = 'https://api.signtelecom-smartdi.com'
