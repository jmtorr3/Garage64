import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import CemViewer from '../components/CemViewer'
import Export from './Export'
import { useTheme } from '../ThemeContext'

const XP_BTN   = { fontSize: '11px', padding: '3px 10px', cursor: 'pointer', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', fontFamily: 'Monocraft, sans-serif', fontWeight: 'bold' }
const XP_INPUT = { width: '100%', padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--clr-text)', borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', boxSizing: 'border-box' }

const s = {
  page:       { display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', margin: '-1.5rem -2rem' },
  sidebar:    { width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '2px solid var(--bdr-dk)', overflow: 'hidden', background: 'var(--bg-panel)' },
  sideHead:   { display: 'flex', alignItems: 'center', padding: '4px 8px', borderBottom: '2px solid var(--bdr-dk)', gap: '6px', flexShrink: 0, background: 'var(--bg-title)' },
  sideTitle:  { flex: 1, fontWeight: 'bold', color: 'var(--clr-text-on-title)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Monocraft, sans-serif' },
  list:       { flex: 1, overflowY: 'auto' },
  item:       { padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid var(--bg-panel-alt)', display: 'flex', flexDirection: 'column', gap: '2px' },
  itemName:   { fontSize: '12px', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif' },
  itemSub:    { fontSize: '10px', color: 'var(--clr-text-dim)', fontFamily: 'Monocraft, sans-serif' },
  itemParts:  { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '3px' },
  badge:      { fontSize: '10px', background: 'var(--clr-badge-bg)', border: '1px solid var(--clr-badge-border)', color: 'var(--clr-badge-text)', padding: '1px 5px', fontFamily: 'Monocraft, sans-serif' },
  itemBtns:   { display: 'flex', gap: '4px', marginTop: '5px' },
  btnSm:      XP_BTN,
  btnDanger:  { ...XP_BTN, background: 'var(--bg-btn-danger)', borderTop: '1px solid var(--bdr-btn-danger-lt)', borderLeft: '1px solid var(--bdr-btn-danger-lt)', borderRight: '1px solid var(--bdr-btn-danger-dk)', borderBottom: '1px solid var(--bdr-btn-danger-dk)', color: '#fff' },
  // form
  formPanel:  { flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-panel)' },
  formTitle:  { fontWeight: 'bold', color: 'var(--clr-text)', fontSize: '12px', marginBottom: '2px', fontFamily: 'Monocraft, sans-serif' },
  label:      { display: 'block', fontSize: '11px', color: 'var(--clr-text-dim)', marginBottom: '2px', fontFamily: 'Monocraft, sans-serif' },
  input:      XP_INPUT,
  checkRow:   { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11px', padding: '2px 0', fontFamily: 'Monocraft, sans-serif' },
  btn:        { padding: '4px 16px', background: 'var(--bg-btn-primary)', borderTop: '2px solid var(--bdr-btn-primary-lt)', borderLeft: '2px solid var(--bdr-btn-primary-lt)', borderRight: '2px solid var(--bdr-btn-primary-dk)', borderBottom: '2px solid var(--bdr-btn-primary-dk)', color: '#fff', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  error:      { color: 'var(--clr-err)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  // viewer
  main:       { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-window)' },
  viewerBar:  { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', borderBottom: '2px solid var(--bdr-dk)', flexShrink: 0, background: 'var(--bg-panel)' },
  varName:    { fontWeight: 'bold', fontSize: '12px', fontFamily: 'Monocraft, sans-serif' },
  hint:       { color: 'var(--clr-text-dim)', fontSize: '10px', marginLeft: 'auto', fontFamily: 'Monocraft, sans-serif' },
  viewerWrap: { flex: 1, overflow: 'hidden' },
  empty:      { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-dim)', fontSize: '12px', fontFamily: 'Monocraft, sans-serif' },
  errTxt:     { color: 'var(--clr-err)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  loadTxt:    { color: 'var(--clr-text-dim)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
}

const EMPTY_FORM = { file_name: '', trigger_name: '', body: '', order: 1, part_ids: [] }

export default function Gallery() {
  const navigate  = useNavigate()
  const viewerRef = useRef(null)
  const { isDark } = useTheme()
  const bg = isDark ? '#1e1e1e' : '#ece9d8'
  const [gTab,        setGTab]        = useState('cars')  // 'cars' | 'export'
  const [variants,    setVariants]    = useState([])
  const [parts,       setParts]       = useState([])
  const [bodies,      setBodies]      = useState([])
  const [selectedId,  setSelectedId]  = useState(null)
  const [jem,         setJem]         = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [viewError,   setViewError]   = useState('')
  const [editing,     setEditing]     = useState(null)   // null | 'new' | variant.id
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [formError,   setFormError]   = useState('')

  useEffect(() => {
    api.getVariants().then(vs => { setVariants(vs); if (vs.length) setSelectedId(vs[vs.length - 1].id) })
    api.getParts().then(setParts)
    api.getBodies().then(setBodies)
  }, [])

  // Load compiled JEM whenever selection changes
  useEffect(() => {
    if (!selectedId) return
    setViewError(''); setLoading(true); setJem(null)
    fetch(`${import.meta.env.BASE_URL}api/variants/${selectedId}/compiled_jem/`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      .then(data => { setJem(data); setLoading(false) })
      .catch(e => { setViewError(e.message); setLoading(false) })
  }, [selectedId])

  const selectedVariant = variants.find(v => v.id === selectedId) || null

  // ── form helpers ──────────────────────────────────────────────────────────────
  function openNew() {
    navigate('/studio?new=1')
  }

  function openEdit(v) {
    setForm({
      file_name: v.file_name,
      trigger_name: v.trigger_name,
      body: bodies.find(b => b.name === v.body_name)?.id ?? '',
      order: v.order,
      part_ids: v.variant_parts.map(vp => vp.part.id),
    })
    setEditing(v.id); setFormError('')
  }

  function cancelEdit() { setEditing(null); setFormError('') }

  function togglePart(id) {
    setForm(f => ({
      ...f,
      part_ids: f.part_ids.includes(id) ? f.part_ids.filter(p => p !== id) : [...f.part_ids, id],
    }))
  }

  async function saveForm() {
    setFormError('')
    try {
      if (editing === 'new') {
        await api.createVariant({ ...form })
      } else {
        await api.updateVariant(editing, { ...form })
      }
      setEditing(null)
      const fresh = await api.getVariants()
      setVariants(fresh)
      if (editing === 'new' && fresh.length) setSelectedId(fresh[fresh.length - 1].id)
    } catch (e) { setFormError(e.message) }
  }

  async function del(id) {
    if (!confirm('Delete this variant?')) return
    await api.deleteVariant(id)
    const fresh = await api.getVariants()
    setVariants(fresh)
    if (id === selectedId) setSelectedId(fresh.length ? fresh[fresh.length - 1].id : null)
  }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...s.page, flexDirection: 'column' }}>

      {/* ── Top header with tabs ── */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--bdr-dk)', flexShrink: 0, background: 'var(--bg-panel)' }}>
        <span style={{ ...s.sideTitle, padding: '4px 10px', borderRight: '1px solid var(--bdr-dk)' }}>Garage</span>
        {[['cars', 'Cars'], ['export', 'Export']].map(([id, label]) => (
          <button key={id} onClick={() => { setGTab(id); setEditing(null) }}
            style={{ padding: '4px 14px', fontSize: '11px', fontFamily: 'Monocraft, sans-serif', fontWeight: gTab === id ? 'bold' : 'normal', background: gTab === id ? 'var(--bg-window)' : 'transparent', color: gTab === id ? 'var(--clr-text)' : 'var(--clr-text-dim)', border: 'none', borderRight: '1px solid var(--bdr-dk)', cursor: 'pointer', height: '100%' }}>
            {label}
          </button>
        ))}
        <button
          onClick={() => navigate('/parts-library')}
          style={{ padding: '4px 14px', fontSize: '11px', fontFamily: 'Monocraft, sans-serif', fontWeight: 'normal', background: 'transparent', color: 'var(--clr-text-dim)', border: 'none', borderRight: '1px solid var(--bdr-dk)', cursor: 'pointer', height: '100%' }}>
          All Parts
        </button>
        <button
          onClick={() => navigate('/parts-library')}
          style={{ padding: '4px 14px', fontSize: '11px', fontFamily: 'Monocraft, sans-serif', fontWeight: 'normal', background: 'transparent', color: 'var(--clr-text-dim)', border: 'none', borderRight: '1px solid var(--bdr-dk)', cursor: 'pointer', height: '100%' }}>
          All Bodies
        </button>
        <div style={{ flex: 1 }} />
      </div>

      {/* ── Export tab ── */}
      {gTab === 'export' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
          <Export />
        </div>
      )}

      {/* ── Cars tab ── */}
      {gTab === 'cars' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={s.sidebar}>
            <div style={{ ...s.sideHead, justifyContent: 'space-between' }}>
              <span style={s.sideTitle}>Variants</span>
              {editing === null
                ? <button style={s.btnSm} onClick={openNew}>+ New</button>
                : <button style={s.btnSm} onClick={cancelEdit}>← Back</button>}
            </div>
            {editing !== null ? (
              /* ── Edit / New form ── */
              <div style={s.formPanel}>
                <div style={s.formTitle}>{editing === 'new' ? 'New Variant' : 'Edit Variant'}</div>

                <div>
                  <label style={s.label}>File name (no extension)</label>
                  <input style={s.input} value={form.file_name}
                    onChange={e => setForm(f => ({ ...f, file_name: e.target.value }))}
                    placeholder="oak_boat2" />
                </div>

                <div>
                  <label style={s.label}>Trigger name (blank = default)</label>
                  <input style={s.input} value={form.trigger_name}
                    onChange={e => setForm(f => ({ ...f, trigger_name: e.target.value }))}
                    placeholder="Duce" />
                </div>

                <div>
                  <label style={s.label}>Body</label>
                  <select style={s.input} value={form.body}
                    onChange={e => setForm(f => ({ ...f, body: Number(e.target.value) }))}>
                    {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={s.label}>Order</label>
                  <input style={{ ...s.input, width: '70px' }} type="number" value={form.order}
                    onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} />
                </div>

                <div>
                  <label style={s.label}>Parts</label>
                  {parts.map(p => (
                    <div key={p.id} style={s.checkRow}>
                      <input type="checkbox" checked={form.part_ids.includes(p.id)}
                        onChange={() => togglePart(p.id)} />
                      <span style={{ color: form.part_ids.includes(p.id) ? '#fff' : 'var(--clr-text-dim)' }}>{p.name}</span>
                    </div>
                  ))}
                </div>

                {formError && <div style={s.error}>{formError}</div>}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button style={s.btn} onClick={saveForm}>Save</button>
                  <button style={{ ...s.btnSm, padding: '5px 10px' }} onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              /* ── Variant list ── */
              <div style={s.list}>
                {[...variants].reverse().map(v => {
                  const active = v.id === selectedId
                  return (
                    <div key={v.id}
                      style={{ ...s.item, background: active ? 'var(--clr-accent)' : 'var(--bg-window)', borderLeft: active ? '3px solid var(--bdr-dk)' : '3px solid transparent' }}
                      onClick={() => setSelectedId(v.id)}>
                      <span style={{ ...s.itemName, color: active ? '#fff' : 'var(--clr-text)' }}>{v.file_name}.jem</span>
                      <span style={{ ...s.itemSub, color: active ? 'rgba(255,255,255,0.75)' : 'var(--clr-text-dim)' }}>
                        {v.trigger_name ? `"${v.trigger_name}"` : 'default'}{' · '}{v.body_name}
                      </span>
                      {v.variant_parts?.length > 0 && (
                        <div style={s.itemParts}>
                          {v.variant_parts.map(vp => (
                            <span key={vp.id} style={{ ...s.badge, ...(active ? { background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff' } : {}) }}>+{vp.part.name}</span>
                          ))}
                        </div>
                      )}
                      <div style={s.itemBtns} onClick={e => e.stopPropagation()}>
                        <button style={s.btnSm} onClick={() => {
                          const ctx = viewerRef.current?.getCtx()
                          if (ctx) sessionStorage.setItem('garage64_camera', JSON.stringify({
                            position: ctx.camera.position.toArray(),
                            target:   ctx.controls.target.toArray(),
                          }))
                          navigate(`/studio?variantId=${v.id}`)
                        }}>Edit</button>
                        <button style={{ ...s.btnSm, ...s.btnDanger }} onClick={() => del(v.id)}>Delete</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Viewer ── */}
          <div style={s.main}>
            {selectedVariant && (
              <div style={s.viewerBar}>
                <span style={s.varName}>{selectedVariant.file_name}.jem</span>
                {selectedVariant.trigger_name
                  ? <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-dim)' }}>trigger: "{selectedVariant.trigger_name}"</span>
                  : <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-dim)' }}>default</span>}
                {selectedVariant.variant_parts?.map(vp => (
                  <span key={vp.id} style={{ ...s.badge, fontSize: '0.75rem' }}>+{vp.part.name}</span>
                ))}
                {loading  && <span style={s.loadTxt}>loading…</span>}
                {viewError && <span style={s.errTxt}>{viewError}</span>}
                <span style={s.hint}>drag · scroll · right-drag</span>
              </div>
            )}
            <div style={{ ...s.viewerWrap, position: 'relative' }}>
              <CemViewer ref={viewerRef} jem={jem} onError={setViewError} autoRotate showGrid={false} showAxes={false} bgColor={bg} />
              {!jem && !loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-dim)', fontSize: '0.9rem', pointerEvents: 'none' }}>
                  Select a variant to preview
                </div>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  )
}
