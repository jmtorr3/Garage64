import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import CemViewer from '../components/CemViewer'

const s = {
  page:        { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' },
  topBar:      { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 0', flexShrink: 0, borderBottom: '1px solid #222' },
  body:        { flex: 1, display: 'flex', gap: '1rem', overflow: 'hidden', paddingTop: '0.75rem' },
  sidebar:     { width: '230px', flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  canvas:      { flex: 1, borderRadius: '6px', border: '1px solid #333', overflow: 'hidden' },
  slotBox:     { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '6px', overflow: 'hidden' },
  slotHeader:  { display: 'flex', alignItems: 'center', padding: '6px 10px', background: '#1e1e1e', borderBottom: '1px solid #2a2a2a' },
  slotTitle:   { flex: 1, fontSize: '0.8rem', fontWeight: 'bold', color: '#f90', textTransform: 'uppercase', letterSpacing: '0.05em' },
  slotBody:    { padding: '6px 10px' },
  radioRow:    { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', cursor: 'pointer', userSelect: 'none' },
  radioActive: { fontSize: '0.85rem', color: '#fff' },
  radioInact:  { fontSize: '0.85rem', color: '#555' },
  emptySlot:   { fontSize: '0.75rem', color: '#444', padding: '4px 0' },
  saveBar:     { flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', padding: '0.6rem 0', borderTop: '1px solid #222' },
  label:       { color: '#888', fontSize: '0.82rem' },
  input:       { padding: '5px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.85rem' },
  select:      { padding: '5px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace' },
  btn:         { padding: '6px 16px', background: '#f90', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'monospace' },
  btnSm:       { padding: '3px 8px', background: '#252525', color: '#888', border: '1px solid #333', borderRadius: '3px', cursor: 'pointer', fontSize: '0.72rem' },
  badge:       { display: 'inline-block', background: '#1a2a3a', border: '1px solid #2a4a6a', color: '#6cf', borderRadius: '3px', padding: '1px 6px', fontSize: '0.75rem', marginRight: 3 },
  ok:          { color: '#6f6', fontSize: '0.82rem' },
  error:       { color: '#f66', fontSize: '0.82rem' },
  addSlotRow:  { display: 'flex', gap: '6px', alignItems: 'center' },
  manageBox:   { background: '#111', border: '1px solid #222', borderRadius: '6px', padding: '0.6rem', marginTop: '0.25rem' },
  manageTitle: { fontSize: '0.7rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' },
  slotRow:     { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' },
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildVirtualJem(bodyData, activeParts) {
  const jem = JSON.parse(JSON.stringify(bodyData))
  const attachments = activeParts.map(part => {
    const entry = Object.fromEntries(
      Object.entries(part.attachment_meta).filter(([k]) => k !== 'model')
    )
    entry.submodels = [part.part_data]
    return entry
  })
  if (attachments.length) {
    jem.models = [jem.models[0], ...attachments, ...jem.models.slice(1)]
  }
  return jem
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Builder() {
  const [bodies,  setBodies]  = useState([])
  const [parts,   setParts]   = useState([])
  const [slots,   setSlots]   = useState([])
  const [bodyId,  setBodyId]  = useState(null)

  // { slotName: partId | null }
  const [slotSel, setSlotSel] = useState({})
  // Set of partIds for standalone (no-slot) parts
  const [extraSel, setExtraSel] = useState(new Set())

  const [saveForm,   setSaveForm]   = useState({ file_name: '', trigger_name: '', order: 1 })
  const [saveStatus, setSaveStatus] = useState('')

  // slot management state
  const [showManage, setShowManage] = useState(false)
  const [newSlot,    setNewSlot]    = useState({ name: '', display_name: '', order: '' })
  const [slotStatus, setSlotStatus] = useState('')

  useEffect(() => {
    api.getBodies().then(bs => { setBodies(bs); if (bs.length) setBodyId(bs[0].id) })
    api.getParts().then(setParts)
    api.getSlots().then(setSlots)
  }, [])

  const currentBody = bodies.find(b => b.id === bodyId) || null

  // Partition parts into slotted and standalone
  const partsBySlot = useMemo(() => {
    const map = {}
    for (const p of parts) {
      if (p.slot) {
        if (!map[p.slot]) map[p.slot] = []
        map[p.slot].push(p)
      }
    }
    return map
  }, [parts])

  const standaloneParts = useMemo(() => parts.filter(p => !p.slot), [parts])

  const activeParts = useMemo(() => {
    const result = []
    for (const [, pid] of Object.entries(slotSel)) {
      if (pid) { const p = parts.find(x => x.id === pid); if (p) result.push(p) }
    }
    for (const pid of extraSel) {
      const p = parts.find(x => x.id === pid); if (p) result.push(p)
    }
    return result
  }, [slotSel, extraSel, parts])

  const jem = useMemo(() => {
    if (!currentBody) return null
    return buildVirtualJem(currentBody.body_data, activeParts)
  }, [currentBody, activeParts])

  function pickSlot(slotName, partId) {
    setSlotSel(s => ({ ...s, [slotName]: s[slotName] === partId ? null : partId }))
  }
  function toggleExtra(partId) {
    setExtraSel(s => { const n = new Set(s); n.has(partId) ? n.delete(partId) : n.add(partId); return n })
  }

  async function saveVariant() {
    setSaveStatus('')
    if (!saveForm.file_name) { setSaveStatus('Enter a file name.'); return }
    try {
      await api.createVariant({
        file_name: saveForm.file_name,
        trigger_name: saveForm.trigger_name,
        body: bodyId,
        order: saveForm.order,
        part_ids: activeParts.map(p => p.id),
      })
      setSaveStatus('ok')
      setSaveForm(f => ({ ...f, file_name: '' }))
    } catch (e) { setSaveStatus(e.message) }
  }

  async function addSlot() {
    setSlotStatus('')
    if (!newSlot.name || !newSlot.display_name) { setSlotStatus('Name and display name required.'); return }
    try {
      const created = await api.createSlot({
        name: newSlot.name,
        display_name: newSlot.display_name,
        order: Number(newSlot.order) || slots.length + 1,
      })
      setSlots(sl => [...sl, created].sort((a, b) => a.order - b.order))
      setNewSlot({ name: '', display_name: '', order: '' })
    } catch (e) { setSlotStatus(e.message) }
  }

  async function deleteSlot(id) {
    if (!confirm('Delete this slot? Parts assigned to it will become standalone.')) return
    await api.deleteSlot(id)
    setSlots(sl => sl.filter(s => s.id !== id))
  }

  return (
    <div style={s.page}>

      {/* top bar */}
      <div style={s.topBar}>
        <span style={s.label}>Body</span>
        <select style={s.select} value={bodyId ?? ''} onChange={e => setBodyId(Number(e.target.value))}>
          {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <span style={{ marginLeft: 'auto' }}>
          {activeParts.length
            ? activeParts.map(p => <span key={p.id} style={s.badge}>+{p.name}</span>)
            : <span style={{ color: '#333', fontSize: '0.8rem' }}>no parts selected</span>}
        </span>
      </div>

      {/* main */}
      <div style={s.body}>

        {/* sidebar */}
        <div style={s.sidebar}>

          {/* defined slots — even if empty */}
          {slots.map(slot => {
            const slotParts = partsBySlot[slot.name] || []
            const selected  = slotSel[slot.name] || null
            return (
              <div key={slot.id} style={s.slotBox}>
                <div style={s.slotHeader}>
                  <span style={s.slotTitle}>{slot.display_name}</span>
                </div>
                <div style={s.slotBody}>
                  {/* none option */}
                  <div style={s.radioRow} onClick={() => pickSlot(slot.name, null)}>
                    <input type="radio" readOnly checked={!selected} />
                    <span style={!selected ? s.radioActive : s.radioInact}>(none)</span>
                  </div>

                  {slotParts.length === 0
                    ? <div style={s.emptySlot}>No parts yet — assign slot "{slot.name}" on the Parts page.</div>
                    : slotParts.map(p => (
                        <div key={p.id} style={s.radioRow} onClick={() => pickSlot(slot.name, p.id)}>
                          <input type="radio" readOnly checked={selected === p.id} />
                          <span style={selected === p.id ? s.radioActive : s.radioInact}>{p.name}</span>
                        </div>
                      ))
                  }
                </div>
              </div>
            )
          })}

          {/* standalone (no slot) parts */}
          {standaloneParts.length > 0 && (
            <div style={s.slotBox}>
              <div style={s.slotHeader}><span style={s.slotTitle}>Extras</span></div>
              <div style={s.slotBody}>
                {standaloneParts.map(p => (
                  <div key={p.id} style={s.radioRow} onClick={() => toggleExtra(p.id)}>
                    <input type="checkbox" readOnly checked={extraSel.has(p.id)} />
                    <span style={extraSel.has(p.id) ? s.radioActive : s.radioInact}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* slot management */}
          <div>
            <button style={s.btnSm} onClick={() => setShowManage(v => !v)}>
              {showManage ? '▲ hide' : '▼ manage slots'}
            </button>

            {showManage && (
              <div style={s.manageBox}>
                <div style={s.manageTitle}>Slots</div>

                {slots.map(sl => (
                  <div key={sl.id} style={s.slotRow}>
                    <span style={{ fontSize: '0.8rem', flex: 1, color: '#aaa' }}>
                      <span style={{ color: '#f90' }}>{sl.display_name}</span>
                      <span style={{ color: '#444' }}> · {sl.name}</span>
                    </span>
                    <button style={s.btnSm} onClick={() => deleteSlot(sl.id)}>✕</button>
                  </div>
                ))}

                <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#555', marginBottom: '4px' }}>Add slot</div>
                <div style={s.addSlotRow}>
                  <input
                    style={{ ...s.input, width: '70px' }}
                    placeholder="name"
                    value={newSlot.name}
                    onChange={e => setNewSlot(n => ({ ...n, name: e.target.value }))}
                  />
                  <input
                    style={{ ...s.input, flex: 1 }}
                    placeholder="Display Name"
                    value={newSlot.display_name}
                    onChange={e => setNewSlot(n => ({ ...n, display_name: e.target.value }))}
                  />
                  <input
                    style={{ ...s.input, width: '36px' }}
                    type="number"
                    placeholder="#"
                    value={newSlot.order}
                    onChange={e => setNewSlot(n => ({ ...n, order: e.target.value }))}
                  />
                  <button style={s.btnSm} onClick={addSlot}>+</button>
                </div>
                {slotStatus && <div style={s.error}>{slotStatus}</div>}
              </div>
            )}
          </div>
        </div>

        {/* 3D viewer */}
        <div style={s.canvas}>
          {jem
            ? <CemViewer key={JSON.stringify(activeParts.map(p => p.id))} jem={jem} onError={() => {}} />
            : <div style={{ color: '#444', padding: '2rem', fontSize: '0.9rem' }}>Select a body to preview.</div>}
        </div>
      </div>

      {/* save bar */}
      <div style={s.saveBar}>
        <span style={s.label}>Save as variant</span>
        <input
          style={{ ...s.input, width: '140px' }}
          placeholder="file_name  e.g. oak_boat4"
          value={saveForm.file_name}
          onChange={e => setSaveForm(f => ({ ...f, file_name: e.target.value }))}
        />
        <input
          style={{ ...s.input, width: '110px' }}
          placeholder="trigger  e.g. Duce"
          value={saveForm.trigger_name}
          onChange={e => setSaveForm(f => ({ ...f, trigger_name: e.target.value }))}
        />
        <span style={s.label}>Order</span>
        <input
          style={{ ...s.input, width: '50px' }}
          type="number"
          value={saveForm.order}
          onChange={e => setSaveForm(f => ({ ...f, order: Number(e.target.value) }))}
        />
        <button style={s.btn} onClick={saveVariant}>Save Variant</button>

        {saveStatus === 'ok' && <span style={s.ok}>Saved!</span>}
        {saveStatus && saveStatus !== 'ok' && <span style={s.error}>{saveStatus}</span>}
      </div>
    </div>
  )
}
