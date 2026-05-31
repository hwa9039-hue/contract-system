const NEWS_MONITOR_URL =
  'https://newsmonitor-fmcxs7yzacrztzqvefz9vg.streamlit.app/?embed=true&embed_options=show_toolbar=false,show_padding=false,light_theme=true'

export default function NewsMonitor() {
  return (
    <section className="stat-card">
      <div className="contract-table-panel">
        <div className="table-wrap contracts-only-scroll overflow-x-auto">
          <div className="w-full h-[75vh] overflow-hidden relative rounded-md">
            <iframe
              title="각종뉴스"
              src={NEWS_MONITOR_URL}
              className="absolute top-0 left-0 w-full h-calc-full-plus-50px border-none"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  )
}
