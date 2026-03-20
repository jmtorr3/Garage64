import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import CemViewer from '../components/CemViewer'
import { useTheme } from '../ThemeContext'

function partToJem(part) {
  const meta = part.attachment_meta || {}
  const tex = (meta.textureFile || meta.texture || '').replace(/^minecraft:/, '')
  const outerModel = { ...meta, submodels: [part.part_data] }
  delete outerModel.model
  return {
    ...(tex ? { texture: tex } : {}),
    textureSize: meta.textureSize || [64, 32],
    models: [outerModel],
  }
}

function getBodyName(part) {
  const m = part.jpm_path?.match(/optifine\/cem\/([^/]+)/)
  return m ? m[1] : 'other'
}

const XP_BTN = { padding: '3px 10px', cursor: 'pointer', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', fontWeight: 'bold' }
const XP_TITLE = { background: 'var(--bg-title)', color: 'var(--clr-text-on-title)', padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase' }

const PART_TYPES = [
  { id: 'wheels',     label: 'Wheels',     keywords: ['wheel'] },
  { id: 'headlights', label: 'Headlights', keywords: ['headlight', 'light'] },
  { id: 'custom',     label: 'Custom',     keywords: [] },
]

export default function PartsLibrary() {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const bg = isDark ? '#1e1e1e' : '#ece9d8'

  const [parts,   setParts]   = useState([])
  const [bodies,  setBodies]  = useState([])
  const [variants, setVariants] = useState([])
  const [picker,  setPicker]  = useState(null)   // bodyName or null
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    api.getParts().then(setParts)
    api.getBodies().then(setBodies)
    api.getVariants().then(setVariants)
  }, [])

  // Group parts by body name derived from jpm_path
  const grouped = {}
  for (const p of parts) {
    const key = getBodyName(p)
    ;(grouped[key] = grouped[key] || []).push(p)
  }
  // Ensure every known body appears even if it has no parts yet
  for (const b of bodies) {
    if (!grouped[b.name]) grouped[b.name] = []
  }

  const sections = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))

  async function deletePart(id) {
    await api.deletePart(id)
    setParts(ps => ps.filter(p => p.id !== id))
    setConfirmId(null)
  }

  function findPreset(bodyName, type) {
    const kws = PART_TYPES.find(t => t.id === type)?.keywords || []
    if (!kws.length) return null
    // prefer a part from the same body, fall back to any part
    const candidates = [
      ...parts.filter(p => getBodyName(p) === bodyName),
      ...parts,
    ]
    return candidates.find(p => kws.some(kw => p.name.toLowerCase().includes(kw))) ?? null
  }

  function launchCreate(bodyName, type) {
    const body      = bodies.find(b => b.name === bodyName)
    const preset    = findPreset(bodyName, type)
    // Find a variant for this body so Studio loads the right context
    const variant   = variants.find(v => v.body_name === bodyName)
    const params    = new URLSearchParams()
    if (variant)  params.set('variantId',   String(variant.id))
    if (body)     params.set('bodyId',      String(body.id))
    if (preset)   params.set('presetPartId', String(preset.id))
    params.set('newPart', '1')
    navigate(`/studio?${params}`)
    setPicker(null)
  }

  return (
    <div style={{ padding: '12px 16px', fontFamily: 'Monocraft, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <button style={{ ...XP_BTN, fontSize: '10px' }} onClick={() => navigate('/gallery')}>← Garage</button>
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--clr-accent)', letterSpacing: '0.04em' }}>Parts Library</span>
      </div>

      {sections.map(([bodyName, bodyParts]) => (
        <div key={bodyName} style={{ marginBottom: '20px' }}>

          {/* Body header */}
          <div style={{ ...XP_TITLE, display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ flex: 1 }}>{bodyName}</span>
            <button
              style={{ ...XP_BTN, fontSize: '10px', marginLeft: '8px', background: 'var(--bg-btn-primary)', color: '#fff', borderColor: 'var(--bdr-btn-primary-lt)' }}
              onClick={() => setPicker(picker === bodyName ? null : bodyName)}
            >
              + Create Part
            </button>
          </div>

          {/* Type picker */}
          {picker === bodyName && (
            <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', marginBottom: '8px', background: 'var(--bg-panel)', border: '1px solid var(--bdr-dk)' }}>
              <span style={{ fontSize: '10px', color: 'var(--clr-text-dim)', alignSelf: 'center', marginRight: '4px' }}>Select type:</span>
              {PART_TYPES.map(t => (
                <button
                  key={t.id}
                  style={{ ...XP_BTN, fontSize: '11px' }}
                  onClick={() => launchCreate(bodyName, t.id)}
                >
                  {t.id === 'wheels' ? '⚙ Wheels' : t.id === 'headlights' ? '💡 Headlights' : '✦ Custom'}
                </button>
              ))}
              <button style={{ ...XP_BTN, marginLeft: 'auto', fontSize: '10px' }} onClick={() => setPicker(null)}>✕</button>
            </div>
          )}

          {/* Parts grid */}
          {bodyParts.length === 0 ? (
            <div style={{ padding: '10px 4px', fontSize: '10px', color: 'var(--clr-text-dim)' }}>No parts yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
              {bodyParts.map(p => (
                <div key={p.id} style={{ background: 'var(--bg-window)', borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: '150px', background: bg, flexShrink: 0 }}>
                    <CemViewer jem={partToJem(p)} showGrid={false} showAxes={false} autoRotate bgColor={bg} />
                  </div>
                  <div style={{ padding: '7px 9px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: 'var(--clr-text)' }}>{p.name}</div>
                    <div style={{ fontSize: '9px', color: 'var(--clr-text-dim)', marginBottom: '7px', wordBreak: 'break-all' }}>{p.jpm_path}</div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        style={{ ...XP_BTN, fontSize: '10px' }}
                        onClick={() => {
                          const variant = variants.find(v => v.body_name === bodyName)
                          const body    = bodies.find(b => b.name === bodyName)
                          const params  = new URLSearchParams()
                          if (variant) params.set('variantId', String(variant.id))
                          if (body)    params.set('bodyId',    String(body.id))
                          params.set('presetPartId', String(p.id))
                          params.set('newPart', '1')
                          navigate(`/studio?${params}`)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        style={{ ...XP_BTN, fontSize: '10px', background: 'var(--bg-btn-danger)', color: '#fff' }}
                        onClick={() => setConfirmId(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {confirmId !== null && (() => {
        const part = parts.find(p => p.id === confirmId)
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--bg-window)', borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)', padding: '20px 24px', minWidth: '280px', fontFamily: 'Monocraft, sans-serif' }}>
              <div style={{ ...XP_TITLE, marginBottom: '14px' }}>Confirm Delete</div>
              <div style={{ fontSize: '11px', color: 'var(--clr-text)', marginBottom: '16px', lineHeight: '1.6' }}>
                Are you sure you want to delete<br />
                <span style={{ color: 'var(--clr-accent)', fontWeight: 'bold' }}>{part?.name}</span>?<br />
                This cannot be undone.
              </div>
              <button style={{ ...XP_BTN, background: 'var(--bg-btn-danger)', color: '#fff', marginRight: '8px' }} onClick={() => deletePart(confirmId)}>Delete</button>
              <button style={XP_BTN} onClick={() => setConfirmId(null)}>Cancel</button>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
