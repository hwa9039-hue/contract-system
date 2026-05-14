/**
 * NAS / 운영 서버에만 두고 수정합니다. (web/contract-www/api-config.js)
 * 프론트 재빌드 없이 API 동작만 바꿀 때 사용합니다.
 *
 * - Cloudflare Pages 등 **정적 호스트만** 있고 `https://contract.../api` 프록시가 없으면
 *   `__CMS_FORCE_SAME_ORIGIN_API__`만 true로 두면 로그인 등 POST가 405가 납니다.
 *   이 경우 아래 `__CMS_API_BASE_URL__`에 **실제 FastAPI(NAS) HTTPS 주소**를 넣으세요.
 * - contract 도메인에 Nginx로 `/api` → 백엔드가 있을 때만 FORCE를 true로 두고 URL은 비우세요.
 *
 * 로컬 `npm run dev`는 `.env`의 `VITE_API_BASE_URL`이 있으면 그걸 우선합니다.
 */
window.__CMS_FORCE_SAME_ORIGIN_API__ = false

/** 운영 API 베이스 (DEPLOYMENT.md 예시와 동일). 실제 NAS URL이 다르면 이 한 줄만 수정. */
window.__CMS_API_BASE_URL__ = 'https://api.signtelecom-smartdi.com'
