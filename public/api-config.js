/**
 * NAS / 운영 서버에만 두고 수정합니다. (web/contract-www/api-config.js)
 * 프론트 재빌드 없이 API 주소만 바꿀 때 사용합니다.
 *
 * 아래 한 줄에서 주소만 넣고 저장한 뒤 브라우저 강력 새로고침(Ctrl+Shift+R).
 * 빈 문자열이면 환경변수(VITE_API_BASE_URL) 또는 같은 사이트 주소를 씁니다.
 *
 * 예: 리버스 프록시 없이 터널로 백엔드만 노출한 주소
 * window.__CMS_API_BASE_URL__ = 'https://api.회사도메인.com'
 *
 * 예: 같은 도메인에서 /api 만 백엔드로 넘기는 경우에는 보통 비우고(재빌드 없음),
 *     리버스 프록시 규칙만 맞추면 됩니다.
 */
// NAS 운영: https 페이지가 LAN http API를 부르면 브라우저가 막습니다(Mixed Content).
// 로컬 `npm run dev`에서 자기 PC의 백엔드를 쓸 땐 이 값을 '' 로 두고 .env의 VITE_API_BASE_URL 을 쓰세요.
window.__CMS_API_BASE_URL__ = 'https://api.signtelecom-smartdi.com'
