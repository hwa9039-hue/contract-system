const NEWS_MONITOR_URL = 'http://127.0.0.1:8000/'

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
