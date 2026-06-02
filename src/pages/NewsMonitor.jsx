const NEWS_MONITOR_URL = 'http://127.0.0.1:8000/'

export default function NewsMonitor() {
  return (
    <section className="stat-card stat-card--iframe-embed">
      <div className="iframe-embed-viewer">
        <iframe
          title="각종뉴스"
          src={NEWS_MONITOR_URL}
          className="iframe-embed-frame"
          allowFullScreen
        />
      </div>
    </section>
  )
}
