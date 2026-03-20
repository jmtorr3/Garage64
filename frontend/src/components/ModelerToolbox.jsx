import { useRef, useState } from 'react'

const PANEL = {
  background: 'rgba(22,22,30,0.93)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: '5px',
  backdropFilter: 'blur(6px)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  color: '#eee',
  fontFamily: 'Monocraft, sans-serif',
}

const TBTN = {
  background: 'transparent',
  border: 'none',
  color: '#ddd',
  cursor: 'pointer',
  fontSize: '13px',
  width: '30px',
  height: '30px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '3px',
  padding: 0,
  fontFamily: 'Monocraft, sans-serif',
}

const TBTN_ACT = { background: 'rgba(80,140,255,0.35)', color: '#fff' }
const TBTN_DIS = { opacity: 0.3, cursor: 'default' }

const TOOLS = [
  { id: 'translate', icon: '⤢', label: 'Move (W)' },
  { id: 'rotate',    icon: '↻', label: 'Rotate (E)' },
  { id: 'scale',     icon: '⤡', label: 'Scale (R)' },
  { id: 'pivot',     icon: '⊙', label: 'Move Pivot' },
]

export default function ModelerToolbox({
  tcMode, setTcMode,
  addCube,
  deleteSelected, hasSel,
  undoCount, redoCount, onUndo, onRedo,
  embedded = false,
}) {
  const [pos, setPos] = useState({ x: 8, y: 8 })
  const dragRef = useRef(null)

  function startDrag(e) {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y }
    const move = ev => setPos({ x: ev.clientX - dragRef.current.ox, y: ev.clientY - dragRef.current.oy })
    const up   = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      style={{
        ...PANEL,
        position: embedded ? 'fixed' : 'absolute',
        left: pos.x,
        top: pos.y,
        zIndex: 200,
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        userSelect: 'none',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        style={{ cursor: 'grab', textAlign: 'center', fontSize: '10px', color: 'rgba(255,255,255,0.3)', padding: '1px 0 3px', letterSpacing: '2px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >⠿⠿</div>

      {/* Transform modes */}
      {TOOLS.map(t => (
        <button key={t.id} title={t.label}
          style={{ ...TBTN, ...(tcMode === t.id ? TBTN_ACT : {}) }}
          onClick={() => setTcMode(t.id)}
        >{t.icon}</button>
      ))}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '1px 0' }} />

      {/* Undo / Redo */}
      <button title="Undo (Ctrl+Z)" style={{ ...TBTN, ...(undoCount ? {} : TBTN_DIS) }} onClick={onUndo} disabled={!undoCount}>↩</button>
      <button title="Redo (Ctrl+Shift+Z)" style={{ ...TBTN, ...(redoCount ? {} : TBTN_DIS) }} onClick={onRedo} disabled={!redoCount}>↪</button>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '1px 0' }} />

      {/* Cube / Delete */}
      <button title="Add Cube" style={{ ...TBTN, fontSize: '15px' }} onClick={addCube}>□</button>
      <button title="Delete Selected (Del)" style={{ ...TBTN, ...(hasSel ? {} : TBTN_DIS), fontSize: '13px' }} onClick={deleteSelected} disabled={!hasSel}>✕</button>
    </div>
  )
}
