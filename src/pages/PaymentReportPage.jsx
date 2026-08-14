import { Fragment, useCallback, useId, useState } from 'react'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeAmountDigits(value) {
  return safeString(value).replace(/[^\d]/g, '')
}

function formatAmountComma(value) {
  const raw = normalizeAmountDigits(value)
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

const PAYMENT_REPORT_AMOUNT_KEYS = new Set(['plannedAmount'])

const PAYMENT_REPORT_TABLE_COL_COUNT = 11

function displayLocked(value) {
  const text = safeString(value).trim()
  return text || '—'
}

function formatContractPeriod(contract) {
  const start = safeString(contract?.contractDate).trim()
  const end = safeString(contract?.dueDate).trim()
  if (start && end) return `${start} ~ ${end}`
  if (start) return start
  if (end) return end
  return ''
}

/** 분류(참고번호) ↔ 계약현황 참고번호 매칭. 숫자면 선행 0 무시하고 동일 숫자로도 찾는다. */
export function findContractByClassification(contracts, classification) {
  const raw = safeString(classification).trim()
  if (!raw) return null

  const list = (Array.isArray(contracts) ? contracts : []).filter((row) => row && !row.isDraft)

  const exact = list.find((row) => safeString(row.refNo).trim() === raw)
  if (exact) return exact

  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    return (
      list.find((row) => {
        const ref = safeString(row.refNo).trim()
        return /^\d+$/.test(ref) && Number(ref) === n
      }) || null
    )
  }

  return null
}

function buildAutofillFromContract(contract) {
  if (!contract) {
    return {
      projectName: '',
      contractAmount: '',
      projectPeriod: '',
      client: '',
      matchStatus: 'idle',
    }
  }
  return {
    projectName: safeString(contract.projectName).trim(),
    contractAmount: formatAmountComma(contract.amount),
    projectPeriod: formatContractPeriod(contract),
    client: safeString(contract.client).trim(),
    matchStatus: 'matched',
  }
}

function createPaymentReportRow(seq, id) {
  return {
    id,
    seq,
    classification: '',
    projectName: '',
    contractAmount: '',
    projectPeriod: '',
    client: '',
    vendorInfo: '',
    plannedAmount: '',
    progress: '',
    matchStatus: 'idle',
    projectVolume: '',
    expenseContent: '',
    vendorDetail: '',
    completionAmount: '',
    materialCost: '',
    currentExpense: '',
    profitRate: '',
  }
}

function PaymentReportExpandedPanel({ row, onChange }) {
  return (
    <div className="payment-report-expand-section">
      <h3 className="payment-report-expand-section-title">결제관련 세부사항</h3>
      <div className="payment-report-expand-grid">
      <div className="payment-report-expand-pane">
        <h4 className="payment-report-expand-pane-title">사업정보</h4>
        <dl className="payment-report-expand-readonly">
          <div>
            <dt>사업명</dt>
            <dd>{displayLocked(row.projectName)}</dd>
          </div>
          <div>
            <dt>발주처</dt>
            <dd>{displayLocked(row.client)}</dd>
          </div>
          <div>
            <dt>계약금액</dt>
            <dd>{displayLocked(row.contractAmount)}</dd>
          </div>
          <div>
            <dt>사업기간</dt>
            <dd>{displayLocked(row.projectPeriod)}</dd>
          </div>
          <div>
            <dt>사업진행사항</dt>
            <dd className="payment-report-expand-readonly-wrap">{displayLocked(row.progress)}</dd>
          </div>
        </dl>
        <label className="payment-report-expand-field">
          <span>사업물량</span>
          <textarea
            className="payment-report-expand-textarea"
            rows={5}
            value={row.projectVolume}
            onChange={(e) => onChange(row.id, 'projectVolume', e.target.value)}
            placeholder="사업물량을 입력하세요"
          />
        </label>
      </div>

      <div className="payment-report-expand-pane">
        <h4 className="payment-report-expand-pane-title">결제관련</h4>
        <div className="payment-report-expand-vendor">
          <span className="payment-report-expand-vendor-label">업체명</span>
          <strong className="payment-report-expand-vendor-name">{displayLocked(row.vendorInfo)}</strong>
        </div>
        <label className="payment-report-expand-field">
          <span>지출내용</span>
          <textarea
            className="payment-report-expand-textarea"
            rows={3}
            value={row.expenseContent}
            onChange={(e) => onChange(row.id, 'expenseContent', e.target.value)}
            placeholder="지출내용을 입력하세요"
          />
        </label>
        <label className="payment-report-expand-field">
          <span>업체정보</span>
          <textarea
            className="payment-report-expand-textarea"
            rows={3}
            value={row.vendorDetail}
            onChange={(e) => onChange(row.id, 'vendorDetail', e.target.value)}
            placeholder="업체정보를 입력하세요"
          />
        </label>
        <div className="payment-report-expand-amounts">
          <p className="payment-report-expand-amounts-title">결제정보</p>
          <label className="payment-report-expand-field">
            <span>사업준공금액</span>
            <input
              className="payment-report-cell-input"
              type="text"
              autoComplete="off"
              value={row.completionAmount}
              onChange={(e) => onChange(row.id, 'completionAmount', e.target.value)}
              placeholder="예: 42,576,000원 / 100%"
            />
          </label>
          <label className="payment-report-expand-field">
            <span>물품원가금액</span>
            <input
              className="payment-report-cell-input"
              type="text"
              autoComplete="off"
              value={row.materialCost}
              onChange={(e) => onChange(row.id, 'materialCost', e.target.value)}
              placeholder="예: 33,000,000원 / 77.51%"
            />
          </label>
          <label className="payment-report-expand-field">
            <span>금회지출액</span>
            <input
              className="payment-report-cell-input"
              type="text"
              autoComplete="off"
              value={row.currentExpense}
              onChange={(e) => onChange(row.id, 'currentExpense', e.target.value)}
              placeholder="예: 6,386,400원 / 15%"
            />
          </label>
          <label className="payment-report-expand-field">
            <span>수익률</span>
            <input
              className="payment-report-cell-input"
              type="text"
              autoComplete="off"
              value={row.profitRate}
              onChange={(e) => onChange(row.id, 'profitRate', e.target.value)}
              placeholder="예: 3,189,600원"
            />
          </label>
        </div>
      </div>
      </div>
    </div>
  )
}

function renumberRows(rows) {
  return rows.map((row, index) => ({ ...row, seq: index + 1 }))
}

/**
 * 결제보고 등록/수정 표.
 * - 구분: 등록 순번(1부터) 자동 기입 (계약현황과 무관)
 * - 분류 입력 시 사업명·계약금액·사업기간·발주처를 계약현황에서 채워 잠금
 */
export default function PaymentReportPage({ contracts = [] }) {
  const idPrefix = useId()
  const [rows, setRows] = useState(() => [createPaymentReportRow(1, `${idPrefix}-1`)])
  const [nextId, setNextId] = useState(2)
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const applyClassificationLookup = useCallback(
    (rowId, classificationValue) => {
      const classification = safeString(classificationValue).trim()
      const found = findContractByClassification(contracts, classification)
      const autofill = buildAutofillFromContract(found)

      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row
          return {
            ...row,
            classification: safeString(classificationValue),
            projectName: autofill.projectName,
            contractAmount: autofill.contractAmount,
            projectPeriod: autofill.projectPeriod,
            client: autofill.client,
            matchStatus: !classification ? 'idle' : found ? 'matched' : 'missed',
          }
        })
      )
    },
    [contracts]
  )

  const handleClassificationChange = (rowId, value) => {
    applyClassificationLookup(rowId, value)
  }

  const handleEditableChange = (rowId, key, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row
        let nextValue = value
        if (PAYMENT_REPORT_AMOUNT_KEYS.has(key)) nextValue = formatAmountComma(value)
        return {
          ...row,
          [key]: nextValue,
        }
      })
    )
  }

  const toggleRowExpand = (rowId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const handleAddRow = () => {
    const id = `${idPrefix}-${nextId}`
    setNextId((n) => n + 1)
    setRows((prev) => [...prev, createPaymentReportRow(prev.length + 1, id)])
  }

  const handleRemoveRow = (rowId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.delete(rowId)
      return next
    })
    setRows((prev) => {
      if (prev.length <= 1) {
        return [createPaymentReportRow(1, `${idPrefix}-reset`)]
      }
      return renumberRows(prev.filter((row) => row.id !== rowId))
    })
  }

  return (
    <section className="stat-card payment-report-page" aria-label="결제보고">
      <div className="contracts-header-actions">
        <button type="button" className="primary-btn" onClick={handleAddRow}>
          행 추가
        </button>
        <p className="payment-report-page-desc">
          구분은 등록 순번으로 자동 부여됩니다.
          <br />
          분류(참고번호)를 입력하면 계약현황 정보가 표에 자동 입력되며 수정할 수 없습니다.
        </p>
      </div>

      <div className="payment-report-table-wrap">
        <table className="payment-report-table excel-table registry-table">
          <thead>
            <tr>
              <th className="payment-report-sticky payment-report-sticky--action">삭제</th>
              <th className="payment-report-sticky payment-report-sticky--seq">구분</th>
              <th className="payment-report-sticky payment-report-sticky--class">분류</th>
              <th className="payment-report-sticky payment-report-sticky--project">사업명</th>
              <th className="payment-report-sticky payment-report-sticky--amount">
                계약금액 (VAT 포함)
              </th>
              <th className="payment-report-sticky payment-report-sticky--period">사업기간</th>
              <th className="payment-report-sticky payment-report-sticky--client">발주처</th>
              <th className="payment-report-sticky payment-report-sticky--detail payment-report-sticky--last">
                세부사항
              </th>
              <th>결제 업체정보</th>
              <th>결제 예정 금액 (VAT 포함)</th>
              <th>진행사항</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expandedIds.has(row.id)
              return (
                <Fragment key={row.id}>
              <tr className={isExpanded ? 'payment-report-data-row is-expanded' : 'payment-report-data-row'}>
                <td className="payment-report-sticky payment-report-sticky--action">
                  <button
                    type="button"
                    className="payment-report-remove-btn"
                    onClick={() => handleRemoveRow(row.id)}
                    aria-label={`${row.seq}번 행 삭제`}
                  >
                    ×
                  </button>
                </td>
                <td className="payment-report-sticky payment-report-sticky--seq payment-report-cell--locked">
                  {row.seq}
                </td>
                <td className="payment-report-sticky payment-report-sticky--class">
                  <input
                    className="payment-report-cell-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={row.classification}
                    onChange={(e) => handleClassificationChange(row.id, e.target.value)}
                    onBlur={(e) => handleClassificationChange(row.id, e.target.value)}
                    aria-label={`${row.seq}번 분류`}
                  />
                  {row.matchStatus === 'matched' ? (
                    <span className="payment-report-row-hint payment-report-row-hint--ok">일치</span>
                  ) : null}
                  {row.matchStatus === 'missed' ? (
                    <span className="payment-report-row-hint payment-report-row-hint--warn">없음</span>
                  ) : null}
                </td>
                <td className="payment-report-sticky payment-report-sticky--project payment-report-cell--locked">
                  <span className="payment-report-locked-text payment-report-locked-text--wrap">
                    {row.projectName || '—'}
                  </span>
                </td>
                <td className="payment-report-sticky payment-report-sticky--amount payment-report-cell--locked payment-report-cell--amount">
                  {row.contractAmount || '—'}
                </td>
                <td className="payment-report-sticky payment-report-sticky--period payment-report-cell--locked">
                  <span className="payment-report-locked-text" title={row.projectPeriod || undefined}>
                    {row.projectPeriod || '—'}
                  </span>
                </td>
                <td className="payment-report-sticky payment-report-sticky--client payment-report-cell--locked">
                  <span className="payment-report-locked-text" title={row.client || undefined}>
                    {row.client || '—'}
                  </span>
                </td>
                <td className="payment-report-sticky payment-report-sticky--detail payment-report-sticky--last payment-report-col-detail">
                  <button
                    type="button"
                    className={`payment-report-detail-btn${isExpanded ? ' is-open' : ''}`}
                    aria-expanded={isExpanded}
                    aria-controls={`payment-report-detail-${row.id}`}
                    onClick={() => toggleRowExpand(row.id)}
                  >
                    세부사항
                  </button>
                </td>
                <td>
                  <input
                    className="payment-report-cell-input"
                    type="text"
                    autoComplete="off"
                    placeholder="업체명"
                    value={row.vendorInfo}
                    onChange={(e) => handleEditableChange(row.id, 'vendorInfo', e.target.value)}
                    aria-label={`${row.seq}번 결제 업체정보`}
                  />
                </td>
                <td>
                  <input
                    className="payment-report-cell-input payment-report-cell-input--amount"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={row.plannedAmount}
                    onChange={(e) => handleEditableChange(row.id, 'plannedAmount', e.target.value)}
                    aria-label={`${row.seq}번 결제 예정 금액`}
                  />
                </td>
                <td>
                  <input
                    className="payment-report-cell-input"
                    type="text"
                    autoComplete="off"
                    placeholder="진행사항"
                    value={row.progress}
                    onChange={(e) => handleEditableChange(row.id, 'progress', e.target.value)}
                    aria-label={`${row.seq}번 진행사항`}
                  />
                </td>
              </tr>
              <tr className={`payment-report-expand-row${isExpanded ? ' is-open' : ''}`}>
                <td colSpan={PAYMENT_REPORT_TABLE_COL_COUNT}>
                  <div className="payment-report-expand-inner">
                    <div
                      id={`payment-report-detail-${row.id}`}
                      className="payment-report-expand-body"
                    >
                      <PaymentReportExpandedPanel row={row} onChange={handleEditableChange} />
                    </div>
                  </div>
                </td>
              </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
