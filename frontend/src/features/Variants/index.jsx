import { useEffect, useState } from 'react'
import { api } from '../api'

const s = {
  heading: { fontSize: '1.2rem', marginBottom: '1.5rem', color: '#f90' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' },
  card: { background: '#1e1e1e', border: '1px solid #333', borderRadius: '6px', padding: '1rem' },
  cardTitle: { fontWeight: 'bold', marginBottom: '0.5rem', color: '#fff' },
  trigger: { fontSize: '0.8rem', color: '#888', marginBottom: '0.75rem' },
  partList: { listStyle: 'none', marginBottom: '0.75rem' },
  partItem: { fontSize: '0.8rem', color: '#6cf', padding: '2px 0' },
  btn: { fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', marginRight: '6px' },
  btnDanger: { background: '#500', borderColor: '#900' },
  form: { background: '#1a1a1a', border: '1px solid #444', borderRadius: '6px', padding: '1.25rem', marginBottom: '2rem' },
  formTitle: { fontWeight: 'bold', marginBottom: '1rem', color: '#f90' },
  row: { marginBottom: '0.75rem' },
  label: { display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '3px' },
  input: { width: '100%', padding: '6px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace' },
  checkRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '0.85rem' },
  error: { color: '#f66', fontSize: '0.85rem', margin: '0.5rem 0' },
}

const EMPTY_FORM = { file_name: '', trigger_name: '', body: '', order: 1, part_ids: [] }

export default function Variants() {
  const [variants, setVariants] = useState([])
  const [parts, setParts] = useState([])
  const [bodies, setBodies] = useState([])
  const [editing, setEditing] = useState(null)   // null = closed, 'new' or variant id
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getVariants().then(setVariants)
    api.getParts().then(setParts)
    api.getBodies().then(setBodies)
  }, [])

  function openNew() {
    setForm({ ...EMPTY_FORM, body: bodies[0]?.id ?? '' })
    setEditing('new')
    setError('')
  }

  function openEdit(v) {
    setForm({
      file_name: v.file_name,
      trigger_name: v.trigger_name,
      body: v.body_id ?? bodies.find(b => b.name === v.body_name)?.id ?? '',
      order: v.order,
      part_ids: v.variant_parts.map(vp => vp.part.id),
    })
    setEditing(v.id)
    setError('')
  }

  function togglePart(id) {
    setForm(f => ({
      ...f,
      part_ids: f.part_ids.includes(id)
        ? f.part_ids.filter(p => p !== id)
        : [...f.part_ids, id],
    }))
  }

  async function save() {
    setError('')
    try {
      const payload = { ...form }
      if (editing === 'new') {
        const created = await api.createVariant(payload)
        setVariants(vs => [...vs, created])
      } else {
        const updated = await api.updateVariant(editing, payload)
        setVariants(vs => vs.map(v => (v.id === editing ? updated : v)))
      }
      setEditing(null)
      // Refresh to get populated variant_parts
      api.getVariants().then(setVariants)
    } catch (e) {
      setError(e.message)
    }
  }

  async function del(id) {
    if (!confirm('Delete this variant?')) return
    await api.deleteVariant(id)
    setVariants(vs => vs.filter(v => v.id !== id))
  }

  return (
    <div>
      <h1 style={s.heading}>Variants</h1>

      {editing !== null && (
        <div style={s.form}>
          <div style={s.formTitle}>{editing === 'new' ? 'New Variant' : 'Edit Variant'}</div>

          <div style={s.row}>
            <label style={s.label}>File name (no extension)</label>
            <input style={s.input} value={form.file_name} onChange={e => setForm(f => ({ ...f, file_name: e.target.value }))} placeholder="oak_boat2" />
          </div>

          <div style={s.row}>
            <label style={s.label}>Trigger name (blank = default)</label>
            <input style={s.input} value={form.trigger_name} onChange={e => setForm(f => ({ ...f, trigger_name: e.target.value }))} placeholder="Duce" />
          </div>

          <div style={s.row}>
            <label style={s.label}>Body</label>
            <select style={s.input} value={form.body} onChange={e => setForm(f => ({ ...f, body: Number(e.target.value) }))}>
              {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div style={s.row}>
            <label style={s.label}>Order (in .properties file)</label>
            <input style={{ ...s.input, width: '80px' }} type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} />
          </div>

          <div style={s.row}>
            <label style={s.label}>Parts attached</label>
            {parts.map(p => (
              <div key={p.id} style={s.checkRow}>
                <input type="checkbox" checked={form.part_ids.includes(p.id)} onChange={() => togglePart(p.id)} />
                <span>{p.name}</span>
              </div>
            ))}
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button style={s.btn} onClick={save}>Save</button>
          <button style={s.btn} onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}

      <button style={{ ...s.btn, marginBottom: '1rem' }} onClick={openNew}>+ New Variant</button>

      <div style={s.grid}>
        {variants.map(v => (
          <div key={v.id} style={s.card}>
            <div style={s.cardTitle}>{v.file_name}.jem</div>
            <div style={s.trigger}>
              {v.trigger_name ? `trigger: "${v.trigger_name}"` : 'default (no trigger)'}
              {' · '}{v.body_name}
            </div>
            <ul style={s.partList}>
              {v.variant_parts?.length
                ? v.variant_parts.map(vp => (
                    <li key={vp.id} style={s.partItem}>+ {vp.part.name}</li>
                  ))
                : <li style={{ ...s.partItem, color: '#555' }}>no extra parts</li>}
            </ul>
            <button style={s.btn} onClick={() => openEdit(v)}>Edit</button>
            <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => del(v.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
