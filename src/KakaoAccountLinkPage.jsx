import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  approveKakaoLink,
  fetchKakaoEmployees,
  fetchKakaoLinked,
  fetchKakaoPending,
  fetchKakaoRejected,
  rejectKakaoLink,
  unlinkKakaoAccount,
} from './kakaoAuth.js'
import './KakaoAccountLinkPage.css'

function formatWhen(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function KakaoAccountLinkPage() {
  const [pending, setPending] = useState([])
  const [linked, setLinked] = useState([])
  const [rejected, setRejected] = useState([])
  const [employees, setEmployees] = useState([])
  const [selected, setSelected] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    const [pendingRows, linkedRows, rejectedRows, employeeRows] = await Promise.all([
      fetchKakaoPending(),
      fetchKakaoLinked(),
      fetchKakaoRejected(),
      fetchKakaoEmployees(),
    ])
    setPending(pendingRows)
    setLinked(linkedRows)
    setRejected(rejectedRows)
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

  const linkedAccountIds = useMemo(
    () => new Set(linked.map((row) => String(row.accountId || '').toLowerCase())),
    [linked],
  )

  const handleApprove = async (kakaoId) => {
    const accountId = selected[kakaoId] || ''
    if (!accountId) {
      setError('연동할 직원을 선택해 주세요.')
      return
    }
    setBusyKey(`approve:${kakaoId}`)
    setError('')
    setNotice('')
    try {
      const result = await approveKakaoLink(kakaoId, accountId)
      setNotice(`${result.displayName || '직원'} 계정에 연결했습니다.`)
      await load()
    } catch (approveError) {
      setError(approveError?.message || '연동 승인에 실패했습니다.')
    } finally {
      setBusyKey('')
    }
  }

  const handleReject = async (row) => {
    const name = row.nickname || '이 카카오 계정'
    if (!window.confirm(`${name}의 연동 요청을 거절할까요?`)) return
    setBusyKey(`reject:${row.kakaoId}`)
    setError('')
    setNotice('')
    try {
      await rejectKakaoLink(row.kakaoId)
      setNotice(`${name} 요청을 거절했습니다.`)
      await load()
    } catch (rejectError) {
      setError(rejectError?.message || '거절에 실패했습니다.')
    } finally {
      setBusyKey('')
    }
  }

  const handleUnlink = async (row) => {
    const name = row.displayName || '이 직원'
    if (!window.confirm(`${name} 계정의 카카오 연동을 해제할까요?`)) return
    setBusyKey(`unlink:${row.accountId}`)
    setError('')
    setNotice('')
    try {
      await unlinkKakaoAccount(row.accountId)
      setNotice(`${name} 계정의 카카오 연동을 해제했습니다.`)
      await load()
    } catch (unlinkError) {
      setError(unlinkError?.message || '연동 해제에 실패했습니다.')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <section className="stat-card kakao-link-page">
      <header className="kakao-link-page-head">
        <p>카카오 계정은 승인한 직원만 로그인할 수 있습니다. 거절한 계정이 다시 로그인하면 승인 대기로 돌아옵니다.</p>
      </header>
      {error ? <div className="kakao-link-page-error" role="alert">{error}</div> : null}
      {notice ? <div className="kakao-link-page-notice" role="status">{notice}</div> : null}
      {loading ? <p className="kakao-link-page-empty">불러오는 중...</p> : null}
      {!loading ? (
        <div className="kakao-link-page-sections">
          <section className="kakao-link-page-section" aria-labelledby="kakao-link-pending-title">
            <h2 id="kakao-link-pending-title">
              승인 대기
              <span className="kakao-link-page-count">{pending.length}</span>
            </h2>
            {pending.length === 0 ? (
          <p className="kakao-link-page-empty">대기 중인 카카오 계정이 없습니다.</p>
        ) : (
          <div className="kakao-link-page-table-wrap">
            <table className="kakao-link-page-table">
              <thead>
                <tr>
                  <th>카카오 닉네임</th>
                  <th>요청 시각</th>
                  <th>사내 직원</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.kakaoId}>
                    <td>
                      <div className="kakao-link-page-name">{row.nickname || '닉네임 없음'}</div>
                      <div className="kakao-link-page-id">{row.kakaoId}</div>
                    </td>
                    <td>{formatWhen(row.requestedAt) || '-'}</td>
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
                          <option
                            key={employee.accountId}
                            value={employee.accountId}
                            disabled={linkedAccountIds.has(String(employee.accountId || '').toLowerCase())}
                          >
                            {employee.displayName}
                            {linkedAccountIds.has(String(employee.accountId || '').toLowerCase()) ? ' (연결됨)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="kakao-link-page-actions">
                        <button
                          type="button"
                          className="primary-btn kakao-link-page-approve"
                          disabled={busyKey === `approve:${row.kakaoId}`}
                          onClick={() => handleApprove(row.kakaoId)}
                        >
                          {busyKey === `approve:${row.kakaoId}` ? '승인 중…' : '연동 승인'}
                        </button>
                        <button
                          type="button"
                          className="kakao-link-page-reject"
                          disabled={busyKey === `reject:${row.kakaoId}`}
                          onClick={() => handleReject(row)}
                        >
                          {busyKey === `reject:${row.kakaoId}` ? '거절 중…' : '거절'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </section>
          <section className="kakao-link-page-section" aria-labelledby="kakao-link-linked-title">
            <h2 id="kakao-link-linked-title">
              승인 완료
              <span className="kakao-link-page-count">{linked.length}</span>
            </h2>
            {linked.length === 0 ? (
          <p className="kakao-link-page-empty">연결된 직원이 없습니다.</p>
        ) : (
          <div className="kakao-link-page-table-wrap">
            <table className="kakao-link-page-table">
              <thead>
                <tr>
                  <th>직원</th>
                  <th>카카오 ID</th>
                  <th>간편 비밀번호</th>
                  <th>연결 시각</th>
                  <th>연동</th>
                </tr>
              </thead>
              <tbody>
                {linked.map((row) => (
                  <tr key={row.accountId}>
                    <td>
                      <div className="kakao-link-page-name">{row.displayName || row.accountId}</div>
                      <div className="kakao-link-page-id">{row.accountId}</div>
                    </td>
                    <td className="kakao-link-page-id">{row.kakaoId}</td>
                    <td className="kakao-link-page-pin">
                      {row.pin || '-'}
                    </td>
                    <td>{formatWhen(row.linkedAt) || '-'}</td>
                    <td>
                      {String(row.accountId || '').toLowerCase() === 'hy9039' ? (
                        <span className="kakao-link-page-protected">관리자 연동</span>
                      ) : (
                        <button
                          type="button"
                          className="kakao-link-page-unlink"
                          disabled={busyKey === `unlink:${row.accountId}`}
                          onClick={() => handleUnlink(row)}
                        >
                          {busyKey === `unlink:${row.accountId}` ? '해제 중…' : '연동 해제'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </section>
          <section className="kakao-link-page-section" aria-labelledby="kakao-link-rejected-title">
            <h2 id="kakao-link-rejected-title">
              반려
              <span className="kakao-link-page-count">{rejected.length}</span>
            </h2>
            {rejected.length === 0 ? (
          <p className="kakao-link-page-empty">거절된 카카오 계정이 없습니다.</p>
        ) : (
          <div className="kakao-link-page-table-wrap">
            <table className="kakao-link-page-table">
              <thead>
                <tr>
                  <th>카카오 닉네임</th>
                  <th>요청 시각</th>
                  <th>거절 시각</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map((row) => (
                  <tr key={row.kakaoId}>
                    <td>
                      <div className="kakao-link-page-name">{row.nickname || '닉네임 없음'}</div>
                      <div className="kakao-link-page-id">{row.kakaoId}</div>
                    </td>
                    <td>{formatWhen(row.requestedAt) || '-'}</td>
                    <td>{formatWhen(row.rejectedAt) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </section>
        </div>
      ) : null}
    </section>
  )
}
