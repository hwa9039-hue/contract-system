const NARA_MARKET_URL = 'https://tkdwns5119-del.github.io/nara-scout/di'

export default function NaraMarket() {
  return (
    <section className="stat-card">
      <div className="contract-table-panel">
        <div className="table-wrap contracts-only-scroll overflow-x-auto">
          <iframe
            title="나라장터"
            src={NARA_MARKET_URL}
            className="w-full min-h-[75vh] border-none rounded-md"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  )
}
