const NEWS_MONITOR_URL =
  'https://newsmonitor-fmcxs7yzacrztzqvefz9vg.streamlit.app/?embed=true'

export default function NewsMonitor() {
  return (
    <div className="monitoring-embed-shell">
      <iframe
        title="각종뉴스"
        src={NEWS_MONITOR_URL}
        className="monitoring-embed-frame w-full h-[calc(100vh-100px)] border-none"
        allowFullScreen
      />
    </div>
  )
}
