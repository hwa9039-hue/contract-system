/**
 * ProtectedRoute — 역할(Role) 기반 접근 권한 게이트 컴포넌트
 *
 * 이 앱은 react-router 대신 상태(state) 기반으로 메뉴를 전환하기 때문에
 * "라우터 가드"를 이 래퍼 컴포넌트 형태로 제공합니다.
 * 특정 화면/영역/버튼을 특정 역할에게만 노출하고 싶을 때 감싸서 사용합니다.
 *
 * 사용 예)
 *   // 관리자 + 부서장만 볼 수 있는 영역
 *   <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
 *     <UnitPricePanel />
 *   </ProtectedRoute>
 *
 *   // 관리자만 (부서장 제외) — 나중에 부서장 권한을 축소할 때 이렇게 씁니다.
 *   <ProtectedRoute allowedRoles={[ROLES.ADMIN]} fallback={<NoPermission />}>
 *     <DangerZone />
 *   </ProtectedRoute>
 *
 * ▶ 부서장 권한을 조정하려면:
 *   - 특정 영역에서 부서장을 빼기: 해당 <ProtectedRoute> 의 allowedRoles 에서
 *     ROLES.MANAGER 를 제거.
 *   - 전역적으로 부서장=관리자 동일 취급을 끄기: permissions.js 의
 *     ADMIN_LEVEL_ROLES 에서 ROLES.MANAGER 제거.
 */
import { useAuth } from './AuthContext.jsx'
import { normalizeRole, ROLES } from './permissions.js'

export { ROLES }

/**
 * @param {object} props
 * @param {string[]} props.allowedRoles  접근을 허용할 역할 목록 (예: [ROLES.ADMIN, ROLES.MANAGER])
 * @param {React.ReactNode} props.children  권한이 있을 때 렌더링할 내용
 * @param {React.ReactNode} [props.fallback]  권한이 없을 때 렌더링할 내용 (기본: 아무것도 렌더링 안 함)
 */
export function ProtectedRoute({ allowedRoles, children, fallback = null }) {
  const { role } = useAuth()
  if (isRoleAllowed(role, allowedRoles)) {
    return <>{children}</>
  }
  return <>{fallback}</>
}

/** 현재 로그인 역할이 allowedRoles 안에 포함되는지 판별 (컴포넌트 밖에서도 재사용 가능) */
export function isRoleAllowed(role, allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true
  const current = normalizeRole(role)
  return allowedRoles.map(normalizeRole).includes(current)
}
