import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import CemViewer from '../components/CemViewer'

const s = {
  page:     { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', gap: '0' },
  toolbar:  { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 0', flexShrink: 0 },
  label:    { color: '#aaa', fontSize: '0.85rem' },
  select:   { padding: '6px 10px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9rem' },
  canvas:   { flex: 1, borderRadius: '6px', overflow: 'hidden', border: '1px solid #333' },
  error:    { color: '#f66', fontSize: '0.85rem', padding: '4px 0' },
  hint:     { color: '#555', fontSize: '0.8rem' },
  partBadge:{ display: 'inline-block', background: '#1a2a3a', border: '1px solid #2a4a6a', color: '#6cf', borderRadius: '3px', padding: '2px 7px', fontSize: '0.75rem', marginRight: '4px' },
}

export default function Viewer() {
  const navigate = useNavigate()
  const [variants, setVariants] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [jem, setJem] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getVariants().then((vs) => {
      setVariants(vs)
      if (vs.length) setSelectedId(vs[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setError('')
    setLoading(true)
    setJem(null)

    const variant = variants.find(v => v.id === selectedId)
    setSelectedVariant(variant || null)

    fetch(`/api/variants/${selectedId}/compiled_jem/`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      .then(data => { setJem(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [selectedId])

  return (
    <div style={s.page}>
      <div style={s.toolbar}>
        <span style={s.label}>Variant</span>
        <select
          style={s.select}
          value={selectedId ?? ''}
          onChange={e => setSelectedId(Number(e.target.value))}
        >
          {variants.map(v => (
            <option key={v.id} value={v.id}>
              {v.file_name}.jem{v.trigger_name ? ` — "${v.trigger_name}"` : ' (default)'}
            </option>
          ))}
        </select>

        {selectedVariant?.variant_parts?.length > 0 && (
          <span>
            {selectedVariant.variant_parts.map(vp => (
              <span key={vp.id} style={s.partBadge}>+{vp.part.name}</span>
            ))}
          </span>
        )}

        {loading && <span style={s.hint}>loading…</span>}
        {error && <span style={s.error}>{error}</span>}

        <span style={{ ...s.hint, marginLeft: 'auto' }}>
          drag to orbit · scroll to zoom · right-drag to pan
        </span>
        <button
          onClick={() => navigate('/gallery')}
          style={{ padding: '5px 14px', background: 'linear-gradient(180deg,#4590d6,#1060c4)', border: '1px solid #0a246a', borderRadius: '3px', color: '#fff', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
          Go to Garage
        </button>
      </div>

      <div style={s.canvas}>
        {jem && <CemViewer jem={jem} onError={setError} />}
      </div>
    </div>
  )
}
