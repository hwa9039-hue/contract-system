/**
 * NAS / 운영 서버에만 두고 수정합니다. (web/contract-www/api-config.js)
 * 프론트 재빌드 없이 API 동작만 바꿀 때 사용합니다.
 *
 * 권장: 프론트와 같은 호스트로만 API 호출 → 브라우저 CORS 문제 없음.
 *       Nginx에서 `location /api/ { proxy_pass http://백엔드:8000; }` 필요.
 * 로컬 `npm run dev`는 PROD가 아니므로 아래 true여도 .env 의 VITE_API_BASE_URL 을 씁니다.
 */
window.__CMS_FORCE_SAME_ORIGIN_API__ = true

/**
 * 별도 api 서브도메인으로 직접 붙일 때만 사용 (백엔드 CORS 허용 필수).
 * __CMS_FORCE_SAME_ORIGIN_API__ 가 true 이고 운영 빌드(PROD)이면 이 값은 무시됩니다.
 */
// window.__CMS_API_BASE_URL__ = 'https://api.signtelecom-smartdi.com'
