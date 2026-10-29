import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fileUrl, formatNumber } from '../api'
import { Alert, Badge, JsonView, Stat, Tabs } from '../components/ui'
import MintPanel from '../components/MintPanel'

const STAGES = ['DRAFT', 'MODELED', 'QC', 'VERIFIED', 'ISSUED', 'TRANSFERRED', 'RETIRED']

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [baselines, setBaselines] = useState([])
  const [sensitivity, setSensitivity] = useState(null)
  const [provenance, setProvenance] = useState(null)
  const [tab, setTab] = useState('overview')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState({ red: null, nir: null, gedi: null, threshold: '0.4', coefficient: '10.5', fraction: '0.47' })
  const [lulcForm, setLulcForm] = useState({ lulc: null, bio: null })

  const load = useCallback(async () => {
    try {
      const p = await api.get(`/api/projects/${id}`)
      setProject(p)
      const [a, b] = await Promise.all([
        p.latest_analysis ? api.get(`/api/projects/${id}/analysis/latest`).catch(() => null) : null,
        api.get(`/api/projects/${id}/invest`).catch(() => []),
      ])
      setAnalysis(a)
      setBaselines(b)
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (tab === 'sensitivity' && !sensitivity) {
      api.get(`/api/projects/${id}/sensitivity`).then(setSensitivity).catch(() => {})
    }
    if (tab === 'provenance' && !provenance) {
      api.get(`/api/projects/${id}/provenance`).then(setProvenance).catch(() => {})
    }
  }, [tab, id, sensitivity, provenance])

  const runDemo = async () => {
    setBusy('demo'); setError('')
    try {
      const a = await api.post(`/api/projects/${id}/analysis/demo`)
      setAnalysis(a); setSensitivity(null); setProvenance(null)
      await load()
      setTab('analysis')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const uploadAnalysis = async (e) => {
    e.preventDefault()
    if (!form.red || !form.nir) { setError('Select both the red (B4) and NIR (B8) GeoTIFFs'); return }
    setBusy('upload'); setError('')
    const fd = new FormData()
    fd.append('red', form.red)
    fd.append('nir', form.nir)
    if (form.gedi) fd.append('gedi', form.gedi)
    fd.append('ndvi_threshold', form.threshold)
    fd.append('agb_coefficient', form.coefficient)
    fd.append('carbon_fraction', form.fraction)
    try {
      const a = await api.upload(`/api/projects/${id}/analysis`, fd)
      setAnalysis(a); setSensitivity(null); setProvenance(null)
      await load()
      setTab('analysis')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const runInvestDemo = async () => {
    setBusy('invest'); setError('')
    try {
      await api.post(`/api/projects/${id}/invest/demo`)
      await load(); setTab('invest')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const uploadInvest = async (e) => {
    e.preventDefault()
    if (!lulcForm.lulc || !lulcForm.bio) { setError('Select both the LULC GeoTIFF and the biophysical CSV'); return }
    setBusy('invest'); setError('')
    const fd = new FormData()
    fd.append('lulc', lulcForm.lulc)
    fd.append('biophysical', lulcForm.bio)
    try {
      await api.upload(`/api/projects/${id}/invest`, fd)
      await load(); setTab('invest')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const submitForReview = async () => {
    setBusy('submit'); setError('')
    try {
      await api.post(`/api/projects/${id}/submit`)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const remove = async () => {
    if (!window.confirm('Delete this project and all of its analyses?')) return
    try {
      await api.del(`/api/projects/${id}`)
      navigate('/')
    } catch (e) { setError(e.message) }
  }

  if (!project) {
    return error ? <Alert kind="error">{error}</Alert> : <p className="muted">Loading project…</p>
  }

  const stats = analysis?.stats
  const canSubmit = ['DRAFT', 'MODELED', 'REJECTED'].includes(project.status) && analysis
  const stageIndex = STAGES.indexOf(project.status)

  return (
    <>
      <div className="page-head" style={{ maxWidth: '100%', marginBottom: 16 }}>
        <div className="eyebrow">Project · {project.ecosystem}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h1>{project.name}</h1>
          <Badge status={project.status} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {canSubmit && (
              <button className="btn btn-primary btn-sm" onClick={submitForReview} disabled={busy === 'submit'}>
                {busy === 'submit' ? 'Submitting…' : 'Submit for review'}
              </button>
            )}
            <button className="btn btn-sm btn-danger" onClick={remove}>Delete</button>
          </div>
        </div>
        <p className="sub mono" style={{ fontSize: 11.5 }}>
          {project.centroid_lat?.toFixed(6)}, {project.centroid_lon?.toFixed(6)} ·{' '}
          {formatNumber(project.area_ha, 3)} ha · {project.region}
        </p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {project.review_note && <Alert kind="info">Verifier note: {project.review_note}</Alert>}

      <div className="card card-pad" style={{ marginBottom: 4 }}>
        <div className="lifecycle">
          {STAGES.map((s, i) => (
            <div key={s} className={`lc ${i === stageIndex ? 'act' : ''}`}>{s}</div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          Only <span className="mono" style={{ color: 'var(--green-b)' }}>MODELED</span> is demonstrated by the analysis.
          Verification, issuance, transfer and retirement are recorded workflow states, not independent certification.
        </p>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'analysis', label: 'Carbon analysis' },
          { id: 'sensitivity', label: 'Sensitivity' },
          { id: 'invest', label: 'InVEST baseline' },
          { id: 'provenance', label: 'Provenance' },
          { id: 'asset', label: 'Asset / NFT' },
        ]}
      />

      {tab === 'overview' && (
        <div className="split">
          <div className="card card-pad">
            <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Project details</div>
            <div className="kv"><span className="k">Name</span><span className="v">{project.name}</span></div>
            <div className="kv"><span className="k">Ecosystem</span><span className="v">{project.ecosystem}</span></div>
            <div className="kv"><span className="k">Region</span><span className="v">{project.region}</span></div>
            <div className="kv"><span className="k">Area</span><span className="v">{formatNumber(project.area_ha, 4)} ha</span></div>
            <div className="kv"><span className="k">Centroid</span><span className="v mono" style={{ fontSize: 11 }}>
              {project.centroid_lat?.toFixed(6)}, {project.centroid_lon?.toFixed(6)}</span></div>
            <div className="kv"><span className="k">Owner</span><span className="v">{project.owner_email}</span></div>
            <div className="kv"><span className="k">Status</span><span className="v"><Badge status={project.status} /></span></div>
            <div className="kv"><span className="k">Description</span><span className="v">{project.description || '—'}</span></div>
            <div className="kv"><span className="k">Registered</span><span className="v">
              {new Date(project.created_at).toLocaleString()}</span></div>
          </div>

          <div>
            <div className="card card-pad">
              <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Modelled carbon</div>
              {stats ? (
                <>
                  <div className="carbon-row"><span className="k">Total modelled AGC</span>
                    <span className="v">{formatNumber(stats.total_agc_tc, 2)} t C</span></div>
                  <div className="carbon-row"><span className="k">Total modelled AGB</span>
                    <span className="v">{formatNumber(stats.total_agb_t, 2)} t</span></div>
                  <div className="carbon-row"><span className="k">Mapped mangrove area</span>
                    <span className="v">{formatNumber(stats.mapped_area_ha, 2)} ha</span></div>
                  <div className="carbon-row"><span className="k">Mean density</span>
                    <span className="v">{formatNumber(stats.mean_agc_density, 4)} t C/ha</span></div>
                </>
              ) : (
                <p className="muted">No analysis yet — open the Carbon analysis tab.</p>
              )}
            </div>
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Boundary</div>
              <JsonView data={project.boundary} maxHeight={180} />
            </div>
          </div>
        </div>
      )}

      {tab === 'analysis' && (
        <div>
          {!analysis && (
            <div className="grid-2">
              <div className="card card-pad">
                <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>Run the bundled demo dataset</div>
                <p className="muted" style={{ marginBottom: 14 }}>
                  Generates a synthetic Sentinel-2 / GEDI scene (320 × 320 cells) and runs the full
                  pipeline. The values are generated, not observed.
                </p>
                <button className="btn btn-primary" onClick={runDemo} disabled={busy === 'demo'}>
                  {busy === 'demo' ? 'Running pipeline…' : 'Run demo analysis'}
                </button>
              </div>
              <form className="card card-pad" onSubmit={uploadAnalysis}>
                <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Upload real rasters</div>
                <div className="field">
                  <label className="fld">Sentinel-2 B4 (red) GeoTIFF</label>
                  <input className="inp" type="file" accept=".tif,.tiff" onChange={(e) => setForm({ ...form, red: e.target.files[0] })} />
                </div>
                <div className="field">
                  <label className="fld">Sentinel-2 B8 (NIR) GeoTIFF</label>
                  <input className="inp" type="file" accept=".tif,.tiff" onChange={(e) => setForm({ ...form, nir: e.target.files[0] })} />
                </div>
                <div className="field">
                  <label className="fld">GEDI rh100 GeoTIFF (optional)</label>
                  <input className="inp" type="file" accept=".tif,.tiff" onChange={(e) => setForm({ ...form, gedi: e.target.files[0] })} />
                </div>
                <div className="row">
                  <div className="field"><label className="fld">NDVI threshold</label>
                    <input className="inp" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} /></div>
                  <div className="field"><label className="fld">AGB coefficient</label>
                    <input className="inp" value={form.coefficient} onChange={(e) => setForm({ ...form, coefficient: e.target.value })} /></div>
                  <div className="field"><label className="fld">Carbon fraction</label>
                    <input className="inp" value={form.fraction} onChange={(e) => setForm({ ...form, fraction: e.target.value })} /></div>
                </div>
                <button className="btn btn-primary" disabled={busy === 'upload'}>
                  {busy === 'upload' ? 'Processing rasters…' : 'Run carbon analysis'}
                </button>
              </form>
            </div>
          )}

          {analysis && (
            <>
              <div className="stat-grid">
                <Stat label="Total modelled AGC" value={stats.total_agc_tc} unit="t C" digits={2} />
                <Stat label="Mapped mangrove area" value={stats.mapped_area_ha} unit="ha" digits={2} tone="dim" />
                <Stat label="Mean AGC density" value={stats.mean_agc_density} unit="t C/ha" digits={4} />
                <Stat label="Standard deviation" value={stats.std_agc_density} unit="t C/ha" digits={4} tone="dim" />
              </div>

              <div className="card" style={{ marginTop: 18 }}>
                <div className="card-head">
                  <div className="card-title">
                    <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></svg></span>
                    <div>Carbon density visualization
                      <div className="card-sub">Pseudocolour raster of modelled AGC density (t C ha⁻¹).</div>
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={runDemo} disabled={busy === 'demo'}>
                    {busy === 'demo' ? 'Running…' : 'Recompute'}
                  </button>
                </div>
                <div className="card-pad">
                  {analysis.previews?.agc && (
                    <img className="preview-img" src={fileUrl(analysis.previews.agc)} alt="Modelled AGC density" />
                  )}
                  <div className="legend">
                    <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>Above-ground carbon density</span>
                    <span className="ramp" />
                    <span>Low</span><span>Medium</span><span>High</span>
                  </div>
                  <div className="grid-2" style={{ marginTop: 14 }}>
                    {analysis.previews?.ndvi && (
                      <div>
                        <img className="preview-img" src={fileUrl(analysis.previews.ndvi)} alt="NDVI" />
                        <p className="figcap">NDVI composite (B8, B4)</p>
                      </div>
                    )}
                    {analysis.previews?.mask && (
                      <div>
                        <img className="preview-img" src={fileUrl(analysis.previews.mask)} alt="Mangrove mask" />
                        <p className="figcap">Operational mangrove mask (NDVI &gt; {analysis.params.ndvi_threshold})</p>
                      </div>
                    )}
                  </div>
                  <div className="note" style={{ marginTop: 16 }}>
                    <span>
                      Modelled above-ground carbon, not a field-validated quantity and not a certified
                      carbon credit. {stats.decimated ? 'Statistics were computed on a decimated grid. ' : ''}
                      Downloads: {' '}
                      <a className="link" href={fileUrl(`/api/projects/${id}/analysis/${analysis.id}/download/agc`)}>AGC GeoTIFF</a>{' · '}
                      <a className="link" href={fileUrl(`/api/projects/${id}/analysis/${analysis.id}/download/ndvi`)}>NDVI</a>{' · '}
                      <a className="link" href={fileUrl(`/api/projects/${id}/analysis/${analysis.id}/download/mask`)}>mask</a>{' · '}
                      <a className="link" href={fileUrl(`/api/projects/${id}/analysis/${analysis.id}/download/height`)}>height</a>
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid-2" style={{ marginTop: 18 }}>
                <div className="card card-pad">
                  <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Full statistics</div>
                  {Object.entries({
                    'Total raster cells': formatNumber(stats.cells_total, 0),
                    'Mangrove cells': formatNumber(stats.cells_mangrove, 0),
                    'Mangrove proportion': `${stats.mangrove_proportion} %`,
                    'Mapped area': `${formatNumber(stats.mapped_area_ha, 2)} ha`,
                    'Median density': `${formatNumber(stats.median_agc_density, 4)} t C/ha`,
                    'Min / max density': `${formatNumber(stats.min_agc_density, 4)} / ${formatNumber(stats.max_agc_density, 4)}`,
                    'Total AGB': `${formatNumber(stats.total_agb_t, 2)} t`,
                    'Cell area convention': `${stats.cell_area_ha} ha`,
                  }).map(([k, v]) => (
                    <div className="carbon-row" key={k}>
                      <span className="k">{k}</span><span className="v">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="card card-pad">
                  <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Model &amp; support</div>
                  <div className="eq" style={{ fontSize: 12 }}>AGB = H × NDVI × {analysis.params.agb_coefficient}</div>
                  <div className="eq" style={{ fontSize: 12 }}>AGC = {analysis.params.carbon_fraction} × AGB</div>
                  <div className="carbon-row"><span className="k">GEDI observed cells</span>
                    <span className="v">{formatNumber(analysis.gedi_support.observed_cells, 0)}</span></div>
                  <div className="carbon-row"><span className="k">Gap-filled cells</span>
                    <span className="v">{formatNumber(analysis.gedi_support.gapfilled_cells, 0)}</span></div>
                  <div className="carbon-row"><span className="k">Observed fraction</span>
                    <span className="v">{(analysis.gedi_support.observed_fraction * 100).toFixed(1)} %</span></div>
                  <div className="carbon-row"><span className="k">CRS</span>
                    <span className="v">{analysis.footprint.crs}</span></div>
                  <div className="carbon-row"><span className="k">Grid</span>
                    <span className="v">{analysis.footprint.shape?.join(' × ')}</span></div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'sensitivity' && (
        <div className="card card-pad">
          <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Parameter sensitivity</div>
          {!sensitivity ? <p className="muted">Run a carbon analysis first.</p> : (
            <>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Scenario</th><th className="num">Total modelled AGC</th><th className="num">Difference</th></tr>
                  </thead>
                  <tbody>
                    {['lower', 'baseline', 'upper'].map((k) => {
                      const row = sensitivity[k]
                      return (
                        <tr key={k}>
                          <td className="p-name" style={{ textTransform: 'capitalize' }}>
                            {k} <span className="muted">(coef {row.coefficient}; fraction {row.fraction})</span>
                          </td>
                          <td className="num">{formatNumber(row.total_tc, 2)} t C</td>
                          <td className="num" style={{ color: row.delta_pct < 0 ? '#ff9b9b' : row.delta_pct > 0 ? 'var(--green-b)' : 'var(--text)' }}>
                            {row.delta_pct > 0 ? '+' : ''}{row.delta_pct.toFixed(2)} %
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="muted" style={{ margin: '18px 0 8px', fontSize: 12 }}>Full 3 × 3 grid</p>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>coef \\ fraction</th>
                      {sensitivity.fractions.map((f) => <th key={f} className="num">{f}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivity.coefficients.map((c) => (
                      <tr key={c}>
                        <td className="p-name">{c}</td>
                        {sensitivity.fractions.map((f) => {
                          const cell = sensitivity.grid.find((g) => g.coefficient === c && g.fraction === f)
                          return <td key={f} className="num">{cell ? formatNumber(cell.total_tc, 2) : '—'}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="note warn" style={{ marginTop: 14 }}><span>{sensitivity.note}</span></div>
            </>
          )}
        </div>
      )}

      {tab === 'invest' && (
        <div>
          {baselines.length === 0 ? (
            <div className="grid-2">
              <div className="card card-pad">
                <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>Run the demo LULC baseline</div>
                <p className="muted" style={{ marginBottom: 14 }}>
                  Class-based carbon storage from the bundled LULC raster and biophysical table.
                </p>
                <button className="btn btn-primary" onClick={runInvestDemo} disabled={busy === 'invest'}>
                  {busy === 'invest' ? 'Running…' : 'Run demo baseline'}
                </button>
              </div>
              <form className="card card-pad" onSubmit={uploadInvest}>
                <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Upload LULC + table</div>
                <div className="field"><label className="fld">LULC GeoTIFF</label>
                  <input className="inp" type="file" accept=".tif,.tiff" onChange={(e) => setLulcForm({ ...lulcForm, lulc: e.target.files[0] })} /></div>
                <div className="field"><label className="fld">Biophysical CSV (lucode, LULC_name, C_above, C_below, C_soil, C_dead)</label>
                  <input className="inp" type="file" accept=".csv" onChange={(e) => setLulcForm({ ...lulcForm, bio: e.target.files[0] })} /></div>
                <button className="btn btn-primary" disabled={busy === 'invest'}>Run baseline</button>
              </form>
            </div>
          ) : (
            <div className="grid-2">
              <div className="card card-pad">
                <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Baseline carbon storage</div>
                <div className="stat-value green" style={{ fontSize: 30 }}>
                  {formatNumber(baselines[0].total_tc, 2)}<span className="stat-unit">t C</span>
                </div>
                <p className="muted" style={{ marginTop: 8 }}>
                  Complementary LULC-based baseline — not directly equivalent to the GEE-derived AGC.
                </p>
                <div style={{ marginTop: 14 }}>
                  {Object.entries(baselines[0].pools || {}).map(([k, v]) => (
                    <div className="carbon-row" key={k}>
                      <span className="k">{k.replace(/_/g, ' ')}</span>
                      <span className="v">{formatNumber(v, 2)} t C</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card card-pad">
                <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Per-class breakdown</div>
                <div className="tbl-wrap">
                  <table className="tbl" style={{ minWidth: 380 }}>
                    <thead><tr><th>Class</th><th className="num">Area (ha)</th><th className="num">t C/ha</th><th className="num">Total (t C)</th></tr></thead>
                    <tbody>
                      {baselines[0].classes.map((c) => (
                        <tr key={c.lucode}>
                          <td className="p-name">{c.name}</td>
                          <td className="num">{formatNumber(c.area_ha, 2)}</td>
                          <td className="num">{formatNumber(c.density, 2)}</td>
                          <td className="num">{formatNumber(c.total_tc, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="figcap">Zero values indicate the supplied pool configuration, not ecological absence.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'provenance' && (
        <div className="grid-2">
          <div className="card card-pad">
            <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Evidence record</div>
            {provenance ? <JsonView data={provenance} maxHeight={520} /> : <p className="muted">Loading…</p>}
          </div>
          <div className="card card-pad">
            <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Event log</div>
            {provenance?.events?.length ? (
              <div className="timeline">
                {provenance.events.map((e, i) => (
                  <div className="tl-item" key={i}>
                    <span className="tl-dot" />
                    <div>
                      <div className="tl-kind">{e.kind.replace(/_/g, ' ')}</div>
                      <div className="tl-meta">{new Date(e.created_at).toLocaleString()} · {e.digest?.slice(0, 18)}…</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No events recorded.</p>}
          </div>
        </div>
      )}

      {tab === 'asset' && (
        <div className="card card-pad">
          <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Issue a carbon-credit token</div>
          {project.status !== 'VERIFIED' && project.status !== 'ISSUED' ? (
            <Alert kind="info">
              Only a <b>verified</b> project can issue tokens. Current status: {project.status}.
              {canSubmit && ' Submit the project for verifier review first.'}
            </Alert>
          ) : (
            <MintPanel project={project} analysis={analysis} onIssued={load} />
          )}
        </div>
      )}

      <div className="foot">
        <div><Link className="link" to="/projects">← Back to projects</Link></div>
        <div className="mono">Project #{project.id}</div>
      </div>
    </>
  )
}
