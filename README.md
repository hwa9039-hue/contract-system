# Contract Management System

Vite React 프론트엔드와 FastAPI 백엔드로 구성된 계약관리 시스템입니다.

## 프론트엔드 API 주소

프론트엔드는 모든 API 요청에서 `VITE_API_BASE_URL` 환경변수를 먼저 사용합니다. 값이 없으면 로컬 개발을 위해 `http://localhost:8000`을 사용합니다.

배포 환경에서 NAS FastAPI 서버를 사용하려면 아래 값을 설정하세요.

```bash
VITE_API_BASE_URL=http://192.168.0.100:8000
```

로컬 개발에서 별도 환경변수를 설정하지 않으면 기본값으로 `http://localhost:8000`을 사용합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

로컬에서 NAS API를 직접 바라보려면 프로젝트 루트에 `.env.local`을 만들고 아래 값을 넣습니다.

```bash
VITE_API_BASE_URL=http://192.168.0.100:8000
```

## 빌드

```bash
npm run build
```

## Cloudflare Pages 환경변수 설정

1. Cloudflare Dashboard에서 `Workers & Pages`로 이동합니다.
2. 배포할 Pages 프로젝트를 선택합니다.
3. `Settings` 메뉴에서 `Environment variables`로 이동합니다.
4. Production 환경변수에 아래 값을 추가합니다.

```bash
VITE_API_BASE_URL=http://192.168.0.100:8000
```

5. 변경 후 Pages를 다시 배포합니다.

Cloudflare Pages에서 호출하려면 FastAPI 백엔드의 `CORS_ORIGINS`에도 Pages 도메인이 포함되어야 합니다.

예시:

```bash
CORS_ORIGINS=https://your-cloudflare-pages-domain.pages.dev
```

로컬 개발과 배포를 모두 허용하려면 쉼표로 함께 지정합니다.

```bash
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://your-cloudflare-pages-domain.pages.dev
```

주의: Cloudflare Pages는 HTTPS로 서비스되므로 브라우저에서 HTTP API 호출이 차단될 수 있습니다. 같은 내부망에서만 사용하는 구성이 아니라면 NAS API에 HTTPS 도메인 또는 리버스 프록시를 적용하는 것을 권장합니다.
