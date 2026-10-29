import { useEffect, useRef, useState } from 'react'
import { formatNumber } from '../api'

export function Stat({ label, value, unit, tone = 'green', note, digits = 0 }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone}`}>
        {typeof value === 'number' ? formatNumber(value, digits) : value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

export function Badge({ status }) {
  const map = {
    DRAFT: 'neutral', MODELED: 'issued', QC: 'pending', VERIFIED: 'verified',
    REJECTED: 'rejected', ISSUED: 'issued', TRANSFERRED: 'issued', RETIRED: 'neutral',
    ISSUED_ASSET: 'issued',
  }
  const cls = map[status] || 'neutral'
  const label = status === 'QC' ? 'Pending verification' : status.replace(/_/g, ' ').toLowerCase()
  return <span className={`badge ${cls}`} style={{ textTransform: 'capitalize' }}>{label}</span>
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${active === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Alert({ kind = 'info', children }) {
  return <div className={`alert ${kind}`}>{children}</div>
}

export function Spinner({ label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <span className="spinner" /> {label && <span className="muted">{label}</span>}
    </span>
  )
}

export function Empty({ title, hint, action }) {
  return (
    <div className="card card-pad" style={{ textAlign: 'center', padding: '44px 22px' }}>
      <h3 style={{ fontSize: 15, marginBottom: 8 }}>{title}</h3>
      <p className="muted" style={{ maxWidth: 460, margin: '0 auto 16px' }}>{hint}</p>
      {action}
    </div>
  )
}

/** Simple JSON viewer with copy. */
export function JsonView({ data, maxHeight = 340 }) {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(data, null, 2)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked */ }
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy JSON'}</button>
      </div>
      <pre className="json" style={{ maxHeight }}>{text}</pre>
    </div>
  )
}

/** Animated counter for hero metrics. */
export function CountUp({ value, digits = 2, suffix = '' }) {
  const [shown, setShown] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const target = Number(value) || 0
    const start = performance.now()
    const dur = 700
    let frame
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur)
      setShown(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <span ref={ref}>{formatNumber(shown, digits)}{suffix}</span>
}
