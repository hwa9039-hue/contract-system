import { useCallback, useEffect, useState } from 'react'
import { approveKakaoLink, fetchKakaoEmployees, fetchKakaoPending } from './kakaoAuth.js'
import './KakaoAccountLinkPage.css'

export default function KakaoAccountLinkPage() {
  const [pending, setPending] = useState([])
  const [employees, setEmployees] = useState([])
  const [selected, setSelected] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    const [pendingRows, employeeRows] = await Promise.all([fetchKakaoPending(), fetchKakaoEmployees()])
    setPending(pendingRows)
    setEmployees(employeeRows)
    setSelected((prev) => {
      const next = {}
      for (const row of pendingRows) {
        const id = row.kakaoId
        if (prev[id]) next[id] = prev[id]
      }
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    load()
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || '목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  const handleApprove = async (kakaoId) => {
    const accountId = selected[kakaoId] || ''
    if (!accountId) {
      setError('연동할 직원을 선택해 주세요.')
      return
    }
    setBusyId(kakaoId)
    setError('')
    setNotice('')
    try {
      const result = await approveKakaoLink(kakaoId, accountId)
      setNotice(`${result.displayName || '직원'} 계정에 연결했습니다.`)
      await load()
    } catch (approveError) {
      setError(approveError?.message || '연동 승인에 실패했습니다.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="stat-card kakao-link-page">
      <header className="kakao-link-page-head">
        <h1>계정 연동 관리</h1>
        <p>대기 중인 카카오 계정을 사내 직원에게 연결합니다. 승인 후에만 로그인할 수 있습니다.</p>
      </header>
      {error ? <div className="kakao-link-page-error" role="alert">{error}</div> : null}
      {notice ? <div className="kakao-link-page-notice" role="status">{notice}</div> : null}
      {loading ? (
        <p className="kakao-link-page-empty">불러오는 중...</p>
      ) : pending.length === 0 ? (
        <p className="kakao-link-page-empty">대기 중인 카카오 계정이 없습니다.</p>
      ) : (
        <table className="kakao-link-page-table">
          <thead>
            <tr>
              <th>카카오 닉네임</th>
              <th>사내 직원</th>
              <th>승인</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((row) => (
              <tr key={row.kakaoId}>
                <td>
                  <div className="kakao-link-page-name">{row.nickname || '닉네임 없음'}</div>
                  <div className="kakao-link-page-id">{row.kakaoId}</div>
                </td>
                <td>
                  <select
                    className="kakao-link-page-select"
                    value={selected[row.kakaoId] || ''}
                    onChange={(event) =>
                      setSelected((prev) => ({ ...prev, [row.kakaoId]: event.target.value }))
                    }
                    aria-label={`${row.nickname || '카카오 계정'}에 연결할 직원`}
                  >
                    <option value="">직원 선택</option>
                    {employees.map((employee) => (
                      <option key={employee.accountId} value={employee.accountId}>
                        {employee.displayName}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="primary-btn kakao-link-page-approve"
                    disabled={busyId === row.kakaoId}
                    onClick={() => handleApprove(row.kakaoId)}
                  >
                    {busyId === row.kakaoId ? '승인 중…' : '연동 승인'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
