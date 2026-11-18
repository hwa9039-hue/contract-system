/** 본예산(뷰어) — 지자체 예산서 자동화 화면을 조회 전용(?viewer=1)으로 띄운다 */
const MAIN_BUDGET_VIEWER_URL =
  import.meta.env.VITE_MAIN_BUDGET_VIEWER_URL || 'https://automation.signtelecom-smartdi.com/?viewer=1'

export default function MainBudgetViewer() {
  return (
    <section className="stat-card stat-card--iframe-embed main-budget-viewer-card">
      <iframe
        title="본예산"
        src={MAIN_BUDGET_VIEWER_URL}
        className="block flex-1 w-full h-full min-h-0 m-0 p-0 border-0"
        allowFullScreen
      />
    </section>
  )
}
