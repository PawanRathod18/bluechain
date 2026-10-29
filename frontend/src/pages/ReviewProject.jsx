import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fileUrl, formatNumber } from '../api'
import { Alert, Badge, JsonView, Tabs } from '../components/ui'

export default function ReviewProject() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [provenance, setProvenance] = useState(null)
  const [tab, setTab] = useState('details')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState(null)

  const load = async () => {
    try {
      const p = await api.get(`/api/projects/${id}`)
      setProject(p)
      setAnalysis(p.latest_analysis
        ? await api.get(`/api/projects/${id}/analysis/latest`).catch(() => null)
        : null)
      setProvenance(await api.get(`/api/projects/${id}/provenance`).catch(() => null))
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { load() }, [id])

  const decide = async (decision) => {
    setBusy(decision); setError('')
    try {
      const p = await api.post(`/api/projects/${id}/decision`, { decision, note })
      setProject(p)
      setDone(decision)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  if (!project) return error ? <Alert kind="error">{error}</Alert> : <p className="muted">Loading…</p>

  const stats = analysis?.stats
  const reviewable = ['QC', 'MODELED', 'REJECTED'].includes(project.status)

  return (
    <>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Verifier review</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ color: 'var(--green-b)' }}>Project verification</h1>
          <Badge status={project.status} />
          <Link className="btn btn-sm" to="/verifier" style={{ marginLeft: 'auto' }}>← Queue</Link>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {done && (
        <Alert kind="ok">
          Decision recorded: {done === 'approve' ? 'approved' : done === 'reject' ? 'rejected' : 'changes requested — sent back to the developer'}.
        </Alert>
      )}

      <div className="pv-head">
        <div className="pv-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21c0-6 0-9 0-13" /><path d="M12 21c-4.5 0-8-3-8-7 4.5 0 8 2.6 8 7Z" /><path d="M12 15c0-3.9 3.1-7 7-7 0 4-3.1 7-7 7Z" />
          </svg>
        </div>
        <div>
          <div className="pv-name">{project.name}</div>
          <div className="pv-coord">{project.centroid_lat?.toFixed(6)}, {project.centroid_lon?.toFixed(6)}</div>
        </div>
        <div style={{ marginLeft: 'auto' }} className="muted">
          {formatNumber(project.area_ha, 3)} ha · {project.ecosystem}
        </div>
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'details', label: 'Project details' },
        { id: 'analysis', label: 'GEE analysis' },
        { id: 'invest', label: 'Provenance' },
        { id: 'decision', label: 'Decision' },
      ]} />

      {tab === 'details' && (
        <div className="grid-2">
          <div className="card card-pad">
            <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Project details</div>
            <div className="kv"><span className="k">Name</span><span className="v">{project.name}</span></div>
            <div className="kv"><span className="k">Owner</span><span className="v">{project.owner_email}</span></div>
            <div className="kv"><span className="k">Ecosystem</span><span className="v">{project.ecosystem}</span></div>
            <div className="kv"><span className="k">Region</span><span className="v">{project.region}</span></div>
            <div className="kv"><span className="k">Area</span><span className="v">{formatNumber(project.area_ha, 4)} ha</span></div>
            <div className="kv"><span className="k">Description</span><span className="v">{project.description || '—'}</span></div>
            <div className="kv"><span className="k">Status</span><span className="v"><Badge status={project.status} /></span></div>
          </div>
          <div className="card card-pad">
            <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Boundary</div>
            <JsonView data={project.boundary} maxHeight={260} />
          </div>
        </div>
      )}

      {tab === 'analysis' && (
        <div className="card card-pad">
          {!analysis ? <p className="muted">This project has no analysis to review.</p> : (
            <>
              <div className="stat-grid" style={{ marginBottom: 16 }}>
                <div className="stat"><div className="stat-label">Total modelled AGC</div>
                  <div className="stat-value green">{formatNumber(stats.total_agc_tc, 2)}<span className="stat-unit">t C</span></div></div>
                <div className="stat"><div className="stat-label">Mapped area</div>
                  <div className="stat-value dim">{formatNumber(stats.mapped_area_ha, 2)}<span className="stat-unit">ha</span></div></div>
                <div className="stat"><div className="stat-label">Mean density</div>
                  <div className="stat-value dim">{formatNumber(stats.mean_agc_density, 4)}<span className="stat-unit">t C/ha</span></div></div>
                <div className="stat"><div className="stat-label">GEDI observed</div>
                  <div className="stat-value dim">{(analysis.gedi_support.observed_fraction * 100).toFixed(1)}<span className="stat-unit">%</span></div></div>
              </div>
              {analysis.previews?.agc && <img className="preview-img" src={fileUrl(analysis.previews.agc)} alt="AGC density" />}
              <div className="note warn" style={{ marginTop: 14 }}>
                <span>No independent field validation is available for this project. The analysis is a model output, not a verified environmental quantity.</span>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'invest' && (
        <div className="card card-pad">
          <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Evidence record</div>
          {provenance ? <JsonView data={provenance} maxHeight={520} /> : <p className="muted">Loading…</p>}
        </div>
      )}

      {tab === 'decision' && (
        <div className="card card-pad">
          <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Reviewer decision</div>
          {!reviewable ? (
            <Alert kind="info">This project is {project.status} and is no longer awaiting review.</Alert>
          ) : (
            <>
              <div className="field">
                <label className="fld">Note (stored in the evidence record)</label>
                <textarea className="inp" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="What did you check, and what remains unverified?" />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-green" onClick={() => decide('approve')} disabled={!!busy}>
                  {busy === 'approve' ? 'Recording…' : 'Approve project'}
                </button>
                <button className="btn btn-amber" onClick={() => decide('request_info')} disabled={!!busy}>
                  {busy === 'request_info' ? 'Recording…' : 'Request changes'}
                </button>
                <button className="btn btn-danger" onClick={() => decide('reject')} disabled={!!busy}>
                  {busy === 'reject' ? 'Recording…' : 'Reject project'}
                </button>
              </div>
              <p className="muted" style={{ marginTop: 12, fontSize: 11.5 }}>
                Approve moves the project to VERIFIED and unlocks issuance. Request changes returns it
                to MODELED so the owner can fix the evidence and resubmit. Reject closes it. The note
                above is stored in the evidence record either way.
              </p>
              <p className="muted" style={{ marginTop: 14, fontSize: 11.5 }}>
                Approval records an internal QC decision. It is not independent third-party
                verification and does not certify a carbon credit.
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
