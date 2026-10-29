import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatNumber } from '../api'
import { Badge, Empty, Stat } from '../components/ui'
import { useAuth } from '../auth'

export default function Dashboard() {
  const { user, isVerifier } = useAuth()
  const [stats, setStats] = useState(null)
  const [projects, setProjects] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([api.get('/api/stats'), api.get('/api/projects')])
      .then(([s, p]) => { if (!cancelled) { setStats(s); setProjects(p) } })
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <div className="page-head" style={{ maxWidth: 900 }}>
        <div className="eyebrow">Workspace</div>
        <h1>Your projects</h1>
        <p className="sub">
          Every project you own, its latest modelled above-ground carbon, and where it sits in the
          verification lifecycle.
        </p>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="stat-grid">
        <Stat label="Total projects" value={stats?.total_projects ?? '—'} tone="green" />
        <Stat label="Pending verification" value={stats?.pending_verification ?? '—'} tone="amber" />
        <Stat label="Verified projects" value={stats?.verified_projects ?? '—'} tone="green" />
        <Stat label="Rejected projects" value={stats?.rejected_projects ?? '—'} tone="dim" />
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <Stat label="Total modelled AGC" value={stats?.total_modelled_tc ?? 0} unit="t C" tone="green" digits={2} />
        <Stat label="Mapped extent" value={stats?.total_mapped_ha ?? 0} unit="ha" tone="dim" digits={2} />
        <Stat label="Issued tonnes" value={stats?.total_issued_tonnes ?? 0} unit="t C" tone="dim" digits={2} />
        <Stat label="Issued assets" value={stats?.issued_projects ?? 0} tone="dim" />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div className="card-title">
            <span className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <div>
              All projects
              <div className="card-sub">Register a boundary, run the analysis, submit for review.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isVerifier && <Link className="btn btn-sm" to="/verifier">Verifier queue</Link>}
            <Link className="btn btn-sm btn-primary" to="/projects/new">New project</Link>
          </div>
        </div>
        <div className="card-pad" style={{ paddingTop: 14 }}>
          {projects.length === 0 ? (
            <Empty
              title="No projects yet"
              hint="Register your first blue-carbon project by drawing its boundary on the map."
              action={<Link className="btn btn-primary" to="/projects/new">Register a project</Link>}
            />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Project</th><th>Ecosystem</th><th className="num">Area (ha)</th>
                    <th className="num">Modelled AGC (t C)</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="p-name">{p.name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {p.centroid_lat?.toFixed(4)}, {p.centroid_lon?.toFixed(4)}
                        </div>
                      </td>
                      <td>{p.ecosystem}</td>
                      <td className="num">{formatNumber(p.area_ha, 3)}</td>
                      <td className="num">{p.latest_analysis ? formatNumber(p.latest_analysis.total_agc_tc, 2) : '—'}</td>
                      <td><Badge status={p.status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <Link className="btn-view" to={`/projects/${p.id}`}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="2.6" />
                          </svg>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="foot">
        <div>BlueChain · PELAGIX framework · G H Raisoni University, Amravati</div>
        <div className="mono">Modelled values are not certified carbon credits</div>
      </div>
    </>
  )
}
