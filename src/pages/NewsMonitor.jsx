const NEWS_MONITOR_URL =
  'https://newsmonitor-fmcxs7yzacrztzqvefz9vg.streamlit.app/?embed=true&embed_options=show_toolbar=false,show_padding=false,light_theme=true'

export default function NewsMonitor() {
  return (
    <section className="stat-card">
      <div className="contract-table-panel">
        <div className="table-wrap contracts-only-scroll overflow-x-auto">
          <div className="flex flex-col flex-1 w-full min-h-[calc(100vh-160px)]">
            <iframe
              title="각종뉴스"
              src={NEWS_MONITOR_URL}
              className="w-full h-full min-h-[calc(100vh-160px)] flex-1 border-none rounded-b-md"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  )
}
