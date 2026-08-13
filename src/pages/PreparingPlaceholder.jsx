/** 아직 구현되지 않은 메뉴에 붙이는 공용 준비 중 화면 */
export default function PreparingPlaceholder({ label }) {
  return (
    <section className="stat-card page-preparing-placeholder" aria-label={label}>
      <div className="page-preparing-placeholder-inner">
        <p className="page-preparing-placeholder-text">준비 중입니다.</p>
      </div>
    </section>
  )
}
