/** 설치사례 API 404 등으로 백엔드 미연결 시 UI 테스트용 로컬 처리 */

export function isInstallCaseApiUnavailableError(error) {
  const msg = String(error?.message ?? error ?? '')
  if (error?.status === 404) return true
  return /404|not found|찾을 수 없습니다|installCases:\s*false/i.test(msg)
}

export function createLocalInstallCaseId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
