/**
 * TextureEditor — pixel-level PNG editor for pack textures.
 *
 * Tools: pencil, fill (flood), eyedropper
 * Source: picks texture path from any part's attachment_meta, or type manually.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

// ── constants ─────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [2, 4, 6, 8, 12, 16, 24, 32]
const CHECKER_A  = '#1a1a1a'
const CHECKER_B  = '#222222'

const s = {
  page:      { display: 'flex', gap: '1rem', height: 'calc(100vh - 48px)', overflow: 'hidden' },
  panel:     { width: '230px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', paddingTop: '0.75rem' },
  main:      { flex: 1, overflow: 'auto', paddingTop: '0.75rem' },
  section:   { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '6px', overflow: 'hidden', marginBottom: '0.5rem' },
  secHead:   { background: '#1e1e1e', borderBottom: '1px solid #2a2a2a', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 'bold', color: '#f90', textTransform: 'uppercase', letterSpacing: '0.05em' },
  secBody:   { padding: '8px 10px' },
  select:    { width: '100%', padding: '5px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.82rem', marginBottom: '4px' },
  input:     { width: '100%', padding: '5px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.82rem', boxSizing: 'border-box' },
  toolRow:   { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  toolBtn:   { padding: '6px 10px', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: '#1e1e1e', color: '#aaa' },
  toolAct:   { background: '#2a3a4a', borderColor: '#4a8aaa', color: '#6cf' },
  colorWrap: { display: 'flex', gap: '8px', alignItems: 'center' },
  swatch:    { width: '36px', height: '36px', borderRadius: '4px', border: '1px solid #555', cursor: 'pointer', flexShrink: 0 },
  hexInput:  { flex: 1, padding: '5px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.85rem' },
  alphaRow:  { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px', fontSize: '0.8rem', color: '#888' },
  alphaSlider: { flex: 1, accentColor: '#f90' },
  btn:       { padding: '6px 16px', background: '#f90', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'monospace', width: '100%', marginTop: '4px' },
  btnSm:     { padding: '3px 8px', background: '#252525', color: '#888', border: '1px solid #333', borderRadius: '3px', cursor: 'pointer', fontSize: '0.72rem' },
  ok:        { color: '#6f6', fontSize: '0.82rem', marginTop: '4px' },
  err:       { color: '#f66', fontSize: '0.82rem', marginTop: '4px' },
  infoRow:   { fontSize: '0.72rem', color: '#555', marginTop: '6px' },
  zoomRow:   { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' },
  zoomBtn:   { padding: '3px 7px', background: '#1e1e1e', border: '1px solid #333', borderRadius: '3px', cursor: 'pointer', fontSize: '0.75rem', color: '#888' },
  zoomAct:   { borderColor: '#f90', color: '#f90' },
  canvasWrap:{ imageRendering: 'pixelated', cursor: 'crosshair', display: 'inline-block' },
  histRow:   { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' },
  histSwatch:{ width: '20px', height: '20px', borderRadius: '2px', border: '1px solid #333', cursor: 'pointer', flexShrink: 0 },
}

// ── color helpers ─────────────────────────────────────────────────────────────

function hexToRgba(hex) {
  const h = hex.replace('#', '')
  if (h.length === 6) return [
    parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16),
    parseInt(h.slice(4,6),16), 255
  ]
  if (h.length === 8) return [
    parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16),
    parseInt(h.slice(4,6),16), parseInt(h.slice(6,8),16)
  ]
  return [0, 0, 0, 255]
}

function rgbaToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2,'0')).join('')
}

function rgbaToSwatchCss(r, g, b, a) {
  return `rgba(${r},${g},${b},${(a/255).toFixed(2)})`
}

// ── flood fill ────────────────────────────────────────────────────────────────

function floodFill(imgData, x, y, fillR, fillG, fillB, fillA) {
  const { width, height, data } = imgData
  const idx = (py, px) => (py * width + px) * 4
  const start = idx(y, x)
  const [sr, sg, sb, sa] = [data[start], data[start+1], data[start+2], data[start+3]]

  // Don't fill if target color == fill color
  if (sr===fillR && sg===fillG && sb===fillB && sa===fillA) return

  const stack = [[x, y]]
  while (stack.length) {
    const [cx, cy] = stack.pop()
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue
    const i = idx(cy, cx)
    if (data[i]!==sr || data[i+1]!==sg || data[i+2]!==sb || data[i+3]!==sa) continue
    data[i]=fillR; data[i+1]=fillG; data[i+2]=fillB; data[i+3]=fillA
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1])
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function TextureEditor() {
  const [parts,      setParts]      = useState([])
  const [partId,     setPartId]     = useState('')
  const [texPath,    setTexPath]    = useState('')   // relative: textures/...
  const [zoom,       setZoom]       = useState(8)
  const [tool,       setTool]       = useState('pencil')  // pencil | fill | eye
  const [color,      setColor]      = useState('#ff4455')
  const [alpha,      setAlpha]      = useState(255)
  const [hexInput,   setHexInput]   = useState('#ff4455')
  const [history,    setHistory]    = useState([])  // last N used colors
  const [hoverPixel, setHoverPixel] = useState(null)
  const [status,     setStatus]     = useState('')

  const canvasRef  = useRef(null)   // display canvas (zoomed)
  const bufRef     = useRef(null)   // offscreen native-res canvas
  const drawingRef = useRef(false)

  // Load parts
  useEffect(() => {
    api.getParts().then(ps => {
      setParts(ps)
      if (ps.length) setPartId(String(ps[0].id))
    })
  }, [])

  // When partId changes, derive texture path from attachment_meta
  useEffect(() => {
    if (!partId) return
    const p = parts.find(x => String(x.id) === partId)
    if (!p) return
    const meta = p.attachment_meta || {}
    const raw  = meta.textureFile || meta.texture || ''
    if (raw) setTexPath(raw.replace(/^minecraft:/, ''))
  }, [partId, parts])

  // Load texture into buffer canvas
  useEffect(() => {
    if (!texPath) return
    const img = new Image()
    img.onload = () => {
      const buf = document.createElement('canvas')
      buf.width  = img.naturalWidth
      buf.height = img.naturalHeight
      const ctx = buf.getContext('2d')
      ctx.drawImage(img, 0, 0)
      bufRef.current = buf
      redraw()
      setStatus('')
    }
    img.onerror = () => setStatus(`Could not load: ${texPath}`)
    img.src = `/api/asset/?path=${encodeURIComponent(texPath)}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texPath])

  // Redraw display canvas from buffer
  const redraw = useCallback(() => {
    const buf = bufRef.current
    const canvas = canvasRef.current
    if (!buf || !canvas) return
    const { width: tw, height: th } = buf
    canvas.width  = tw * zoom
    canvas.height = th * zoom
    const ctx = canvas.getContext('2d')

    // Checkerboard
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? CHECKER_A : CHECKER_B
      ctx.fillRect(x*zoom, y*zoom, zoom, zoom)
    }

    // Texture (pixelated)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(buf, 0, 0, tw * zoom, th * zoom)

    // Grid (only when zoomed in enough)
    if (zoom >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 0.5
      for (let x = 0; x <= tw; x++) {
        ctx.beginPath(); ctx.moveTo(x*zoom, 0); ctx.lineTo(x*zoom, th*zoom); ctx.stroke()
      }
      for (let y = 0; y <= th; y++) {
        ctx.beginPath(); ctx.moveTo(0, y*zoom); ctx.lineTo(tw*zoom, y*zoom); ctx.stroke()
      }
    }
  }, [zoom])

  useEffect(() => { redraw() }, [zoom, redraw])

  // ── mouse helpers ──────────────────────────────────────────────────────────
  function toPixel(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [
      Math.floor((e.clientX - r.left) / zoom),
      Math.floor((e.clientY - r.top)  / zoom),
    ]
  }

  function paintPixel(px, py) {
    const buf = bufRef.current
    if (!buf) return
    if (px < 0 || py < 0 || px >= buf.width || py >= buf.height) return
    const ctx = buf.getContext('2d')

    if (tool === 'pencil') {
      const [r, g, b] = hexToRgba(color)
      ctx.clearRect(px, py, 1, 1)
      ctx.fillStyle = rgbaToSwatchCss(r, g, b, alpha)
      ctx.fillRect(px, py, 1, 1)
      redraw()
    } else if (tool === 'fill') {
      const imgData = ctx.getImageData(0, 0, buf.width, buf.height)
      const [r, g, b] = hexToRgba(color)
      floodFill(imgData, px, py, r, g, b, alpha)
      ctx.putImageData(imgData, 0, 0)
      redraw()
    } else if (tool === 'eye') {
      const imgData = ctx.getImageData(px, py, 1, 1).data
      const hex = rgbaToHex(imgData[0], imgData[1], imgData[2])
      setColor(hex)
      setHexInput(hex)
      setAlpha(imgData[3])
      pushHistory(hex)
      setTool('pencil')
    }
  }

  function pushHistory(hex) {
    setHistory(h => {
      const deduped = [hex, ...h.filter(c => c !== hex)]
      return deduped.slice(0, 20)
    })
  }

  function onMouseDown(e) {
    drawingRef.current = true
    const [px, py] = toPixel(e)
    paintPixel(px, py)
  }

  function onMouseMove(e) {
    const [px, py] = toPixel(e)
    setHoverPixel([px, py])
    if (!drawingRef.current || tool !== 'pencil') return
    paintPixel(px, py)
  }

  function onMouseUp()    { drawingRef.current = false }
  function onMouseLeave() { drawingRef.current = false; setHoverPixel(null) }

  function onMouseDownCapture(e) {
    if (tool === 'pencil') pushHistory(color)
  }

  // ── save ──────────────────────────────────────────────────────────────────
  async function save() {
    if (!bufRef.current || !texPath) { setStatus('No texture loaded.'); return }
    setStatus('')
    bufRef.current.toBlob(async blob => {
      try {
        await api.saveTexture(texPath, blob)
        setStatus('ok')
      } catch (e) {
        setStatus(e.message)
      }
    }, 'image/png')
  }

  // ── hex input ─────────────────────────────────────────────────────────────
  function onHexChange(val) {
    setHexInput(val)
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setColor(val)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  const buf = bufRef.current
  const [r, g, b] = hexToRgba(color)

  return (
    <div style={s.page}>

      {/* ── left panel ── */}
      <div style={s.panel}>

        <div style={s.section}>
          <div style={s.secHead}>Texture source</div>
          <div style={s.secBody}>
            <select
              style={s.select}
              value={partId}
              onChange={e => setPartId(e.target.value)}
            >
              {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input
              style={s.input}
              value={texPath}
              onChange={e => setTexPath(e.target.value)}
              placeholder="textures/entity/boat/oak.png"
            />
            {buf && (
              <div style={s.infoRow}>{buf.width} × {buf.height} px</div>
            )}
          </div>
        </div>

        <div style={s.section}>
          <div style={s.secHead}>Tool</div>
          <div style={{ ...s.secBody, ...s.toolRow }}>
            {[
              { id: 'pencil', label: '✏ Pencil' },
              { id: 'fill',   label: '⬛ Fill'   },
              { id: 'eye',    label: '💉 Pick'   },
            ].map(t => (
              <button
                key={t.id}
                style={{ ...s.toolBtn, ...(tool === t.id ? s.toolAct : {}) }}
                onClick={() => setTool(t.id)}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div style={s.section}>
          <div style={s.secHead}>Color</div>
          <div style={s.secBody}>
            <div style={s.colorWrap}>
              <div
                style={{ ...s.swatch, background: rgbaToSwatchCss(r, g, b, alpha) }}
                title="Click to open native picker"
                onClick={() => document.getElementById('_nativePicker').click()}
              />
              {/* hidden native color input */}
              <input
                id="_nativePicker"
                type="color"
                value={color}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                onChange={e => { setColor(e.target.value); setHexInput(e.target.value) }}
              />
              <input
                style={s.hexInput}
                value={hexInput}
                onChange={e => onHexChange(e.target.value)}
                placeholder="#rrggbb"
                maxLength={7}
              />
            </div>
            <div style={s.alphaRow}>
              <span style={{ width: '40px', flexShrink: 0 }}>Alpha</span>
              <input
                type="range" min={0} max={255}
                style={s.alphaSlider}
                value={alpha}
                onChange={e => setAlpha(Number(e.target.value))}
              />
              <span style={{ width: '28px', textAlign: 'right', flexShrink: 0, fontSize: '0.72rem' }}>{alpha}</span>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div style={s.histRow}>
                {history.map((c, i) => (
                  <div
                    key={i}
                    style={{ ...s.histSwatch, background: c }}
                    title={c}
                    onClick={() => { setColor(c); setHexInput(c) }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={s.section}>
          <div style={s.secHead}>Zoom</div>
          <div style={{ ...s.secBody, ...s.zoomRow }}>
            {ZOOM_LEVELS.map(z => (
              <button
                key={z}
                style={{ ...s.zoomBtn, ...(zoom === z ? s.zoomAct : {}) }}
                onClick={() => setZoom(z)}
              >{z}×</button>
            ))}
          </div>
        </div>

        <div style={s.section}>
          <div style={s.secHead}>Save</div>
          <div style={s.secBody}>
            <button style={s.btn} onClick={save}>Save PNG</button>
            {hoverPixel && buf && (
              <div style={s.infoRow}>
                pixel ({hoverPixel[0]}, {hoverPixel[1]})
              </div>
            )}
            {status === 'ok' && <div style={s.ok}>Saved!</div>}
            {status && status !== 'ok' && <div style={s.err}>{status}</div>}
          </div>
        </div>

      </div>

      {/* ── canvas area ── */}
      <div style={s.main}>
        {texPath
          ? <canvas
              ref={canvasRef}
              style={s.canvasWrap}
              onMouseDown={e => { onMouseDownCapture(e); onMouseDown(e) }}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
            />
          : <div style={{ color: '#444', fontSize: '0.9rem', paddingTop: '2rem' }}>
              Select a part or enter a texture path to start editing.
            </div>
        }
      </div>

    </div>
  )
}
