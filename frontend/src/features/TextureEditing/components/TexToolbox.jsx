import { useRef, useState, useEffect, useCallback } from 'react'

// ── Palettes ──────────────────────────────────────────────────────────────────
const LOSPEC500 = ['#10121c','#2c1e31','#6b2643','#ac2847','#ec273f','#94493a','#de5d3a','#e98537','#f3a833','#4d3533','#6e4c30','#a26d3f','#ce9248','#dab163','#e8d282','#f7f3b7','#1e4044','#006554','#26854c','#5ab552','#9de64e','#008b8b','#62a477','#a6cb96','#d3eed3','#3e3b65','#3859b3','#3388de','#36c5f4','#6dead6','#5e5b8c','#8c78a5','#b0a7b8','#deceed','#9a4d76','#c878af','#cc99ff','#fa6e79','#ffa2ac','#ffd1d5','#f6e8e0','#ffffff']

const MINECRAFT = ['#f9fffe','#f44e46','#fa7c18','#f8c627','#73ce3a','#16b589','#3cb4da','#4e87c4','#8932b7','#c7538b','#8e6447','#474f52','#9da4a4','#5e7b44','#825432','#191919']

const GRAYSCALE = Array.from({length:16},(_,i)=>{const v=Math.round(i*17).toString(16).padStart(2,'0');return `#${v}${v}${v}`})

const PALETTES = [
  { id:'lospec',    label:'Lospec500', colors: LOSPEC500 },
  { id:'minecraft', label:'Minecraft', colors: MINECRAFT },
  { id:'gray',      label:'Grayscale', colors: GRAYSCALE },
]

// ── Color math ────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = (hex||'#000000').replace('#','')
  return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0]
}

function rgbToHex(r,g,b) {
  return '#'+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('')
}

function rgbToHsv(r,g,b) {
  r/=255; g/=255; b/=255
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min
  let h=0
  if(d>0){
    if(max===r) h=((g-b)/d)%6
    else if(max===g) h=(b-r)/d+2
    else h=(r-g)/d+4
    h=((h*60)+360)%360
  }
  return [h, max===0?0:d/max, max]
}

function hsvToRgb(h,s,v) {
  const c=v*s, x=c*(1-Math.abs((h/60)%2-1)), m=v-c
  let r=0,g=0,b=0
  if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}
  return [(r+m)*255,(g+m)*255,(b+m)*255]
}

// ── Color Wheel canvas ────────────────────────────────────────────────────────
function ColorWheel({ color, alpha, onColorChange, onAlphaChange }) {
  const wheelRef = useRef(null)
  const svRef    = useRef(null)
  const [hsv, setHsv] = useState(() => { const [r,g,b]=hexToRgb(color); return rgbToHsv(r,g,b) })
  const [dragging, setDragging] = useState(null) // 'wheel' | 'sv'

  const SIZE = 160
  const RING = 16
  const SV   = SIZE - RING*2 - 8

  // Sync HSV when color changes externally
  useEffect(() => {
    const [r,g,b] = hexToRgb(color)
    const newHsv = rgbToHsv(r,g,b)
    setHsv(prev => {
      // don't clobber hue if s≈0 (greyscale)
      if(newHsv[1] < 0.01) return [prev[0], newHsv[1], newHsv[2]]
      return newHsv
    })
  }, [color])

  // Draw hue wheel
  useEffect(() => {
    const canvas = wheelRef.current; if(!canvas) return
    const ctx = canvas.getContext('2d')
    const cx = SIZE/2, cy = SIZE/2
    const outer = SIZE/2, inner = outer - RING
    ctx.clearRect(0,0,SIZE,SIZE)
    for(let deg=0; deg<360; deg++){
      const a1=(deg-1)*Math.PI/180, a2=(deg+1)*Math.PI/180
      ctx.beginPath()
      ctx.moveTo(cx+inner*Math.cos(a1), cy+inner*Math.sin(a1))
      ctx.arc(cx,cy,outer,a1,a2)
      ctx.arc(cx,cy,inner,a2,a1,true)
      ctx.closePath()
      ctx.fillStyle=`hsl(${deg},100%,50%)`
      ctx.fill()
    }
    // hue indicator dot
    const hr = (RING/2 + inner)
    const ha = (hsv[0]-90)*Math.PI/180
    ctx.beginPath()
    ctx.arc(cx+hr*Math.cos(ha), cy+hr*Math.sin(ha), 5, 0, Math.PI*2)
    ctx.strokeStyle='#fff'
    ctx.lineWidth=2
    ctx.stroke()
    ctx.strokeStyle='rgba(0,0,0,0.5)'
    ctx.lineWidth=1
    ctx.stroke()
  }, [hsv])

  // Draw SV square
  useEffect(() => {
    const canvas = svRef.current; if(!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0,0,SV,SV)
    // saturation gradient (left=white, right=hue color)
    const gH = ctx.createLinearGradient(0,0,SV,0)
    gH.addColorStop(0,'#fff')
    gH.addColorStop(1,`hsl(${hsv[0]},100%,50%)`)
    ctx.fillStyle=gH; ctx.fillRect(0,0,SV,SV)
    // value gradient (top=transparent, bottom=black)
    const gV = ctx.createLinearGradient(0,0,0,SV)
    gV.addColorStop(0,'rgba(0,0,0,0)'); gV.addColorStop(1,'#000')
    ctx.fillStyle=gV; ctx.fillRect(0,0,SV,SV)
    // cursor
    const cx = hsv[1]*SV, cy = (1-hsv[2])*SV
    ctx.beginPath()
    ctx.arc(cx,cy,5,0,Math.PI*2)
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke()
    ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1; ctx.stroke()
  }, [hsv, SV])

  const emitColor = useCallback((newHsv) => {
    const [r,g,b] = hsvToRgb(...newHsv)
    onColorChange(rgbToHex(r,g,b))
  }, [onColorChange])

  function onWheelMouse(e, isMove) {
    if(isMove && dragging !== 'wheel') return
    const canvas = wheelRef.current
    const rect = canvas.getBoundingClientRect()
    const cx=SIZE/2, cy=SIZE/2
    const x = (e.clientX - rect.left) - cx
    const y = (e.clientY - rect.top)  - cy
    const h = ((Math.atan2(y,x)*180/Math.PI)+90+360)%360
    const newHsv = [h, hsv[1], hsv[2]]
    setHsv(newHsv); emitColor(newHsv)
  }

  function onSvMouse(e, isMove) {
    if(isMove && dragging !== 'sv') return
    const canvas = svRef.current
    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0,Math.min(SV, e.clientX - rect.left))
    const y = Math.max(0,Math.min(SV, e.clientY - rect.top))
    const newHsv = [hsv[0], x/SV, 1-y/SV]
    setHsv(newHsv); emitColor(newHsv)
  }

  useEffect(() => {
    if(!dragging) return
    const up = () => setDragging(null)
    const move = e => {
      if(dragging==='wheel') onWheelMouse(e, true)
      if(dragging==='sv')    onSvMouse(e, true)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  })

  const [r,g,b] = hsvToRgb(...hsv)
  const previewCss = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${(alpha/255).toFixed(2)})`

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'6px', alignItems:'center' }}>
      {/* Wheel + SV stacked */}
      <div style={{ position:'relative', width:SIZE, height:SIZE }}>
        <canvas ref={wheelRef} width={SIZE} height={SIZE} style={{ position:'absolute', inset:0, cursor:'crosshair' }}
          onMouseDown={e=>{ setDragging('wheel'); onWheelMouse(e, false) }} />
        <div style={{ position:'absolute', inset:RING+4, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <canvas ref={svRef} width={SV} height={SV} style={{ cursor:'crosshair', borderRadius:'2px' }}
            onMouseDown={e=>{ setDragging('sv'); onSvMouse(e, false) }} />
        </div>
      </div>

      {/* Preview + alpha */}
      <div style={{ display:'flex', gap:'6px', alignItems:'center', width:'100%' }}>
        <div style={{ width:28, height:28, background:previewCss, border:'2px solid var(--bdr-dk)', borderRadius:'2px', flexShrink:0 }} />
        <input type="range" min={0} max={255} value={alpha} onChange={e=>onAlphaChange(Number(e.target.value))}
          style={{ flex:1, accentColor:'var(--clr-accent)' }} title={`Alpha: ${alpha}`} />
        <span style={{ fontSize:'9px', color:'var(--clr-text-dim)', width:'24px', textAlign:'right' }}>{alpha}</span>
      </div>
    </div>
  )
}

// ── Tools ─────────────────────────────────────────────────────────────────────
const TOOLS = [
  { id:'pencil', icon:'✏', label:'Pencil'      },
  { id:'fill',   icon:'▦',  label:'Fill'        },
  { id:'eraser', icon:'◻', label:'Eraser'      },
  { id:'eye',    icon:'⊕',  label:'Eyedropper' },
  { id:'drag',   icon:'✥', label:'Pan'         },
]

// ── Styles ────────────────────────────────────────────────────────────────────
const PANEL = {
  background: 'var(--bg-panel)',
  borderTop: '2px solid var(--bdr-lt)',
  borderLeft: '2px solid var(--bdr-lt)',
  borderRight: '2px solid var(--bdr-dk)',
  borderBottom: '2px solid var(--bdr-dk)',
  color: 'var(--clr-text)',
  fontFamily: 'Monocraft, sans-serif',
  boxShadow: '2px 2px 6px rgba(0,0,0,0.4)',
}

const FLYOUT = {
  ...PANEL,
  position: 'absolute',
  left: '44px',
  padding: '8px',
  minWidth: '192px',
  zIndex: 201,
}

const TBTN = {
  background: 'var(--bg-btn)',
  borderTop: '2px solid var(--bdr-btn-lt)',
  borderLeft: '2px solid var(--bdr-btn-lt)',
  borderRight: '2px solid var(--bdr-btn-dk)',
  borderBottom: '2px solid var(--bdr-btn-dk)',
  color: 'var(--clr-text)',
  cursor: 'pointer',
  fontSize: '14px',
  width: '30px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontFamily: 'Monocraft, sans-serif',
}

const TBTN_ACT = {
  background: 'var(--clr-accent)',
  color: '#fff',
  borderTopColor: 'var(--bdr-dk)',
  borderLeftColor: 'var(--bdr-dk)',
  borderRightColor: 'var(--bdr-btn-lt)',
  borderBottomColor: 'var(--bdr-btn-lt)',
}

const TBTN_DIS = { opacity: 0.35, cursor: 'default' }

const INPUT = {
  background: 'var(--bg-input)',
  color: 'var(--clr-text)',
  borderTop: '2px solid var(--bdr-dk)',
  borderLeft: '2px solid var(--bdr-dk)',
  borderRight: '2px solid var(--bdr-input-lt)',
  borderBottom: '2px solid var(--bdr-input-lt)',
  fontFamily: 'Monocraft, sans-serif',
  fontSize: '11px',
  padding: '2px 5px',
  width: '100%',
  boxSizing: 'border-box',
}

const DIVIDER = { borderTop: '1px solid var(--bdr-dk)', margin: '2px 0' }

const LABEL = { fontSize: '9px', color: 'var(--clr-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '3px' }

// ── Main Component ────────────────────────────────────────────────────────────
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
  const [pos, setPos]             = useState({ x: 8, y: 8 })
  const [showColor, setShowColor] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [activePal, setActivePal] = useState('lospec')
  const dragRef = useRef(null)

  function startDrag(e) {
    if(e.button !== 0) return
    e.preventDefault()
    dragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y }
    const move = ev => setPos({ x: ev.clientX - dragRef.current.ox, y: ev.clientY - dragRef.current.oy })
    const up   = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const [r,g,b] = hexToRgb(color)
  const swatchCss = `rgba(${r},${g},${b},${(alpha/255).toFixed(2)})`

  const palColors = PALETTES.find(p => p.id === activePal)?.colors ?? []

  return (
    <div style={{ ...PANEL, position:'absolute', left:pos.x, top:pos.y, zIndex:200, padding:'4px', display:'flex', flexDirection:'column', gap:'2px', userSelect:'none' }}
      onMouseDown={e => e.stopPropagation()}>

      {/* Drag handle */}
      <div onMouseDown={startDrag}
        style={{ cursor:'grab', textAlign:'center', fontSize:'10px', color:'var(--clr-text-dim)', padding:'1px 0 3px', letterSpacing:'2px', borderBottom:'1px solid var(--bdr-dk)' }}>
        ⠿⠿
      </div>

      {/* Tools */}
      {TOOLS.map(t => (
        <button key={t.id} title={t.label}
          style={{ ...TBTN, ...(tool === t.id ? TBTN_ACT : {}) }}
          onClick={() => setTool(t.id)}>{t.icon}</button>
      ))}

      <div style={DIVIDER} />

      {/* Undo / Redo */}
      <button title="Undo (Ctrl+Z)" style={{ ...TBTN, fontSize:'13px', ...(undoCount ? {} : TBTN_DIS) }} onClick={texUndo} disabled={!undoCount}>↩</button>
      <button title="Redo (Ctrl+Y)" style={{ ...TBTN, fontSize:'13px', ...(redoCount ? {} : TBTN_DIS) }} onClick={texRedo} disabled={!redoCount}>↪</button>

      <div style={DIVIDER} />

      {/* Color swatch */}
      <div title="Color Picker" onClick={() => { setShowColor(v => !v); setShowPalette(false) }}
        style={{ width:30, height:28, background:swatchCss, borderTop:'2px solid var(--bdr-lt)', borderLeft:'2px solid var(--bdr-lt)', borderRight:'2px solid var(--bdr-dk)', borderBottom:'2px solid var(--bdr-dk)', cursor:'pointer', flexShrink:0 }} />

      {/* Palette toggle */}
      <button title="Color Palette" style={{ ...TBTN, fontSize:'13px', ...(showPalette ? TBTN_ACT : {}) }}
        onClick={() => { setShowPalette(v => !v); setShowColor(false) }}>▤</button>

      {/* ── Color wheel flyout ── */}
      {showColor && (
        <div style={{ ...FLYOUT, top:0, display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={LABEL}>Color</div>

          <ColorWheel
            color={color}
            alpha={alpha}
            onColorChange={c => { setColor(c); setHexInput(c); pushHistory?.(c) }}
            onAlphaChange={setAlpha}
          />

          {/* Hex input */}
          <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
            <span style={{ fontSize:'9px', color:'var(--clr-text-dim)' }}>#</span>
            <input style={{ ...INPUT, flex:1 }} value={hexInput.replace('#','')} maxLength={6}
              onChange={e => onHexChange('#'+e.target.value)} placeholder="rrggbb" />
          </div>

          {/* Recent colors */}
          {colorHistory.length > 0 && (
            <>
              <div style={LABEL}>Recent</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'3px' }}>
                {colorHistory.map((c,i) => (
                  <div key={i} title={c}
                    style={{ width:16, height:16, background:c, cursor:'pointer', outline: color===c ? '2px solid var(--clr-accent)' : '1px solid var(--bdr-dk)' }}
                    onClick={() => { setColor(c); setHexInput(c) }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Palette flyout ── */}
      {showPalette && (
        <div style={{ ...FLYOUT, top:0, display:'flex', flexDirection:'column', gap:'6px' }}>
          {/* Palette tabs */}
          <div style={{ display:'flex', gap:'3px', marginBottom:'2px' }}>
            {PALETTES.map(p => (
              <button key={p.id}
                style={{ ...TBTN, flex:1, fontSize:'9px', width:'auto', height:'20px', letterSpacing:'0.03em', ...(activePal===p.id ? TBTN_ACT : {}) }}
                onClick={() => setActivePal(p.id)}>{p.label}</button>
            ))}
          </div>

          <div style={{ display:'flex', flexWrap:'wrap', gap:'2px' }}>
            {palColors.map(c => (
              <div key={c} title={c}
                style={{ width:14, height:14, background:c, cursor:'pointer', outline: color===c ? '2px solid var(--clr-accent)' : '1px solid var(--bdr-dk)', flexShrink:0 }}
                onClick={() => { setColor(c); setHexInput(c); pushHistory?.(c) }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
