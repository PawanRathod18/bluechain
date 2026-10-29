import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatNumber } from '../api'
import { Badge, CountUp } from '../components/ui'
import { useAuth } from '../auth'

const STEPS = [
  { n: '01', t: 'Register the boundary', d: 'Draw the polygon on satellite imagery or upload GeoJSON. Area is computed geodesically on WGS 84, not from a flat projection.' },
  { n: '02', t: 'Model the carbon', d: 'Sentinel-2 NDVI gates the mangrove mask; GEDI rh100 gives structure; AGB and AGC are computed per cell with every parameter recorded.' },
  { n: '03', t: 'Verify the evidence', d: 'A verifier reviews the rasters, statistics, sensitivity and hash record, then records a decision with a note.' },
  { n: '04', t: 'Issue and track', d: 'A verified project can mint an ERC-721 credit. Retirement is soulbound, so the audit trail survives the asset.' },
]

export default function Home() {
  const { user, isVerifier } = useAuth()
  const [stats, setStats] = useState(null)
  const [projects, setProjects] = useState([])

  useEffect(() => {
    if (!user) { setStats(null); setProjects([]); return undefined }
    let cancelled = false
    Promise.all([
      api.get('/api/stats').catch(() => null),
      api.get('/api/projects').catch(() => []),
    ]).then(([s, p]) => {
      if (cancelled) return
      setStats(s)
      setProjects(p)
    })
    return () => { cancelled = true }
  }, [user])

  const hasAnalysis = (stats?.total_modelled_tc ?? 0) > 0
  const agc = hasAnalysis ? stats.total_modelled_tc : 443164.99
  const ha = hasAnalysis ? stats.total_mapped_ha : 157932.43
  const verified = stats?.verified_projects ?? 0
  const recent = projects.slice(0, 5)
  // Before anyone runs an analysis the workspace totals are zero; show the study's
  // published figures instead so the page still communicates the scale.
  const published = !hasAnalysis

  return (
    <>
      <section className="home-hero">
        <div>
          <div className="home-chip"><span className="dot" />Sundarbans · 2023 · Sentinel-2 + GEDI</div>
          <h1 className="home-h1">
            Blue carbon you can<br /><em>trace from pixel to token.</em>
          </h1>
          <p className="home-lede">
            BlueChain is the measurement, reporting and verification layer for mangrove carbon.
            Every hectare, equation and parameter is recorded — and modelled stock, verified
            quantity and issued asset are never confused for one another.
          </p>
          <div className="home-cta">
            <Link className="btn btn-primary" to="/projects/new">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Register a project
            </Link>
            <Link className="btn" to={isVerifier ? '/verifier' : '/projects'}>
              {isVerifier ? 'Open verifier queue' : 'Browse projects'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>

          <div className="home-trust">
            <div>MODEL<b>AGB = H × NDVI × 10.5</b></div>
            <div>CARBON<b>AGC = 0.47 × AGB</b></div>
            <div>MASK<b>NDVI &gt; 0.4</b></div>
            <div>CHAIN<b>ERC-721 · Localhost</b></div>
          </div>
        </div>

        <div className="ev-card">
          <div className="ev-head"><span className="dot" />Evidence record · schema 1.0</div>
          <div className="ev-body">
            <div className="ev-big">
              <CountUp value={agc} digits={2} /><span className="unit">t C</span>
            </div>
            <div className="ev-cap">
              {hasAnalysis
                ? `Across ${formatNumber(ha, 2)} ha mapped in your workspace`
                : 'Published result for the Sundarbans study footprint'}
            </div>
            <div className="ev-row"><span className="k">Analytical AOI</span><span className="v">88.10–89.10°E / 21.50–22.35°N</span></div>
            <div className="ev-row"><span className="k">Mapped extent</span><span className="v">{formatNumber(ha, 2)} ha</span></div>
            <div className="ev-row"><span className="k">Verified projects</span><span className="v">{verified}</span></div>
            <div className="ev-row"><span className="k">Validation</span><span className="v" style={{ color: 'var(--amber)' }}>Not field-validated</span></div>
            <div className="ev-hash">record_digest · 0x7f3e9b21c4a8d05e…b93a</div>
          </div>
        </div>
      </section>

      {!user && (
        <div className="stat-grid" style={{ marginTop: 34 }}>
          <div className="stat">
            <div className="stat-label">Mapped mangrove extent</div>
            <div className="stat-value green">157,932.43<span className="stat-unit">ha</span></div>
            <div className="stat-note">Published study result</div>
          </div>
          <div className="stat">
            <div className="stat-label">Total modelled AGC</div>
            <div className="stat-value green">443,164.99<span className="stat-unit">t C</span></div>
            <div className="stat-note">Published study result</div>
          </div>
          <div className="stat">
            <div className="stat-label">Mangrove-cell proportion</div>
            <div className="stat-value dim">51.4668<span className="stat-unit">%</span></div>
            <div className="stat-note">15,793,243 of 30,686,250 cells</div>
          </div>
          <div className="stat">
            <div className="stat-label">InVEST baseline</div>
            <div className="stat-value dim">409,383<span className="stat-unit">t C</span></div>
            <div className="stat-note">Separate, non-equivalent model</div>
          </div>
        </div>
      )}

      {user && (
      <div className="stat-grid" style={{ marginTop: 34 }}>
        <div className="stat">
          <div className="stat-label">Projects in workspace</div>
          <div className="stat-value green">{stats?.total_projects ?? '—'}</div>
          <div className="stat-note">{stats?.pending_verification ?? 0} awaiting review</div>
        </div>
        <div className="stat">
          <div className="stat-label">Modelled AGC</div>
          <div className="stat-value green">
            {formatNumber(agc, 2)}<span className="stat-unit">t C</span>
          </div>
          <div className="stat-note">
            {published ? 'Published reference result (paper)' : 'Sum of completed analyses'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Mapped extent</div>
          <div className="stat-value dim">
            {formatNumber(ha, 2)}<span className="stat-unit">ha</span>
          </div>
          <div className="stat-note">
            {published ? 'Published reference result (paper)' : 'Above the NDVI threshold'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Issued tonnes</div>
          <div className="stat-value dim">
            {formatNumber(stats?.total_issued_tonnes ?? 0, 2)}<span className="stat-unit">t C</span>
          </div>
          <div className="stat-note">{stats?.issued_projects ?? 0} tokenised project(s)</div>
        </div>
      </div>
      )}

      <div className="hsec">
        <div>
          <h2>How a project becomes an asset</h2>
          <p>Four steps, each one leaving a hash behind so the number can be traced back to the raster it came from.</p>
        </div>
        <Link className="btn btn-sm" to="/research">Read the method</Link>
      </div>

      <div className="steps">
        {STEPS.map((s) => (
          <div className="step" key={s.n}>
            <div className="step-n">{s.n}</div>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>

      <div className="hsec">
        <div>
          <h2>Three quantities, never merged</h2>
          <p>The framework's central discipline: a model output is not a verified quantity, and a verified quantity is not a tradable asset.</p>
        </div>
      </div>

      <div className="triad">
        <div className="tri m">
          <div className="tri-top"><h3>Modelled</h3><span className="badge issued">MODELED</span></div>
          <p>Above-ground carbon computed from Sentinel-2 and GEDI with declared parameters. Reproducible, but not field-validated.</p>
        </div>
        <div className="tri v">
          <div className="tri-top"><h3>Verified</h3><span className="badge verified">VERIFIED</span></div>
          <p>A reviewer has examined the evidence record and recorded a decision. Internal quality control — not third-party certification.</p>
        </div>
        <div className="tri i">
          <div className="tri-top"><h3>Issued</h3><span className="badge pending">ISSUED</span></div>
          <p>An ERC-721 token bound to the project and its evidence digest. It is not proof of a market sale or legal ownership.</p>
        </div>
      </div>

      {user ? (
        <>
      <div className="hsec">
        <div>
          <h2>Recent projects</h2>
          <p>{user?.role === 'verifier' || user?.role === 'admin' ? 'All submissions across the workspace.' : 'Projects you own.'}</p>
        </div>
        <Link className="btn btn-sm" to="/projects">View all</Link>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingTop: 14 }}>
          {recent.length === 0 ? (
            <p className="muted" style={{ padding: '10px 0' }}>
              No projects yet. <Link className="link" to="/projects/new">Register your first boundary</Link>.
            </p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Project</th><th>Ecosystem</th><th className="num">Area (ha)</th>
                    <th className="num">Modelled AGC (t C)</th><th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="p-name">{p.name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {p.centroid_lat?.toFixed(4)}, {p.centroid_lon?.toFixed(4)}
                        </div>
                      </td>
                      <td>{p.ecosystem}</td>
                      <td className="num">{formatNumber(p.area_ha, 3)}</td>
                      <td className="num">
                        {p.latest_analysis ? formatNumber(p.latest_analysis.total_agc_tc, 2) : '—'}
                      </td>
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

        </>
      ) : (
        <div className="hsec">
          <div>
            <h2>Your workspace</h2>
            <p>Sign in to register a boundary, run the pipeline on your own rasters and follow a project through verification.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link className="btn btn-sm" to="/login">Sign in</Link>
            <Link className="btn btn-sm btn-primary" to="/register">Create account</Link>
          </div>
        </div>
      )}

      <div className="cta-band">
        <div>
          <h2>Start with a boundary</h2>
          <p>Register a block, run the pipeline on your own rasters, and get an evidence record you can defend line by line.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" to="/projects/new">Register a project</Link>
          <Link className="btn" to="/research">See the numbers</Link>
        </div>
      </div>

      <div className="foot">
        <div>BlueChain · PELAGIX framework · G H Raisoni University, Amravati</div>
        <div className="mono">Modelled values are not certified carbon credits</div>
      </div>
    </>
  )
}
