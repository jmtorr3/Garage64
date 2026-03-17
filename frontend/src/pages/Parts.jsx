import { useEffect, useState } from 'react'
import { api } from '../api'
import CemViewer from '../components/CemViewer'

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

const XP_BTN    = { padding: '4px 14px', background: 'var(--bg-btn)', borderTop: '2px solid var(--bdr-btn-lt)', borderLeft: '2px solid var(--bdr-btn-lt)', borderRight: '2px solid var(--bdr-btn-dk)', borderBottom: '2px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }
const XP_INPUT  = { width: '100%', padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--clr-text)', borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', boxSizing: 'border-box' }
const XP_TITLE  = { background: 'var(--bg-title)', color: 'var(--clr-text-on-title)', padding: '3px 8px', fontSize: '11px', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif', letterSpacing: '0.04em' }

const s = {
  heading:   { fontSize: '13px', marginBottom: '1.25rem', color: 'var(--clr-accent)', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px' },
  card:      { background: 'var(--bg-window)', borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)', display: 'flex', flexDirection: 'column' },
  cardInfo:  { padding: '8px 10px' },
  viewer:    { height: '180px', background: '#1a1a2e', flexShrink: 0 },
  cardTitle: { fontWeight: 'bold', marginBottom: '3px', color: 'var(--clr-text)', fontFamily: 'Monocraft, sans-serif', fontSize: '12px' },
  path:      { fontSize: '10px', color: 'var(--clr-text-dim)', marginBottom: '8px', wordBreak: 'break-all', fontFamily: 'monospace' },
  btn:       { ...XP_BTN, marginRight: '6px' },
  btnDanger: { ...XP_BTN, background: 'var(--bg-btn-danger)', borderTop: '2px solid var(--bdr-btn-danger-lt)', borderLeft: '2px solid var(--bdr-btn-danger-lt)', borderRight: '2px solid var(--bdr-btn-danger-dk)', borderBottom: '2px solid var(--bdr-btn-danger-dk)', color: '#fff', marginRight: '6px' },
  form:      { background: 'var(--bg-panel)', borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)', padding: '12px', marginBottom: '1.5rem' },
  formTitle: { ...XP_TITLE, display: 'block', marginBottom: '10px' },
  row:       { marginBottom: '8px' },
  label:     { display: 'block', fontSize: '11px', color: 'var(--clr-text-dim)', marginBottom: '2px', fontFamily: 'Monocraft, sans-serif' },
  input:     XP_INPUT,
  textarea:  { ...XP_INPUT, minHeight: '120px', resize: 'vertical' },
  error:     { color: 'var(--clr-err)', fontSize: '11px', margin: '6px 0', fontFamily: 'Monocraft, sans-serif' },
  jsonErr:   { color: 'var(--clr-err)', fontSize: '10px', fontFamily: 'Monocraft, sans-serif' },
}

const EMPTY_FORM = {
  name: '',
  jpm_path: '',
  slot: '',
  part_data: '{}',
  attachment_meta: '{}',
}

export default function Parts() {
  const [parts, setParts] = useState([])
  const [slots, setSlots] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [jsonErrors, setJsonErrors] = useState({})

  useEffect(() => {
    api.getParts().then(setParts)
    api.getSlots().then(setSlots)
  }, [])

  function openNew() {
    setForm(EMPTY_FORM)
    setEditing('new')
    setError('')
    setJsonErrors({})
  }

  function openEdit(p) {
    setForm({
      name: p.name,
      jpm_path: p.jpm_path,
      slot: p.slot || '',
      part_data: JSON.stringify(p.part_data, null, 2),
      attachment_meta: JSON.stringify(p.attachment_meta, null, 2),
    })
    setEditing(p.id)
    setError('')
    setJsonErrors({})
  }

  function setJson(field, val) {
    setForm(f => ({ ...f, [field]: val }))
    try {
      JSON.parse(val)
      setJsonErrors(e => ({ ...e, [field]: null }))
    } catch {
      setJsonErrors(e => ({ ...e, [field]: 'Invalid JSON' }))
    }
  }

  async function save() {
    setError('')
    if (Object.values(jsonErrors).some(Boolean)) {
      setError('Fix JSON errors before saving.')
      return
    }
    try {
      const payload = {
        name: form.name,
        jpm_path: form.jpm_path,
        slot: form.slot,
        part_data: JSON.parse(form.part_data),
        attachment_meta: JSON.parse(form.attachment_meta),
      }
      if (editing === 'new') {
        const created = await api.createPart(payload)
        setParts(ps => [...ps, created])
      } else {
        const updated = await api.updatePart(editing, payload)
        setParts(ps => ps.map(p => (p.id === editing ? updated : p)))
      }
      setEditing(null)
    } catch (e) {
      setError(e.message)
    }
  }

  async function del(id) {
    if (!confirm('Delete this part?')) return
    await api.deletePart(id)
    setParts(ps => ps.filter(p => p.id !== id))
  }

  function getBaseModel(part) {
    const m = part.jpm_path.match(/optifine\/cem\/([^/]+)/)
    return m ? m[1] : 'other'
  }

  const grouped = Object.entries(
    parts.reduce((acc, p) => {
      const key = getBaseModel(p)
      ;(acc[key] = acc[key] || []).push(p)
      return acc
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div>
      <h1 style={s.heading}>Parts (JPM)</h1>

      {editing !== null && (
        <div style={s.form}>
          <div style={s.formTitle}>{editing === 'new' ? 'New Part' : 'Edit Part'}</div>

          <div style={s.row}>
            <label style={s.label}>Name</label>
            <input style={s.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="miata_duce_wheels" />
          </div>

          <div style={s.row}>
            <label style={s.label}>Slot</label>
            <select style={s.input} value={form.slot} onChange={e => setForm(f => ({ ...f, slot: e.target.value }))}>
              <option value="">(standalone — no slot)</option>
              {slots.map(sl => (
                <option key={sl.id} value={sl.name}>{sl.display_name}</option>
              ))}
            </select>
          </div>

          <div style={s.row}>
            <label style={s.label}>JPM path (minecraft: namespace)</label>
            <input style={s.input} value={form.jpm_path} onChange={e => setForm(f => ({ ...f, jpm_path: e.target.value }))} placeholder="minecraft:optifine/cem/miata/parts/xxx.jpm" />
          </div>

          <div style={s.row}>
            <label style={s.label}>Attachment meta (JEM wrapper, no "model" key)</label>
            <textarea style={s.textarea} value={form.attachment_meta} onChange={e => setJson('attachment_meta', e.target.value)} />
            {jsonErrors.attachment_meta && <span style={s.jsonErr}>{jsonErrors.attachment_meta}</span>}
          </div>

          <div style={s.row}>
            <label style={s.label}>Part data (JPM geometry JSON)</label>
            <textarea style={{ ...s.textarea, minHeight: '200px' }} value={form.part_data} onChange={e => setJson('part_data', e.target.value)} />
            {jsonErrors.part_data && <span style={s.jsonErr}>{jsonErrors.part_data}</span>}
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button style={s.btn} onClick={save}>Save</button>
          <button style={s.btn} onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}

      <button style={{ ...s.btn, marginBottom: '1rem' }} onClick={openNew}>+ New Part</button>

      {grouped.map(([model, modelParts]) => (
        <div key={model} style={{ marginBottom: '1.5rem' }}>
          <div style={{ ...XP_TITLE, marginBottom: '8px', display: 'inline-block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{model}</div>
          <div style={s.grid}>
            {modelParts.map(p => (
              <div key={p.id} style={s.card}>
                <div style={s.viewer}>
                  <CemViewer jem={partToJem(p)} showGrid={false} showAxes={false} autoRotate />
                </div>
                <div style={s.cardInfo}>
                  <div style={s.cardTitle}>{p.name}</div>
                  <div style={s.path}>{p.jpm_path}</div>
                  <button style={s.btn} onClick={() => openEdit(p)}>Edit</button>
                  <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => del(p.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
