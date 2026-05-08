# FastAPI Backend

NAS PostgreSQL을 사용하는 계약관리 API입니다. 컨테이너는 `8000` 포트에서 FastAPI를 실행합니다.

## 1. 환경 변수

`.env.example`을 참고해서 실행 환경에 아래 값을 설정하세요.

```bash
DATABASE_URL=postgresql://smartdi:Smartdi2025!@192.168.0.100:5433/smartdi
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://your-cloudflare-pages-domain.pages.dev
```

- `DATABASE_URL`: NAS PostgreSQL 접속 주소입니다.
- `CORS_ORIGINS`: API 호출을 허용할 프론트엔드 Origin 목록입니다. 쉼표로 여러 개를 넣을 수 있습니다.

Cloudflare Pages에 배포한 프론트에서 접근하려면 `CORS_ORIGINS`에 실제 Pages 주소를 추가하세요.

예시:

```bash
CORS_ORIGINS=https://contract-management-system.pages.dev,https://www.example.com
```

프론트엔드에는 API 서버 주소를 `VITE_API_BASE_URL`로 지정해야 합니다. 예를 들어 NAS에서 `http://NAS_IP:8000`으로 백엔드를 열었다면 Cloudflare Pages 환경 변수에 아래처럼 설정합니다.

```bash
VITE_API_BASE_URL=http://NAS_IP:8000
```

## 2. 로컬 실행

PowerShell 예시:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
$env:DATABASE_URL="postgresql://smartdi:Smartdi2025!@192.168.0.100:5433/smartdi"
$env:CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

상태 확인:

```bash
curl http://localhost:8000/api/health
```

## 3. Docker 실행

`backend` 폴더에서 이미지를 빌드합니다.

```bash
cd backend
docker build -t contract-management-api .
```

컨테이너 실행:

```bash
docker run --rm -p 8000:8000 \
  -e DATABASE_URL="postgresql://smartdi:Smartdi2025!@192.168.0.100:5433/smartdi" \
  -e CORS_ORIGINS="https://your-cloudflare-pages-domain.pages.dev,http://localhost:5173,http://127.0.0.1:5173" \
  contract-management-api
```

PowerShell에서는 줄바꿈 문자가 다릅니다.

```powershell
docker run --rm -p 8000:8000 `
  -e DATABASE_URL="postgresql://smartdi:Smartdi2025!@192.168.0.100:5433/smartdi" `
  -e CORS_ORIGINS="https://your-cloudflare-pages-domain.pages.dev,http://localhost:5173,http://127.0.0.1:5173" `
  contract-management-api
```

## 4. NAS Container Manager 설정

1. `backend` 폴더의 `Dockerfile`로 이미지를 빌드하거나, 빌드한 이미지를 NAS에 업로드합니다.
2. 컨테이너 포트 `8000`을 NAS의 외부 포트 `8000` 또는 원하는 포트에 매핑합니다.
3. 환경 변수에 `DATABASE_URL`과 `CORS_ORIGINS`를 추가합니다.
4. NAS 방화벽과 공유기 포트포워딩에서 API 포트를 허용합니다.
5. Cloudflare Pages의 `VITE_API_BASE_URL`을 외부에서 접근 가능한 API 주소로 설정합니다.

서버 시작 시 필요한 테이블과 인덱스를 자동 생성합니다.

## 5. API

- `GET /api/health`
- `GET /api/contracts`
- `POST /api/contracts`
- `POST /api/contracts/bulk`
- `PATCH /api/contracts/{contract_id}`
- `DELETE /api/contracts/{contract_id}`
- `POST /api/contracts/bulk-delete`

프론트엔드는 `VITE_API_BASE_URL` 값이 없으면 기본값 `http://localhost:8000`을 사용합니다.
