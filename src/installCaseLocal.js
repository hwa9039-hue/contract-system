/** 설치사례 API 404 등으로 백엔드 미연결 시 UI 테스트용 로컬 처리 */

export function createLocalInstallCaseId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
