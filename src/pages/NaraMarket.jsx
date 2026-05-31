const NARA_MARKET_URL = 'https://tkdwns5119-del.github.io/nara-scout/di'

export default function NaraMarket() {
  return (
    <section className="stat-card">
      <div className="contract-table-panel">
        <div className="table-wrap contracts-only-scroll overflow-x-auto">
          <div className="flex flex-col flex-1 w-full min-h-[calc(100vh-160px)]">
            <iframe
              title="나라장터"
              src={NARA_MARKET_URL}
              className="w-full h-full min-h-[calc(100vh-160px)] flex-1 border-none rounded-b-md"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  )
}
