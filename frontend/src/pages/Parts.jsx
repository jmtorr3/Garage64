import { useEffect, useState } from 'react'
import { api } from '../api'

const s = {
  heading: { fontSize: '1.2rem', marginBottom: '1.5rem', color: '#f90' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' },
  card: { background: '#1e1e1e', border: '1px solid #333', borderRadius: '6px', padding: '1rem' },
  cardTitle: { fontWeight: 'bold', marginBottom: '4px', color: '#fff' },
  path: { fontSize: '0.75rem', color: '#666', marginBottom: '0.75rem', wordBreak: 'break-all' },
  btn: { fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', marginRight: '6px' },
  btnDanger: { background: '#500', borderColor: '#900' },
  form: { background: '#1a1a1a', border: '1px solid #444', borderRadius: '6px', padding: '1.25rem', marginBottom: '2rem' },
  formTitle: { fontWeight: 'bold', marginBottom: '1rem', color: '#f90' },
  row: { marginBottom: '0.75rem' },
  label: { display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '3px' },
  input: { width: '100%', padding: '6px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace' },
  textarea: { width: '100%', padding: '6px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace', minHeight: '120px', resize: 'vertical' },
  error: { color: '#f66', fontSize: '0.85rem', margin: '0.5rem 0' },
  jsonErr: { color: '#f66', fontSize: '0.75rem' },
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

      <div style={s.grid}>
        {parts.map(p => (
          <div key={p.id} style={s.card}>
            <div style={s.cardTitle}>{p.name}</div>
            <div style={s.path}>{p.jpm_path}</div>
            <button style={s.btn} onClick={() => openEdit(p)}>Edit</button>
            <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => del(p.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
