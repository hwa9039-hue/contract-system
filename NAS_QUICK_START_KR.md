# NAS 백엔드 이미지 다시 만들기 (알아두면 되는 것만)

## 제가(Cursor AI) 대신 해줄 수 없는 것

회사/집 **Synology NAS 관리 웹**에는 로그인할 수 없습니다.  
**컨테이너 시작·중지·빌드 버튼**은 **본인이 직접** 눌러야 합니다.

대신 **GitHub 코드 수정·Dockerfile·이 문서**는 제가 저장소에 넣어 둘 수 있습니다.

---

## 왜 “이미지 다시 빌드”가 필요한가요?

프로그램 코드(`backend/app` 안 파일)를 고치면, NAS 안 Docker **이미지**를 **새로 만들어야** 그 코드가 컨테이너에 들어갑니다.

- 환경 변수(`JWT_SECRET` 등)만 바꾼 것 → **설정만** 바뀜  
- 코드까지 바꾼 것 → **이미지 빌드 + 컨테이너 재시작**까지 해야 반영

---

## 준비: NAS에 최신 `backend` 폴더 두기

아래 중 편한 방법 하나만 하면 됩니다.

1. PC에서 프로젝트를 NAS 공유 폴더로 **복사**하거나  
2. NAS에 SSH 접속해서 **`git clone`** 으로 저장소를 받거나  

NAS 안 어딘가에 **`Dockerfile`이 있는 `backend` 폴더**가 있어야 합니다.

---

## 방법 A — SSH로 빌드만 빠르게 (추천, 명령 몇 줄)

1. NAS **제어판** → **터미널 및 SNMP** → **SSH 서비스 사용** 체크 → **적용**  
2. PC **PowerShell** 또는 PuTTY에서:

```bash
ssh 관리자계정@NAS의_IP주소
```

3. NAS에 접속한 뒤, **`backend` 폴더가 있는 경로**로 이동 (예시):

```bash
cd /volume1/docker/contract-management-system/backend
```

4. 아래 **한 줄** 실행 (이미지 이름은 지금 쓰는 것과 같게 유지):

```bash
docker build -t contract-backend-contract-backend:latest .
```

5. **컨테이너 매니저**에서 **`contract-backend` 컨테이너** → **중지** → **작업** 메뉴에서 **같은 이미지로 다시 만들기 / 재시작** 등으로 예전과 동일한 포트·환경 변수를 유지한 채 다시 실행합니다.  
   (DSM 버전마다 메뉴 이름이 조금 다릅니다. **중지 후 시작**, 또는 **이미지 선택 후 컨테이너 생성**으로 같은 설정 복제.)

같은 폴더에 `docker-compose.yml`이 있으면 다음으로도 됩니다.

```bash
docker compose build --no-cache
```

그 다음 위와 같이 컨테이너만 다시 띄우면 됩니다.

---

## 방법 B — 컨테이너 매니저만 쓸 때 (SSH 없음)

1. NAS 파일 스테이션 등으로 **`backend` 폴더 최신본**을 NAS에 둡니다.  
2. **컨테이너 매니저** → **프로젝트** 또는 **이미지** 메뉴에서 **Dockerfile로 빌드**(이름은 기종마다 다름)를 찾습니다.  
3. **빌드 경로** = NAS 위에 둔 **`backend` 폴더**,  
   **이미지 이름** = 기존과 동일 (예: `contract-backend-contract-backend:latest`).  
4. 빌드 완료 후 **`contract-backend` 컨테이너**를 **중지했다가**, 새 이미지를 쓰도록 **다시 실행**합니다.

메뉴 위치는 DSM 버전마다 다르니, **`빌드`**, **`Dockerfile`**, **`build`** 키워드로 찾아보시면 됩니다.

---

## 한 줄 요약

| 할 일 | 누가 |
|--------|------|
| 코드 수정·GitHub 반영 | Cursor / 개발자 |
| NAS에서 이미지 빌드·컨테이너 재시작 | **본인 (버튼 또는 SSH)** |

문제가 계속되면 **어떤 방법(A/B)** 으로 했는지와 **컨테이너 이름·에러 한 줄**만 알려주시면 됩니다.

---

## 「Dockerfile 개 파일 형식이 유효하지 않습니다」가 계속 나올 때

Synology **컨테이너 매니저 화면에서 Dockerfile 빌드**는 버전·설정에 따라 **정상 파일도 거절**하는 경우가 있습니다. 이 경우 **방법 B(GUI)는 포기하고 방법 A(SSH)만** 쓰는 걸 권장합니다.

### SSH로 확실히 빌드하기 (경로만 본인 NAS에 맞게)

프로젝트 경로가 예를 들어 `/volume1/docker/contract-backend/backend` 라면:

```bash
ssh 관리자@NAS_IP
cd /volume1/docker/contract-backend/backend
sudo docker build -t contract-backend-contract-backend:latest .
```

(`docker` 명령만 될 때는 `sudo` 생략 가능)

빌드가 **Successfully** / **Successfully tagged** 까지 나오면 성공입니다. 그다음 **컨테이너** 탭에서 `contract-backend` → **다시 시작** 하거나, 프로젝트에서 같은 이미지를 쓰도록 재실행합니다.

### 그래도 안 되면 NAS 안에서 확인

같은 폴더에서:

```bash
head -n 3 Dockerfile
```

첫 줄이 **`FROM python:3.12-slim`** 이어야 합니다. 다르면 PC에서 `backend/Dockerfile`을 다시 복사해 덮어쓰세요.

---

## HTTPS 사이트에서 엑셀 업로드가 `Failed to fetch` / Mixed Content 일 때

브라우저는 **`https://contract....`** 페이지가 **`http://192.168.0.100:8000`** 같은 **HTTP(특히 사설 IP)** 로 API를 호출하는 것을 막습니다.

1. PC 프로젝트 루트의 **`.env`** 에 `VITE_API_BASE_URL=http://192.168...` 가 있으면 **삭제하거나 비운 뒤** `npm run build` → `dist` 다시 NAS `contract-www`에 올리기.  
2. **제어판 → 로그인 포털 → 고급 → 리버스 프록시 → 만들기**
   - **소스:** HTTPS, 호스트 `contract.signtelecom-smartdi.com`, 포트 443, **경로 `/api`**
   - **대상:** HTTP, `127.0.0.1`, 포트 **8000** (경로는 보통 `/api` 유지 또는 DSM 안내에 따름)
3. 브라우저에서 `https://contract.signtelecom-smartdi.com/api/health` 가 `{"status":"ok"}` 로 열리는지 확인.

최신 프론트 번들은 **HTTPS 화면 + HTTP API 설정**이 있어도 같은 도메인으로 자동 보정하지만, **2번 리버스 프록시 없이는** 여전히 Web Station만 응답해 API가 안 됩니다.
