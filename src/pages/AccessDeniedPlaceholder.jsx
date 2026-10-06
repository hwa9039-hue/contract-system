/** 권한이 없는 메뉴에 들어왔을 때 보여 주는 공용 화면 (알림 후 이전 화면으로 되돌아가는 동안에도 보인다) */
export default function AccessDeniedPlaceholder() {
  return (
    <section className="stat-card page-preparing-placeholder" aria-label="접근 권한 없음" role="alert">
      <div className="page-preparing-placeholder-inner">
        <p className="page-preparing-placeholder-text">🔒 접근 권한이 없습니다.</p>
      </div>
    </section>
  )
}
