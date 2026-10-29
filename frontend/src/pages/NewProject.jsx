import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import MapPicker from '../components/MapPicker'
import { Alert } from '../components/ui'

export default function NewProject() {
  const navigate = useNavigate()
  const [boundary, setBoundary] = useState(null)
  const [area, setArea] = useState(0)
  const [form, setForm] = useState({
    name: '', description: '', ecosystem: 'Mangrove', region: 'Sundarbans, West Bengal, India',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onBoundary = useCallback((gj, a) => { setBoundary(gj); setArea(a) }, [])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (!boundary) { setError('Draw or upload a project boundary first'); return }
    setBusy(true)
    setError('')
    try {
      const project = await api.post('/api/projects', { ...form, boundary })
      navigate(`/projects/${project.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Step 01 — Registration</div>
        <h1>Register project &amp; boundary</h1>
        <p className="sub">Draw the project polygon on the map or upload a GeoJSON boundary. Area is computed geodesically on WGS 84.</p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="split">
        <div className="card card-pad">
          <MapPicker onChange={onBoundary} />
        </div>

        <form className="card card-pad" onSubmit={submit}>
          <div className="card-title" style={{ fontSize: 14, marginBottom: 14 }}>Project metadata</div>
          <div className="field">
            <label className="fld" htmlFor="pname">Project name</label>
            <input id="pname" className="inp" required value={form.name} onChange={set('name')}
              placeholder="Sundarbans Block A" />
          </div>
          <div className="field">
            <label className="fld" htmlFor="peco">Ecosystem</label>
            <select id="peco" className="inp" value={form.ecosystem} onChange={set('ecosystem')}>
              <option>Mangrove</option><option>Seagrass</option><option>Salt marsh</option>
            </select>
          </div>
          <div className="field">
            <label className="fld" htmlFor="pdesc">Description</label>
            <textarea id="pdesc" className="inp" rows={3} value={form.description} onChange={set('description')}
              placeholder="What is being measured, and why" />
          </div>
          <div className="field">
            <label className="fld" htmlFor="pregion">Region</label>
            <input id="pregion" className="inp" value={form.region} onChange={set('region')} />
          </div>

          <div className="note" style={{ marginBottom: 14 }}>
            <span className="mono" style={{ color: 'var(--green-b)' }}>{area ? area.toFixed(2) : '0.00'} ha</span>
            <span style={{ marginLeft: 6 }}>registered boundary</span>
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !boundary}>
            {busy ? 'Registering…' : 'Register project'}
          </button>
        </form>
      </div>
    </>
  )
}
