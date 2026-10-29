import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { api, formatNumber } from '../api'

const DEMO = [
  [21.744353, 88.95759],
  [21.739578, 88.960928],
  [21.736477, 88.955788],
  [21.741252, 88.95245],
]

export function geodesicArea(latlngs) {
  if (latlngs.length < 3) return 0
  const R = 6378137
  let total = 0
  for (let i = 0; i < latlngs.length; i += 1) {
    const p1 = latlngs[i]
    const p2 = latlngs[(i + 1) % latlngs.length]
    total += ((p2.lng - p1.lng) * Math.PI / 180) *
      (2 + Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180))
  }
  return Math.abs((total * R * R) / 2)
}

function toGeoJSON(verts) {
  const ring = verts.map((v) => [Number(v.lng.toFixed(8)), Number(v.lat.toFixed(8))])
  if (ring.length) ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

export default function MapPicker({ onChange, initial }) {
  const mapEl = useRef(null)
  const mapObj = useRef(null)
  const polyRef = useRef(null)
  const lineRef = useRef(null)
  const marksRef = useRef([])
  const drawingRef = useRef(false)

  const [verts, setVerts] = useState(() =>
    (initial && initial.length ? initial : DEMO).map((p) => L.latLng(p[0], p[1])))
  const [drawing, setDrawing] = useState(false)
  const [ready, setReady] = useState(false)
  const [area, setArea] = useState(0)
  const [centroid, setCentroid] = useState(null)
  const [error, setError] = useState('')

  // initialise the map once
  useEffect(() => {
    if (mapObj.current || !mapEl.current) return
    const map = L.map(mapEl.current, { center: [21.740415, 88.956689], zoom: 13, zoomControl: true })
    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' })
    const labels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Labels © Esri' })
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '© OpenStreetMap contributors' })
    sat.addTo(map)
    labels.addTo(map)
    L.control.layers({ Satellite: sat, 'Street map': street }, { Labels: labels },
      { position: 'topright', collapsed: false }).addTo(map)

    map.on('click', (e) => {
      if (!drawingRef.current) return
      setVerts((prev) => [...prev, e.latlng])
    })
    map.on('dblclick', () => {
      if (!drawingRef.current) return
      setDrawing(false)
    })
    mapObj.current = map
    setReady(true)
    setTimeout(() => map.invalidateSize(), 120)
  }, [])

  // reflect drawing mode
  useEffect(() => {
    drawingRef.current = drawing
    const map = mapObj.current
    if (!map) return
    if (drawing) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
    const el = map.getContainer()
    el.style.cursor = drawing ? 'crosshair' : 'grab'
  }, [drawing])

  // redraw geometry
  useEffect(() => {
    const map = mapObj.current
    if (!map || !ready) return
    if (polyRef.current) { map.removeLayer(polyRef.current); polyRef.current = null }
    if (lineRef.current) { map.removeLayer(lineRef.current); lineRef.current = null }
    marksRef.current.forEach((m) => map.removeLayer(m))
    marksRef.current = verts.map((v) =>
      L.circleMarker(v, { radius: 5, color: '#4ade80', weight: 2, fillColor: '#0a1421', fillOpacity: 1 }).addTo(map))

    if (verts.length >= 3) {
      polyRef.current = L.polygon(verts, {
        color: '#4ade80', weight: 2, fillColor: '#22c55e', fillOpacity: 0.26,
      }).addTo(map)
    } else if (verts.length === 2) {
      lineRef.current = L.polyline(verts, { color: '#4ade80', weight: 2 }).addTo(map)
    }

  }, [verts, ready])

  // measure on the server (WGS 84 ellipsoid) so the map matches what is stored
  useEffect(() => {
    if (verts.length < 3) {
      setArea(0)
      setCentroid(null)
      setError('')
      onChange?.(null, 0, null, null)
      return undefined
    }
    const gj = toGeoJSON(verts)
    const timer = setTimeout(async () => {
      try {
        const r = await api.post('/api/geometry/measure', { boundary: gj })
        setArea(r.area_ha)
        setCentroid({ lat: r.centroid_lat, lon: r.centroid_lon })
        setError('')
        onChange?.(gj, r.area_ha, r.centroid_lat, r.centroid_lon)
      } catch (e) {
        setError(e.message)
        setArea(0)
        onChange?.(null, 0, null, null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [verts, onChange])

  const readFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const gj = JSON.parse(reader.result)
        const walk = (n) => {
          if (!n) return null
          if (n.type === 'FeatureCollection') {
            for (const f of n.features) { const r = walk(f); if (r) return r }
            return null
          }
          if (n.type === 'Feature') return walk(n.geometry)
          if (n.type === 'Polygon') return n.coordinates[0]
          if (n.type === 'MultiPolygon') return n.coordinates[0][0]
          return null
        }
        const ring = walk(gj)
        if (!ring || ring.length < 3) { alert('No polygon found in that file'); return }
        const next = ring.map((c) => L.latLng(c[1], c[0]))
        setVerts(next)
        mapObj.current?.fitBounds(L.latLngBounds(next).pad(0.4))
      } catch {
        alert('Could not parse that GeoJSON file')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div>
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
        <div ref={mapEl} style={{ height: 'clamp(340px, 48vh, 480px)', width: '100%', background: '#0b1a24' }} />
        <div style={{
          position: 'absolute', left: 12, bottom: 12, zIndex: 500, padding: '5px 11px',
          borderRadius: 999, background: 'rgba(7,14,23,.85)', border: '1px solid var(--border-2)',
          fontSize: 11.5, color: 'var(--text-2)', pointerEvents: 'none',
        }}>
          {drawing ? 'Click to add vertices · double-click to finish' : 'Drag to pan · scroll to zoom'}
        </div>
      </div>

      <div className="map-tools">
        <label className="btn" style={{ cursor: 'pointer' }}>
          Upload GeoJSON
          <input type="file" accept=".geojson,.json" onChange={readFile} hidden />
        </label>
        <button type="button" className={`btn ${drawing ? 'btn-green' : ''}`} onClick={() => setDrawing((d) => !d)}>
          {drawing ? 'Finish drawing' : 'Draw polygon'}
        </button>
        <button type="button" className="btn btn-danger" onClick={() => setVerts([])}>Clear</button>
        <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }}
          onClick={() => {
            const next = DEMO.map((p) => L.latLng(p[0], p[1]))
            setVerts(next)
            mapObj.current?.fitBounds(L.latLngBounds(next).pad(0.6))
          }}>
          Load demo boundary
        </button>
      </div>

      <div className="metric-row">
        <div className="metric">
          <div className="k">Calculated area</div>
          <div className="v">{area ? formatNumber(area, 2) : '—'}<small>ha</small></div>
        </div>
        <div className="metric">
          <div className="k">Latitude</div>
          <div className="v" style={{ fontSize: 16 }}>{centroid ? centroid.lat.toFixed(6) : '—'}</div>
        </div>
        <div className="metric">
          <div className="k">Longitude</div>
          <div className="v" style={{ fontSize: 16 }}>{centroid ? centroid.lon.toFixed(6) : '—'}</div>
        </div>
      </div>
      {error && <div className="alert error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  )
}
