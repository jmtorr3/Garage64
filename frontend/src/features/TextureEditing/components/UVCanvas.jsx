/**
 * UVCanvas — canvas that displays a texture with coloured UV-face overlays.
 *
 * Props:
 *   img          HTMLImageElement (already loaded)
 *   textureSize  [tw, th]
 *   box          the box object (has either textureOffset or uvNorth/South/…)
 *   selectedFace string | null  — "north" | "south" | "east" | "west" | "up" | "down"
 *   onFaceSelect (face) => void
 *   onBoxChange  (updatedBox) => void
 */

import { useEffect, useRef } from 'react'

const FACE_COLORS = {
  north: '#ff4455',
  south: '#44dd66',
  east:  '#4499ff',
  west:  '#ffcc00',
  up:    '#44ffdd',
  down:  '#ff44cc',
}

const FACES = ['north', 'south', 'east', 'west', 'up', 'down']

// ── UV helpers ────────────────────────────────────────────────────────────────

/** Pixel-space [x1,y1,x2,y2] rects for textureOffset UV. */
function textureOffsetRects(u, v, w, h, d) {
  return {
    up:    [u + d,         v,       u + d + w,         v + d    ],
    down:  [u + d + w,     v,       u + 2*d + w,       v + d    ],
    west:  [u,             v + d,   u + d,             v + d + h],
    south: [u + d,         v + d,   u + d + w,         v + d + h],
    east:  [u + d + w,     v + d,   u + 2*d + w,       v + d + h],
    north: [u + 2*d + w,   v + d,   u + 2*d + 2*w,     v + d + h],
  }
}

function getFaceRects(box) {
  if (!box) return {}
  if (box.textureOffset) {
    const [u, v] = box.textureOffset
    const [,,,w, h, d] = box.coordinates
    return textureOffsetRects(u, v, w, h, d)
  }
  return {
    north: box.uvNorth,
    south: box.uvSouth,
    east:  box.uvEast,
    west:  box.uvWest,
    up:    box.uvUp,
    down:  box.uvDown,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UVCanvas({ img, textureSize, box, selectedFace, onFaceSelect, onBoxChange }) {
  const canvasRef = useRef(null)
  const dragRef   = useRef(null)   // { face, startMouse, startRect }

  // drawRef stores the latest draw function so onMouseMove can call it directly
  // without waiting for the React prop-update cycle.
  const drawRef   = useRef(null)

  const [tw, th] = textureSize || [64, 32]
  const maxDim = Math.max(tw, th)
  const SCALE  = Math.max(2, Math.min(10, Math.floor(512 / maxDim)))
  const cw = tw * SCALE
  const ch = th * SCALE

  // ── Drawing ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    function draw(effectiveBox, effectiveFace) {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, cw, ch)

      // Checkerboard background
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1a1a1a' : '#222'
        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
      }

      // Texture
      if (img) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 0, 0, cw, ch)
      }

      // Pixel grid (faint)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 0.5
      for (let x = 0; x <= tw; x++) {
        ctx.beginPath(); ctx.moveTo(x * SCALE, 0); ctx.lineTo(x * SCALE, ch); ctx.stroke()
      }
      for (let y = 0; y <= th; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * SCALE); ctx.lineTo(cw, y * SCALE); ctx.stroke()
      }

      if (!effectiveBox) return

      const rects = getFaceRects(effectiveBox)

      for (const face of FACES) {
        const r = rects[face]
        if (!r) continue

        const [x1, y1, x2, y2] = r
        const color = FACE_COLORS[face]
        const isSel = face === effectiveFace

        const sx = Math.min(x1, x2) * SCALE
        const sy = Math.min(y1, y2) * SCALE
        const sw = Math.abs(x2 - x1) * SCALE
        const sh = Math.abs(y2 - y1) * SCALE

        ctx.fillStyle = color + (isSel ? '55' : '28')
        ctx.fillRect(sx, sy, sw, sh)

        ctx.strokeStyle = color
        ctx.lineWidth = isSel ? 2 : 1
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1)

        const labelSize = Math.max(7, SCALE - 1)
        ctx.font = `bold ${labelSize}px monospace`
        ctx.fillStyle = color
        ctx.fillText(face.toUpperCase().slice(0, 1), sx + 2, sy + labelSize + 1)
      }
    }

    // Save so onMouseMove can call it directly (immediate feedback, no round-trip)
    drawRef.current = draw
    draw(box, selectedFace)
  }, [img, box, selectedFace, SCALE, tw, th, cw, ch])

  // ── Mouse ────────────────────────────────────────────────────────────────────

  /**
   * Convert a mouse event to texel coordinates.
   * Uses r.width / r.height so it's correct even when the canvas is CSS-scaled
   * (e.g. maxWidth: '100%' shrinks it to fit the container).
   */
  function toTexel(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [
      (e.clientX - r.left) * tw / r.width,
      (e.clientY - r.top)  * th / r.height,
    ]
  }

  function hitFace(tx, ty) {
    const rects = getFaceRects(box)
    for (let i = FACES.length - 1; i >= 0; i--) {
      const face = FACES[i]
      const r = rects[face]
      if (!r) continue
      const [x1, y1, x2, y2] = r
      if (tx >= Math.min(x1, x2) && tx <= Math.max(x1, x2) &&
          ty >= Math.min(y1, y2) && ty <= Math.max(y1, y2)) return face
    }
    return null
  }

  /**
   * Compute the updated box after moving a face to newRect.
   * Returns null if the move can't be applied.
   */
  function buildUpdatedBox(face, newRect) {
    if (!box) return null
    if (box.textureOffset) {
      const [u0, v0] = box.textureOffset
      const [,,,w, h, d] = box.coordinates
      const expected = textureOffsetRects(u0, v0, w, h, d)[face]
      if (!expected) return null
      const du = Math.round(newRect[0] - expected[0])
      const dv = Math.round(newRect[1] - expected[1])
      return { ...box, textureOffset: [u0 + du, v0 + dv] }
    } else {
      const key = 'uv' + face[0].toUpperCase() + face.slice(1)
      return { ...box, [key]: newRect }
    }
  }

  function onMouseDown(e) {
    const [tx, ty] = toTexel(e)
    const face = hitFace(tx, ty)
    if (!face) return
    onFaceSelect?.(face)
    const rects = getFaceRects(box)
    dragRef.current = { face, startMouse: [tx, ty], startRect: [...rects[face]] }
    e.preventDefault()
  }

  function onMouseMove(e) {
    if (!dragRef.current) return
    const [tx, ty] = toTexel(e)
    const { face, startMouse, startRect } = dragRef.current
    const [mx0, my0] = startMouse
    const [x1, y1, x2, y2] = startRect

    const dx = Math.round(tx - mx0)
    const dy = Math.round(ty - my0)

    const w = x2 - x1   // signed — preserves mirror direction
    const h = y2 - y1

    const anchorX  = Math.min(x1, x2)
    const anchorY  = Math.min(y1, y2)
    const absW     = Math.abs(w)
    const absH     = Math.abs(h)
    const newAnchorX = Math.max(0, Math.min(tw - absW, anchorX + dx))
    const newAnchorY = Math.max(0, Math.min(th - absH, anchorY + dy))

    let newRect
    if (w >= 0) newRect = [newAnchorX,        newAnchorY,        newAnchorX + absW, newAnchorY + absH]
    else        newRect = [newAnchorX + absW, newAnchorY + absH, newAnchorX,        newAnchorY       ]

    const updatedBox = buildUpdatedBox(face, newRect)
    if (!updatedBox) return

    // Draw immediately — no waiting for the React prop-update round-trip
    drawRef.current?.(updatedBox, face)

    // Notify parent (async state update)
    onBoxChange?.(updatedBox)
  }

  function onMouseUp() { dragRef.current = null }

  return (
    <canvas
      ref={canvasRef}
      width={cw}
      height={ch}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ cursor: 'crosshair', imageRendering: 'pixelated', display: 'block', maxWidth: '100%' }}
    />
  )
}
