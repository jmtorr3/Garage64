import { s, XP_TITLE } from '../styles'

export default function TopBar({ editMode, setEditMode, bodies, bodyId, setBodyId, parts, partId, setPartId, showBody, setShowBody, tcMode, setTcMode, showGrid, setShowGrid, sel, status, isDirty, addCube, deleteSelected, save, revert, onBack }) {
  return (
    <div style={s.topBar}>
      {onBack && <div style={s.divider} />}
      <button style={editMode === 'body' ? s.btnAct : s.btnSm} onClick={() => setEditMode('body')}>Body</button>
      <button style={editMode === 'part' ? s.btnAct : s.btnSm} onClick={() => setEditMode('part')}>Part</button>
      {editMode === 'body'
        ? <select style={{ ...s.select, width: 'auto' }} value={bodyId ?? ''} onChange={e => setBodyId(Number(e.target.value))}>
          {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        : <select style={{ ...s.select, width: 'auto' }} value={partId ?? ''} onChange={e => setPartId(Number(e.target.value))}>
          {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      }
      {editMode === 'part' && bodyId && <>
        <div style={s.divider} />
        <button style={showBody ? s.btnAct : s.btnSm} onClick={() => setShowBody(v => !v)} title="Toggle body preview">◉ Body</button>
      </>}
      <div style={s.divider} />
      <button style={tcMode === 'translate' ? s.btnAct : s.btnSm} onClick={() => setTcMode('translate')} title="Move (W)">⤢ Move</button>
      <button style={tcMode === 'rotate' ? s.btnAct : s.btnSm} onClick={() => setTcMode('rotate')} title="Rotate (E)">↻ Rotate</button>
      <button style={tcMode === 'pivot' ? s.btnAct : s.btnSm} onClick={() => setTcMode('pivot')} title="Move pivot (keeps geometry in place)">⊙ Pivot</button>
      <div style={s.divider} />
      <button style={showGrid ? s.btnAct : s.btnSm} onClick={() => setShowGrid(v => !v)}>⊞ Grid</button>
      <div style={s.divider} />
      <button style={s.btnSm} onClick={addCube}>+ Cube</button>
      <button style={{ ...s.btnSm, opacity: sel ? 1 : 0.4 }} onClick={deleteSelected} disabled={!sel} title="Delete (Del)">✕ Delete</button>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
        {status === 'ok' && <span style={s.ok}>Saved!</span>}
        {status && status !== 'ok' && <span style={s.err}>{status}</span>}
        <button style={{ ...s.btnSm, opacity: isDirty ? 1 : 0.4 }} onClick={revert} disabled={!isDirty}>Revert</button>
        <button style={s.btn} onClick={save}>Save</button>
      </div>
    </div>
  )
}
