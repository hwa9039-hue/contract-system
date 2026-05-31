const NEWS_MONITOR_URL =
  'https://newsmonitor-fmcxs7yzacrztzqvefz9vg.streamlit.app/?embed=true&embed_options=show_toolbar=false,show_padding=false,light_theme=true'

export default function NewsMonitor() {
  return (
    <div className="monitoring-embed-shell monitoring-embed-shell--full-bleed">
      <iframe
        title="각종뉴스"
        src={NEWS_MONITOR_URL}
        className="monitoring-embed-frame w-full h-[calc(100vh-80px)] block border-none"
        allowFullScreen
      />
    </div>
  )
}
