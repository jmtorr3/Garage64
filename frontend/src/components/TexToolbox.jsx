import { useRef, useState } from 'react'

const LOSPEC500 = ['#10121c','#2c1e31','#6b2643','#ac2847','#ec273f','#94493a','#de5d3a','#e98537','#f3a833','#4d3533','#6e4c30','#a26d3f','#ce9248','#dab163','#e8d282','#f7f3b7','#1e4044','#006554','#26854c','#5ab552','#9de64e','#008b8b','#62a477','#a6cb96','#d3eed3','#3e3b65','#3859b3','#3388de','#36c5f4','#6dead6','#5e5b8c','#8c78a5','#b0a7b8','#deceed','#9a4d76','#c878af','#cc99ff','#fa6e79','#ffa2ac','#ffd1d5','#f6e8e0','#ffffff']

const TOOLS = [
  { id: 'pencil', icon: '✏', label: 'Pencil'      },
  { id: 'fill',   icon: '▦',  label: 'Fill'        },
  { id: 'eraser', icon: '◻', label: 'Eraser'      },
  { id: 'eye',    icon: '⊕',  label: 'Eyedropper' },
  { id: 'drag',   icon: '✥', label: 'Pan'         },
]

function hexToRgba(hex) {
  const h = (hex || '#000000').replace('#', '')
  return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0]
}

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
  fontSize: '15px',
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

export default function TexToolbox({
  tool, setTool,
  color, setColor,
  hexInput, setHexInput,
  alpha, setAlpha,
  undoCount, redoCount,
  texUndo, texRedo,
  colorHistory = [],
  onHexChange,
  pushHistory,
}) {
  const [pos, setPos]               = useState({ x: 8, y: 8 })
  const [showColor, setShowColor]   = useState(false)
  const [showPalette, setShowPalette] = useState(false)
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

  const [r, g, b] = hexToRgba(color)
  const swatchCss = `rgba(${r},${g},${b},${(alpha/255).toFixed(2)})`

  const colorPanelTop = 0
  const palettePanelTop = showColor ? 180 : 80

  return (
    <div
      style={{ ...PANEL, position: 'absolute', left: pos.x, top: pos.y, zIndex: 200, padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px', userSelect: 'none' }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        style={{ cursor: 'grab', textAlign: 'center', fontSize: '10px', color: 'rgba(255,255,255,0.3)', padding: '1px 0 3px', letterSpacing: '2px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >⠿⠿</div>

      {/* Tools */}
      {TOOLS.map(t => (
        <button key={t.id} title={t.label}
          style={{ ...TBTN, ...(tool === t.id ? TBTN_ACT : {}) }}
          onClick={() => setTool(t.id)}
        >{t.icon}</button>
      ))}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '1px 0' }} />

      {/* Undo / Redo */}
      <button title="Undo (Ctrl+Z)" style={{ ...TBTN, fontSize: '13px', opacity: undoCount ? 1 : 0.3 }} onClick={texUndo} disabled={!undoCount}>↩</button>
      <button title="Redo (Ctrl+Y)" style={{ ...TBTN, fontSize: '13px', opacity: redoCount ? 1 : 0.3 }} onClick={texRedo} disabled={!redoCount}>↪</button>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '1px 0' }} />

      {/* Color swatch */}
      <div title="Color" onClick={() => setShowColor(v => !v)}
        style={{ width: '30px', height: '30px', background: swatchCss, border: '2px solid rgba(255,255,255,0.25)', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }} />

      {/* Palette toggle */}
      <button title="Lospec500 Palette" style={{ ...TBTN, fontSize: '11px' }} onClick={() => setShowPalette(v => !v)}>🎨</button>

      {/* ── Color flyout ── */}
      {showColor && (
        <div style={{ ...PANEL, position: 'absolute', left: '42px', top: colorPanelTop, padding: '8px', minWidth: '190px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input id="_tbPicker" type="color" value={color}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            onChange={e => { setColor(e.target.value); setHexInput(e.target.value) }} />

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div style={{ width: '34px', height: '34px', background: swatchCss, border: '2px solid rgba(255,255,255,0.25)', cursor: 'pointer', flexShrink: 0, borderRadius: '2px' }}
              onClick={() => document.getElementById('_tbPicker').click()} />
            <input style={{ flex: 1, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.18)', color: '#eee', padding: '3px 5px', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', borderRadius: '2px' }}
              value={hexInput} maxLength={7} onChange={e => onHexChange(e.target.value)} placeholder="#rrggbb" />
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '10px', color: 'rgba(255,255,255,0.55)' }}>
            <span style={{ width: '34px', flexShrink: 0 }}>Alpha</span>
            <input type="range" min={0} max={255} value={alpha} onChange={e => setAlpha(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#5599ff' }} />
            <span style={{ width: '24px', textAlign: 'right' }}>{alpha}</span>
          </div>

          {colorHistory.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {colorHistory.map((c, i) => (
                <div key={i} title={c}
                  style={{ width: '16px', height: '16px', background: c, cursor: 'pointer', border: color === c ? '2px solid #5599ff' : '1px solid rgba(255,255,255,0.2)', borderRadius: '2px' }}
                  onClick={() => { setColor(c); setHexInput(c) }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Palette flyout ── */}
      {showPalette && (
        <div style={{ ...PANEL, position: 'absolute', left: '42px', top: palettePanelTop, padding: '6px', width: '168px' }}>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', letterSpacing: '0.05em' }}>LOSPEC500</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
            {LOSPEC500.map(c => (
              <div key={c} title={c}
                style={{ width: '13px', height: '13px', background: c, cursor: 'pointer', outline: color === c ? '2px solid #5599ff' : '1px solid rgba(0,0,0,0.3)', flexShrink: 0 }}
                onClick={() => { setColor(c); setHexInput(c); pushHistory?.(c) }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
