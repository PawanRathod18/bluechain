import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatNumber } from '../api'
import { Alert, Badge, Empty, Stat } from '../components/ui'

export default function Verifier() {
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([api.get('/api/verifier/queue'), api.get('/api/verifier/stats')])
      .then(([q, s]) => { setQueue(q); setStats(s) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  if (error && !stats) {
    return (
      <Empty
        title="Verifier access required"
        hint="This workspace is available to accounts with the verifier role. Sign in as verifier@bluechain.dev (password BlueChain@123) to review submissions."
        action={<Link className="btn btn-primary" to="/projects">Back to projects</Link>}
      />
    )
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Verifier workspace</div>
        <h1>Verifier dashboard</h1>
        <p className="sub">Review submitted blue-carbon projects and record a decision against the evidence record.</p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="stat-grid">
        <Stat label="Total projects" value={stats?.total_projects ?? '—'} />
        <Stat label="Pending verification" value={stats?.pending_verification ?? '—'} tone="amber" />
        <Stat label="Verified projects" value={stats?.verified_projects ?? '—'} />
        <Stat label="Rejected projects" value={stats?.rejected_projects ?? '—'} tone="dim" />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div className="card-title">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <div>Submitted projects<div className="card-sub">Newest submissions first.</div></div>
          </div>
          <button className="btn btn-sm btn-green" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="card-pad" style={{ paddingTop: 14 }}>
          {queue.length === 0 ? (
            <Empty title="Nothing in the queue" hint="Projects appear here once a developer submits an analysed project for review." />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Project</th><th>Owner</th><th>Ecosystem</th><th className="num">Area</th>
                    <th className="num">Modelled AGC</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((p) => (
                    <tr key={p.id}>
                      <td className="p-name">{p.name}</td>
                      <td className="mono-sm">{p.owner_email}</td>
                      <td>{p.ecosystem}</td>
                      <td className="num">{formatNumber(p.area_ha, 3)} ha</td>
                      <td className="num">{p.latest_analysis ? formatNumber(p.latest_analysis.total_agc_tc, 2) : '—'}</td>
                      <td><Badge status={p.status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <Link className="btn btn-sm" to={`/verifier/${p.id}`}>Review</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
