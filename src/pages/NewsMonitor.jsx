const NEWS_MONITOR_URL = 'https://newsmonitor-fmcxs7yzacrztzqvefz9vg.streamlit.app/'

export default function NewsMonitor() {
  return (
    <iframe
      title="각종뉴스"
      src={NEWS_MONITOR_URL}
      className="monitoring-embed-frame w-full min-h-[85vh] border-none"
      allowFullScreen
    />
  )
}
