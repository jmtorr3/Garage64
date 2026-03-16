/**
 * Studio — compose variants, edit UVs, paint textures — all in one place.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import CemViewer from '../components/CemViewer'
import UVCanvas from '../components/UVCanvas'

// ── constants ─────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [2, 4, 6, 8, 12, 16, 24, 32]
const FACE_COLORS = {
  north: '#ff4455', south: '#44dd66', east: '#4499ff',
  west:  '#ffcc00', up:    '#44ffdd', down: '#ff44cc',
}
const FACES = ['north', 'south', 'east', 'west', 'up', 'down']

// ── styles ────────────────────────────────────────────────────────────────────

const XP_RAISED  = { borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)' }
const XP_SUNKEN  = { borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)' }
const XP_TITLE   = { background: 'var(--bg-title)', color: 'var(--clr-text-on-title)', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', fontFamily: 'Tahoma,sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--bdr-dk)' }
const XP_BTN_SM  = { padding: '2px 8px', background: 'var(--bg-btn)', ...{ borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)' }, color: 'var(--clr-text)', cursor: 'pointer', fontSize: '11px', fontFamily: 'Tahoma,sans-serif', fontWeight: 'bold' }
const XP_INPUT   = { padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--clr-text)', ...{ borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)' }, fontFamily: 'Tahoma,sans-serif', fontSize: '11px' }

const s = {
  page:        { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', background: 'var(--bg-window)', margin: '-1.5rem -2rem', overflow: 'hidden' },
  topBar:      { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', flexShrink: 0, borderBottom: '2px solid var(--bdr-dk)', background: 'var(--bg-panel)' },
  content:       { flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' },
  sidebar:       { flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', overflow: 'hidden' },
  centerPanel:   { flex: 1, position: 'relative', overflow: 'hidden' },
  divider:       { width: '4px', flexShrink: 0, cursor: 'col-resize', background: 'var(--bdr-dk)', userSelect: 'none' },
  rightPanel:    { flexShrink: 0, overflow: 'auto', padding: '12px', background: 'var(--bg-window)' },
  rightPanelTex: { flexShrink: 0, overflow: 'auto', padding: '1rem', background: '#1a1a1a' },
  tabBar:      { display: 'flex', gap: '2px', background: 'var(--bg-panel)', borderBottom: '2px solid var(--bdr-dk)', padding: '4px 4px 0', flexShrink: 0 },
  tab:         { flex: 1, padding: '3px 0', textAlign: 'center', borderRadius: '3px 3px 0 0', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid var(--bdr-dk)', borderBottom: 'none', fontFamily: 'Tahoma,sans-serif', background: 'var(--bg-panel-alt)', color: 'var(--clr-text-dim)' },
  tabContent:  { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-panel)', padding: '4px', borderTop: 'none', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)' },
  saveBar:     { flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', borderTop: '2px solid var(--bdr-dk)', background: 'var(--bg-panel)' },
  section:     { background: 'var(--bg-window)', overflow: 'hidden', flexShrink: 0, ...XP_RAISED },
  secHead:     XP_TITLE,
  secBody:     { padding: '6px 8px' },
  select:      { ...XP_INPUT, width: '100%', boxSizing: 'border-box' },
  selectSm:    { ...XP_INPUT },
  label:       { color: 'var(--clr-text-dim)', fontSize: '11px', fontFamily: 'Tahoma,sans-serif' },
  input:       { ...XP_INPUT },
  inputFull:   { ...XP_INPUT, width: '100%', boxSizing: 'border-box' },
  btn:         { padding: '4px 16px', background: 'var(--bg-btn-primary)', borderTop: '2px solid var(--bdr-btn-primary-lt)', borderLeft: '2px solid var(--bdr-btn-primary-lt)', borderRight: '2px solid var(--bdr-btn-primary-dk)', borderBottom: '2px solid var(--bdr-btn-primary-dk)', color: '#fff', fontFamily: 'Tahoma,sans-serif', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  btnSm:       XP_BTN_SM,
  badge:       { display: 'inline-block', background: 'var(--clr-badge-bg)', border: '1px solid var(--clr-badge-border)', color: 'var(--clr-badge-text)', padding: '1px 5px', fontSize: '10px', fontFamily: 'Tahoma,sans-serif', marginRight: 3 },
  ok:          { color: 'var(--clr-ok)', fontSize: '11px', fontFamily: 'Tahoma,sans-serif' },
  err:         { color: 'var(--clr-err)', fontSize: '11px', fontFamily: 'Tahoma,sans-serif' },
  // compose
  slotBox:     { background: 'var(--bg-window)', overflow: 'hidden', flexShrink: 0, ...XP_RAISED },
  slotHeader:  { display: 'flex', alignItems: 'center', padding: '2px 8px', ...XP_TITLE, textTransform: 'uppercase' },
  slotTitle:   { flex: 1, fontSize: '11px', fontWeight: 'bold', color: 'var(--clr-text-on-title)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Tahoma,sans-serif' },
  slotBody:    { padding: '4px 8px' },
  miniViewer:  { height: '90px', background: '#1a1a2e', position: 'relative', overflow: 'hidden', flexShrink: 0 },
  slotNav:     { display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 4px', borderTop: '1px solid var(--bdr-dk)', flexShrink: 0 },
  slotNavBtn:  { padding: '1px 7px', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', cursor: 'pointer', fontSize: '10px', fontFamily: 'Tahoma,sans-serif', flexShrink: 0 },
  partLabel:   { flex: 1, textAlign: 'center', fontSize: '10px', fontFamily: 'Tahoma,sans-serif', color: 'var(--clr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  radioRow:    { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0', cursor: 'pointer', userSelect: 'none', justifyContent: 'space-between' },
  editBtns:    { display: 'flex', gap: '2px', flexShrink: 0 },
  editBtn:     { padding: '1px 5px', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', cursor: 'pointer', fontSize: '9px', fontFamily: 'Tahoma,sans-serif', fontWeight: 'bold' },
  radioActive: { fontSize: '11px', color: 'var(--clr-text)', fontFamily: 'Tahoma,sans-serif' },
  radioInact:  { fontSize: '11px', color: 'var(--clr-text-dim)', fontFamily: 'Tahoma,sans-serif' },
  emptySlot:   { fontSize: '11px', color: 'var(--clr-text-dim)', padding: '3px 0', fontFamily: 'Tahoma,sans-serif' },
  addSlotRow:  { display: 'flex', gap: '4px', alignItems: 'center' },
  manageBox:   { background: 'var(--bg-panel)', padding: '6px', marginTop: '4px', borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-lt)', borderBottom: '2px solid var(--bdr-lt)' },
  manageTitle: { fontSize: '10px', color: 'var(--clr-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', fontFamily: 'Tahoma,sans-serif' },
  slotRow:     { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' },
  // uv
  treeItem:    { padding: '2px 4px', cursor: 'pointer', fontSize: '11px', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Tahoma,sans-serif' },
  faceRow:     { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0', fontSize: '11px' },
  dot:         { width: '10px', height: '10px', flexShrink: 0 },
  numInput:    { width: '46px', ...XP_INPUT },
  offsetRow:   { display: 'flex', gap: '6px', alignItems: 'center', padding: '3px 0', fontSize: '11px' },
  offsetLabel: { color: 'var(--clr-text-dim)', width: '14px', textAlign: 'right', fontSize: '10px', fontFamily: 'Tahoma,sans-serif' },
  // texture
  toolRow:     { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  toolBtn:     { ...XP_BTN_SM, padding: '4px 8px' },
  toolAct:     { background: 'var(--bg-btn-active)', borderTop: '1px solid var(--bdr-dk)', borderLeft: '1px solid var(--bdr-dk)', borderRight: '1px solid var(--bdr-input-lt)', borderBottom: '1px solid var(--bdr-input-lt)', color: 'var(--clr-text)' },
  colorWrap:   { display: 'flex', gap: '8px', alignItems: 'center' },
  swatch:      { width: '32px', height: '32px', ...XP_SUNKEN, cursor: 'pointer', flexShrink: 0 },
  hexInput:    { ...XP_INPUT, flex: 1 },
  alphaRow:    { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', fontSize: '11px', color: 'var(--clr-text-dim)', fontFamily: 'Tahoma,sans-serif' },
  alphaSlider: { flex: 1, accentColor: 'var(--clr-accent)' },
  zoomRow:     { display: 'flex', gap: '3px', flexWrap: 'wrap' },
  zoomBtn:     { ...XP_BTN_SM, padding: '2px 5px', fontSize: '10px' },
  zoomAct:     { background: 'var(--bg-btn-active)', borderTop: '1px solid var(--bdr-dk)', borderLeft: '1px solid var(--bdr-dk)', borderRight: '1px solid var(--bdr-input-lt)', borderBottom: '1px solid var(--bdr-input-lt)', color: 'var(--clr-text)', fontWeight: 'bold' },
  histRow:     { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' },
  histSwatch:  { width: '18px', height: '18px', ...XP_SUNKEN, cursor: 'pointer', flexShrink: 0 },
  canvasWrap:  { imageRendering: 'pixelated', cursor: 'crosshair', display: 'inline-block' },
  infoRow:     { fontSize: '10px', color: 'var(--clr-text-dim)', marginTop: '4px', fontFamily: 'Tahoma,sans-serif' },
}

// ── UV helpers ────────────────────────────────────────────────────────────────

function collectBoxes(model, prefix = '') {
  const results = []
  const label = prefix || model.id || model.part || 'root'
  if (model.boxes) {
    model.boxes.forEach((box, i) => results.push({ path: `${label}/box${i}`, box }))
  }
  if (model.submodels) {
    model.submodels.forEach((sub, i) => results.push(...collectBoxes(sub, `${label}/sub${i}`)))
  }
  return results
}

function applyBoxPatch(model, segs, depth, newBox) {
  const seg = segs[depth]
  if (!seg) return
  const bm = seg.match(/^box(\d+)$/)
  const sm = seg.match(/^sub(\d+)$/)
  if (bm && depth === segs.length - 1) { model.boxes[+bm[1]] = newBox; return }
  if (sm) applyBoxPatch(model.submodels[+sm[1]], segs, depth + 1, newBox)
}

function setBoxInPartData(data, path, newBox) {
  const clone = JSON.parse(JSON.stringify(data))
  applyBoxPatch(clone, path.split('/'), 1, newBox)
  return clone
}

function setBoxInBodyData(bodyData, modelIdx, path, newBox) {
  const clone = JSON.parse(JSON.stringify(bodyData))
  applyBoxPatch(clone.models[modelIdx], path.split('/'), 1, newBox)
  return clone
}

// ── Texture helpers ───────────────────────────────────────────────────────────

function hexToRgba(hex) {
  const h = hex.replace('#', '')
  if (h.length === 6) return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), 255]
  if (h.length === 8) return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), parseInt(h.slice(6,8),16)]
  return [0,0,0,255]
}
function rgbaToHex(r, g, b) { return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }
function rgbaToSwatchCss(r, g, b, a) { return `rgba(${r},${g},${b},${(a/255).toFixed(2)})` }

function floodFill(imgData, x, y, fR, fG, fB, fA) {
  const { width, height, data } = imgData
  const idx = (py, px) => (py*width+px)*4
  const i0 = idx(y, x)
  const [sr,sg,sb,sa] = [data[i0],data[i0+1],data[i0+2],data[i0+3]]
  if (sr===fR && sg===fG && sb===fB && sa===fA) return
  const stack = [[x,y]]
  while (stack.length) {
    const [cx,cy] = stack.pop()
    if (cx<0||cx>=width||cy<0||cy>=height) continue
    const i = idx(cy,cx)
    if (data[i]!==sr||data[i+1]!==sg||data[i+2]!==sb||data[i+3]!==sa) continue
    data[i]=fR; data[i+1]=fG; data[i+2]=fB; data[i+3]=fA
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1])
  }
}

// ── Compose helper ────────────────────────────────────────────────────────────

function buildVirtualJem(bodyData, activeParts) {
  const jem = JSON.parse(JSON.stringify(bodyData))
  const attachments = activeParts.map(part => {
    const entry = Object.fromEntries(Object.entries(part.attachment_meta).filter(([k]) => k !== 'model'))
    entry.submodels = [part.part_data]
    return entry
  })
  if (attachments.length) jem.models = [jem.models[0], ...attachments, ...jem.models.slice(1)]
  return jem
}

function partToMiniJem(part) {
  const meta = part.attachment_meta || {}
  const texPath = meta.textureFile || meta.texture || null
  const entry = Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'model'))
  // jemToScene/collectTexturePaths use "texture" key; attachment_meta often uses "textureFile"
  if (!entry.texture && entry.textureFile) entry.texture = entry.textureFile
  entry.submodels = [part.part_data]
  return {
    ...(texPath ? { texture: texPath } : {}),
    textureSize: meta.textureSize || [64, 32],
    models: [entry],
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Studio() {
  const [tab, setTab] = useState('compose')

  // Shared data
  const [bodies, setBodies] = useState([])
  const [parts,  setParts]  = useState([])
  const [slots,  setSlots]  = useState([])
  const [bodyId, setBodyId] = useState(null)

  // ── Compose ──────────────────────────────────────────────────────────────────
  const [slotSel,    setSlotSel]    = useState({})
  const [extraSel,   setExtraSel]   = useState(new Set())
  const [saveForm,   setSaveForm]   = useState({ file_name: '', trigger_name: '', order: 1 })
  const [saveStatus, setSaveStatus] = useState('')
  const [showManage, setShowManage] = useState(false)
  const [newSlot,    setNewSlot]    = useState({ name: '', display_name: '', order: '' })
  const [slotStatus, setSlotStatus] = useState('')

  // ── Panel resize ──────────────────────────────────────────────────────────────
  const [leftWidth,  setLeftWidth]  = useState(244)
  const [rightWidth, setRightWidth] = useState(320)
  const dragRef2 = useRef(null) // { side:'left'|'right', startX, startW }

  // ── UV ────────────────────────────────────────────────────────────────────────
  const [uvSrc,       setUvSrc]       = useState('part')
  const [uvPartId,    setUvPartId]    = useState(null)
  const [partData,    setPartData]    = useState(null)
  const [origPartData,setOrigPartData]= useState(null)
  const [attachMeta,  setAttachMeta]  = useState(null)
  const [bodyData,    setBodyData]    = useState(null)
  const [origBodyData,setOrigBodyData]= useState(null)
  const [bodyModelIdx,setBodyModelIdx]= useState(0)
  const [uvBoxes,     setUvBoxes]     = useState([])
  const [uvBoxIdx,    setUvBoxIdx]    = useState(0)
  const [selFace,     setSelFace]     = useState(null)
  const [uvImg,       setUvImg]       = useState(null)
  const [uvTexSize,   setUvTexSize]   = useState([64,32])
  const [uvStatus,    setUvStatus]    = useState('')

  // ── Texture ───────────────────────────────────────────────────────────────────
  const [variants,     setVariants]     = useState([])
  const [texPartId,    setTexPartId]    = useState('')
  const [texVariantId, setTexVariantId] = useState('')
  const [texPath,      setTexPath]      = useState('')
  const [zoom,         setZoom]         = useState(8)
  const [tool,         setTool]         = useState('pencil')
  const [color,        setColor]        = useState('#ff4455')
  const [alpha,        setAlpha]        = useState(255)
  const [hexInput,     setHexInput]     = useState('#ff4455')
  const [colorHistory, setColorHistory] = useState([])
  const [hoverPixel,   setHoverPixel]   = useState(null)
  const [texStatus,    setTexStatus]    = useState('')
  const canvasRef  = useRef(null)
  const bufRef     = useRef(null)
  const drawingRef = useRef(false)

  // ── Load on mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    api.getBodies().then(bs => { setBodies(bs); if (bs.length) setBodyId(bs[0].id) })
    api.getParts().then(ps => {
      setParts(ps)
      if (ps.length) { setUvPartId(ps[0].id); setTexPartId(String(ps[0].id)) }
    })
    api.getSlots().then(setSlots)
    api.getVariants().then(setVariants)
  }, [])

  // ── Compose computed ──────────────────────────────────────────────────────────
  const currentBody = bodies.find(b => b.id === bodyId) || null

  const partsBySlot = useMemo(() => {
    const map = {}
    for (const p of parts) {
      if (p.slot) { if (!map[p.slot]) map[p.slot] = []; map[p.slot].push(p) }
    }
    return map
  }, [parts])

  const standaloneParts = useMemo(() => parts.filter(p => !p.slot), [parts])

  const activeParts = useMemo(() => {
    const result = []
    for (const [, pid] of Object.entries(slotSel)) {
      if (pid) { const p = parts.find(x => x.id === pid); if (p) result.push(p) }
    }
    for (const pid of extraSel) { const p = parts.find(x => x.id === pid); if (p) result.push(p) }
    return result
  }, [slotSel, extraSel, parts])

  const jem = useMemo(() => {
    if (!currentBody) return null
    return buildVirtualJem(currentBody.body_data, activeParts)
  }, [currentBody, activeParts])

  // ── Dirty tracking ────────────────────────────────────────────────────────────
  const [uvDirty,  setUvDirty]  = useState(false)
  const [texDirty, setTexDirty] = useState(false)
  const isDirty = uvDirty || texDirty

  // ── UV effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uvPartId || uvSrc !== 'part') return
    api.getPart(uvPartId).then(p => {
      setPartData(p.part_data); setOrigPartData(p.part_data)
      setAttachMeta(p.attachment_meta); setUvStatus(''); setSelFace(null)
    })
  }, [uvPartId, uvSrc])

  useEffect(() => {
    if (!bodyId) return
    api.getBody(bodyId).then(b => {
      setBodyData(b.body_data); setOrigBodyData(b.body_data); setBodyModelIdx(0)
    })
  }, [bodyId])

  useEffect(() => { setUvBoxIdx(0); setSelFace(null) }, [uvSrc, bodyModelIdx])

  const uvActiveModel = uvSrc === 'part' ? partData : (bodyData?.models?.[bodyModelIdx] ?? null)

  useEffect(() => {
    if (!uvActiveModel) { setUvBoxes([]); return }
    const list = collectBoxes(uvActiveModel)
    setUvBoxes(list)
    setUvBoxIdx(i => Math.min(i, Math.max(0, list.length - 1)))
  }, [uvActiveModel])

  useEffect(() => {
    let tp, declaredSize
    if (uvSrc === 'part') {
      if (!attachMeta) return
      tp = attachMeta.textureFile || attachMeta.texture
      if (!tp) return
    } else {
      if (!bodyData) return
      const m = bodyData.models?.[bodyModelIdx]
      tp = m?.texture || bodyData.texture
      declaredSize = m?.textureSize || bodyData.textureSize
      if (!tp) return
    }
    const norm = tp.replace(/^minecraft:/, '')
    const image = new Image()
    image.onload = () => { setUvImg(image); setUvTexSize(declaredSize || [image.naturalWidth, image.naturalHeight]) }
    image.src = `/api/asset/?path=${encodeURIComponent(norm)}`
  }, [uvSrc, attachMeta, bodyData, bodyModelIdx])

  // ── UV logic ──────────────────────────────────────────────────────────────────
  const uvBox = uvBoxes[uvBoxIdx]?.box || null

  function uvHandleBoxChange(updatedBox) {
    const entry = uvBoxes[uvBoxIdx]
    if (!entry) return
    if (uvSrc === 'part' && partData)
      setPartData(setBoxInPartData(partData, entry.path, updatedBox))
    else if (uvSrc === 'body' && bodyData)
      setBodyData(setBoxInBodyData(bodyData, bodyModelIdx, entry.path, updatedBox))
    setUvDirty(true)
  }

  function getUvFaceCoords() {
    if (!uvBox || !selFace || uvBox.textureOffset) return null
    return uvBox['uv' + selFace[0].toUpperCase() + selFace.slice(1)] || null
  }

  function setUvFaceCoord(ci, val) {
    if (!uvBox || !selFace) return
    const key = 'uv' + selFace[0].toUpperCase() + selFace.slice(1)
    const next = [...(uvBox[key] || [0,0,0,0])]; next[ci] = Number(val)
    uvHandleBoxChange({ ...uvBox, [key]: next })
  }

  function setUvOffset(axis, val) {
    if (!uvBox) return
    const [u, v] = uvBox.textureOffset || [0,0]
    uvHandleBoxChange({ ...uvBox, textureOffset: axis === 0 ? [Number(val), v] : [u, Number(val)] })
  }

  async function uvSave() {
    setUvStatus('')
    try {
      if (uvSrc === 'part') {
        const p = parts.find(x => x.id === uvPartId)
        await api.updatePart(uvPartId, { name: p.name, jpm_path: p.jpm_path, slot: p.slot || '', part_data: partData, attachment_meta: attachMeta })
        setOrigPartData(partData)
      } else {
        await api.patchBody(bodyId, { body_data: bodyData })
        setOrigBodyData(bodyData)
      }
      setUvStatus('ok'); setUvDirty(false)
    } catch (e) { setUvStatus(e.message) }
  }

  function uvRevert() {
    if (uvSrc === 'part') setPartData(origPartData)
    else setBodyData(origBodyData)
    setUvStatus(''); setUvDirty(false)
  }

  const uvFaceCoords = getUvFaceCoords()
  const bodyModels = bodyData?.models || []

  // ── Texture effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!texPartId) return
    if (texPartId === '__body__') {
      if (bodyData?.texture) setTexPath(bodyData.texture.replace(/^minecraft:/, ''))
      return
    }
    const p = parts.find(x => String(x.id) === texPartId)
    if (!p) return
    const raw = p.attachment_meta?.textureFile || p.attachment_meta?.texture || ''
    if (raw) setTexPath(raw.replace(/^minecraft:/, ''))
  }, [texPartId, parts, bodyData])

  useEffect(() => {
    if (!texPath) return
    const img = new Image()
    img.onload = () => {
      const buf = document.createElement('canvas')
      buf.width = img.naturalWidth; buf.height = img.naturalHeight
      buf.getContext('2d').drawImage(img, 0, 0)
      bufRef.current = buf; redraw(); setTexStatus('')
    }
    img.onerror = () => setTexStatus(`Could not load: ${texPath}`)
    img.src = `/api/asset/?path=${encodeURIComponent(texPath)}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texPath])

  useEffect(() => { redraw() }, [zoom])

  // ── Texture logic ─────────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const buf = bufRef.current; const canvas = canvasRef.current
    if (!buf || !canvas) return
    const { width: tw, height: th } = buf
    canvas.width = tw * zoom; canvas.height = th * zoom
    const ctx = canvas.getContext('2d')
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      ctx.fillStyle = (x+y)%2===0 ? '#1a1a1a' : '#222'
      ctx.fillRect(x*zoom, y*zoom, zoom, zoom)
    }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(buf, 0, 0, tw*zoom, th*zoom)
    if (zoom >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5
      for (let x = 0; x <= tw; x++) { ctx.beginPath(); ctx.moveTo(x*zoom,0); ctx.lineTo(x*zoom,th*zoom); ctx.stroke() }
      for (let y = 0; y <= th; y++) { ctx.beginPath(); ctx.moveTo(0,y*zoom); ctx.lineTo(tw*zoom,y*zoom); ctx.stroke() }
    }
  }, [zoom])

  function toPixel(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [Math.floor((e.clientX-r.left)/zoom), Math.floor((e.clientY-r.top)/zoom)]
  }

  function paintPixel(px, py) {
    const buf = bufRef.current
    if (!buf || px<0||py<0||px>=buf.width||py>=buf.height) return
    const ctx = buf.getContext('2d')
    if (tool === 'pencil') {
      const [r,g,b] = hexToRgba(color)
      ctx.clearRect(px,py,1,1); ctx.fillStyle = rgbaToSwatchCss(r,g,b,alpha); ctx.fillRect(px,py,1,1); redraw(); setTexDirty(true)
    } else if (tool === 'fill') {
      const imgData = ctx.getImageData(0,0,buf.width,buf.height)
      const [r,g,b] = hexToRgba(color); floodFill(imgData,px,py,r,g,b,alpha)
      ctx.putImageData(imgData,0,0); redraw(); setTexDirty(true)
    } else if (tool === 'eye') {
      const d = ctx.getImageData(px,py,1,1).data
      const hex = rgbaToHex(d[0],d[1],d[2])
      setColor(hex); setHexInput(hex); setAlpha(d[3]); pushHistory(hex); setTool('pencil')
    }
  }

  function pushHistory(hex) {
    setColorHistory(h => [hex, ...h.filter(c => c !== hex)].slice(0,20))
  }

  function onTexDown(e)  { drawingRef.current=true; if(tool==='pencil') pushHistory(color); paintPixel(...toPixel(e)) }
  function onTexMove(e)  { const [px,py]=toPixel(e); setHoverPixel([px,py]); if(drawingRef.current&&tool==='pencil') paintPixel(px,py) }
  function onTexUp()     { drawingRef.current=false }
  function onTexLeave()  { drawingRef.current=false; setHoverPixel(null) }

  const bodyVariants = useMemo(() =>
    variants.filter(v => currentBody && v.body_name === currentBody.name),
    [variants, currentBody])

  async function texSave() {
    if (!bufRef.current||!texPath) { setTexStatus('No texture loaded.'); return }
    setTexStatus('')
    bufRef.current.toBlob(async blob => {
      try { await api.saveTexture(texPath, blob); setTexStatus('ok'); setTexDirty(false) }
      catch (e) { setTexStatus(e.message) }
    }, 'image/png')
  }

  async function texSaveVariant() {
    if (!bufRef.current) { setTexStatus('No texture loaded.'); return }
    if (!texVariantId) { setTexStatus('Select a variant first.'); return }
    const variant = variants.find(v => String(v.id) === texVariantId)
    if (!variant || !currentBody) return
    setTexStatus('')
    bufRef.current.toBlob(async blob => {
      try {
        await api.saveVariantTexture(currentBody.name, variant.id, variant.file_name, blob)
        setVariants(vs => vs.map(v => v.id === variant.id
          ? { ...v, texture_override: `minecraft:optifine/cem/${currentBody.name}/variants/${variant.file_name}.png` }
          : v))
        setTexStatus('ok'); setTexDirty(false)
      } catch (e) { setTexStatus(e.message) }
    }, 'image/png')
  }

  function onHexChange(val) {
    setHexInput(val)
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setColor(val)
  }

  // ── Compose logic ─────────────────────────────────────────────────────────────
  function pickSlot(slotName, partId) {
    setSlotSel(prev => ({ ...prev, [slotName]: prev[slotName]===partId ? null : partId }))
  }
  function stepSlotPart(slotName, dir) {
    const opts = [null, ...(partsBySlot[slotName] || []).map(p => p.id)]
    const idx = opts.indexOf(slotSel[slotName] || null)
    setSlotSel(prev => ({ ...prev, [slotName]: opts[(idx + dir + opts.length) % opts.length] }))
  }
  function toggleExtra(partId) {
    setExtraSel(prev => { const n=new Set(prev); n.has(partId)?n.delete(partId):n.add(partId); return n })
  }
  async function saveVariant() {
    setSaveStatus('')
    if (!saveForm.file_name) { setSaveStatus('Enter a file name.'); return }
    try {
      await api.createVariant({ file_name: saveForm.file_name, trigger_name: saveForm.trigger_name, body: bodyId, order: saveForm.order, part_ids: activeParts.map(p=>p.id) })
      setSaveStatus('ok'); setSaveForm(f => ({ ...f, file_name: '' }))
    } catch (e) { setSaveStatus(e.message) }
  }
  async function addSlot() {
    setSlotStatus('')
    if (!newSlot.name||!newSlot.display_name) { setSlotStatus('Name and display name required.'); return }
    try {
      const created = await api.createSlot({ name: newSlot.name, display_name: newSlot.display_name, order: Number(newSlot.order)||slots.length+1 })
      setSlots(sl => [...sl, created].sort((a,b) => a.order-b.order))
      setNewSlot({ name:'', display_name:'', order:'' })
    } catch (e) { setSlotStatus(e.message) }
  }
  async function deleteSlot(id) {
    if (!confirm('Delete this slot?')) return
    await api.deleteSlot(id); setSlots(sl => sl.filter(s=>s.id!==id))
  }

  // ── Panel resize ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e) {
      if (!dragRef2.current) return
      const { side, startX, startW } = dragRef2.current
      const dx = e.clientX - startX
      if (side === 'left')  setLeftWidth(Math.max(160, Math.min(480, startW + dx)))
      if (side === 'right') setRightWidth(Math.max(200, Math.min(600, startW - dx)))
    }
    function onUp() { dragRef2.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Leave guard ───────────────────────────────────────────────────────────────
  const isDirtyRef = useRef(isDirty)
  useEffect(() => { isDirtyRef.current = isDirty }, [isDirty])

  useEffect(() => {
    const MSG = 'You have unsaved changes in Studio. Leave without saving?'

    // (1) Browser close / refresh
    const onBeforeUnload = (e) => {
      if (!isDirtyRef.current) return
      e.preventDefault(); e.returnValue = ''
    }

    // (2) React Router NavLink clicks — intercept history.pushState
    const origPush = window.history.pushState.bind(window.history)
    window.history.pushState = (...args) => {
      const url = typeof args[2] === 'string' ? args[2] : ''
      if (isDirtyRef.current && url && !url.includes('/studio')) {
        if (!confirm(MSG)) return
      }
      origPush(...args)
    }

    // (3) Browser back / forward
    const onPopState = () => {
      if (!isDirtyRef.current) return
      if (!confirm(MSG)) {
        window.history.pushState(null, '', window.location.href)
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
      window.history.pushState = origPush
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────────
  const texBuf = bufRef.current
  const [cR, cG, cB] = hexToRgba(color)

  return (
    <div style={s.page}>

      {/* Top bar */}
      <div style={s.topBar}>
        <span style={s.label}>Body</span>
        <select style={s.selectSm} value={bodyId??''} onChange={e => setBodyId(Number(e.target.value))}>
          {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span style={{ marginLeft: 'auto' }}>
          {activeParts.length
            ? activeParts.map(p => <span key={p.id} style={s.badge}>+{p.name}</span>)
            : <span style={{ color:'var(--clr-text-dim)', fontSize:'11px', fontFamily:'Tahoma,sans-serif' }}>no parts selected</span>}
        </span>
      </div>

      {/* Content */}
      <div style={s.content}>

        {/* ── Left panel ── */}
        <div style={{ ...s.sidebar, width: leftWidth }}>

          {/* Tab bar */}
          <div style={s.tabBar}>
            {[['compose','Compose'],['uv','UV'],['texture','Texture']].map(([id,label]) => {
              const dirty = (id==='uv'&&uvDirty)||(id==='texture'&&texDirty)
              return (
                <button key={id} style={{ ...s.tab, background: tab===id ? 'var(--bg-window)':'var(--bg-panel-alt)', color: tab===id ? 'var(--clr-text)':'var(--clr-text-dim)', fontWeight: tab===id ? 'bold':'normal' }}
                  onClick={() => setTab(id)}>{label}{dirty ? ' *' : ''}</button>
              )
            })}
          </div>

          {/* Tab content */}
          <div style={s.tabContent}>

            {/* ══ COMPOSE ══ */}
            {tab === 'compose' && <>
              {slots.map(slot => {
                const slotParts = partsBySlot[slot.name] || []
                const selected  = slotSel[slot.name] || null
                const selPart   = slotParts.find(p => p.id === selected) || null
                const miniJem   = selPart ? partToMiniJem(selPart) : null
                return (
                  <div key={slot.id} style={s.slotBox}>
                    <div style={s.slotHeader}><span style={s.slotTitle}>{slot.display_name}</span></div>

                    {/* Mini JPM viewer */}
                    <div style={s.miniViewer}>
                      {miniJem
                        ? <CemViewer jem={miniJem} onError={()=>{}} autoRotate sidebarOffset={0} showGrid={false} showAxes={false} fitScale={0.55} enableZoom={false} />
                        : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.25)', fontSize:'10px', fontFamily:'Tahoma,sans-serif' }}>none</div>
                      }
                    </div>

                    {/* Prev / part name / Next + edit buttons */}
                    <div style={s.slotNav}>
                      <button style={s.slotNavBtn} onClick={() => stepSlotPart(slot.name, -1)}>◀</button>
                      <span style={s.partLabel}>{selPart?.name ?? '(none)'}</span>
                      {selPart && (
                        <div style={s.editBtns}>
                          <button style={s.editBtn} title="Edit UV" onClick={() => { setTab('uv'); setUvSrc('part'); setUvPartId(selPart.id) }}>UV</button>
                          <button style={s.editBtn} title="Edit texture" onClick={() => { setTab('texture'); setTexPartId(String(selPart.id)) }}>Tex</button>
                        </div>
                      )}
                      <button style={s.slotNavBtn} onClick={() => stepSlotPart(slot.name, 1)}>▶</button>
                    </div>

                    {slotParts.length === 0 && (
                      <div style={{ ...s.emptySlot, padding:'4px 8px' }}>No parts in slot.</div>
                    )}
                  </div>
                )
              })}

              {standaloneParts.length > 0 && (
                <div style={s.slotBox}>
                  <div style={s.slotHeader}><span style={s.slotTitle}>Extras</span></div>
                  <div style={s.slotBody}>
                    {standaloneParts.map(p => (
                      <div key={p.id} style={s.radioRow}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', flex:1, cursor:'pointer' }}
                          onClick={() => toggleExtra(p.id)}>
                          <input type="checkbox" readOnly checked={extraSel.has(p.id)} />
                          <span style={extraSel.has(p.id) ? s.radioActive : s.radioInact}>{p.name}</span>
                        </div>
                        <div style={s.editBtns} onClick={e => e.stopPropagation()}>
                          <button style={s.editBtn} title="Edit UV" onClick={() => { setTab('uv'); setUvSrc('part'); setUvPartId(p.id) }}>UV</button>
                          <button style={s.editBtn} title="Edit texture" onClick={() => { setTab('texture'); setTexPartId(String(p.id)) }}>Tex</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <button style={s.btnSm} onClick={() => setShowManage(v=>!v)}>
                  {showManage ? '▲ hide' : '▼ manage slots'}
                </button>
                {showManage && (
                  <div style={s.manageBox}>
                    <div style={s.manageTitle}>Slots</div>
                    {slots.map(sl => (
                      <div key={sl.id} style={s.slotRow}>
                        <span style={{ fontSize:'11px', flex:1, color:'var(--clr-text)', fontFamily:'Tahoma,sans-serif' }}>
                          <span style={{ color:'var(--clr-accent)', fontWeight:'bold' }}>{sl.display_name}</span>
                          <span style={{ color:'var(--clr-text-dim)' }}> · {sl.name}</span>
                        </span>
                        <button style={s.btnSm} onClick={() => deleteSlot(sl.id)}>✕</button>
                      </div>
                    ))}
                    <div style={{ marginTop:'8px', fontSize:'0.72rem', color:'var(--clr-text-dim)', marginBottom:'4px' }}>Add slot</div>
                    <div style={s.addSlotRow}>
                      <input style={{ ...s.input, width:'60px' }} placeholder="name" value={newSlot.name} onChange={e=>setNewSlot(n=>({...n,name:e.target.value}))} />
                      <input style={{ ...s.input, flex:1 }} placeholder="Display" value={newSlot.display_name} onChange={e=>setNewSlot(n=>({...n,display_name:e.target.value}))} />
                      <input style={{ ...s.input, width:'30px' }} type="number" placeholder="#" value={newSlot.order} onChange={e=>setNewSlot(n=>({...n,order:e.target.value}))} />
                      <button style={s.btnSm} onClick={addSlot}>+</button>
                    </div>
                    {slotStatus && <div style={s.err}>{slotStatus}</div>}
                  </div>
                )}
              </div>
            </>}

            {/* ══ UV ══ */}
            {tab === 'uv' && <>
              {/* Source toggle */}
              <div style={{ ...s.tabBar, margin: 0 }}>
                {[['part','Part (JPM)'],['body','Body (JEM)']].map(([src,label]) => (
                  <button key={src} style={{ ...s.tab, background: uvSrc===src?'var(--clr-accent)':'var(--bg-panel-alt)', color: uvSrc===src?'#fff':'var(--clr-text-dim)' }}
                    onClick={() => setUvSrc(src)}>{label}</button>
                ))}
              </div>

              <div style={s.section}>
                <div style={s.secHead}>{uvSrc==='part' ? 'Part' : 'Model entry'}</div>
                <div style={s.secBody}>
                  {uvSrc === 'part' ? (
                    <select style={s.select} value={uvPartId??''} onChange={e => setUvPartId(Number(e.target.value))}>
                      {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <select style={s.select} value={bodyModelIdx} onChange={e => setBodyModelIdx(Number(e.target.value))}>
                      {bodyModels.map((m,i) => <option key={i} value={i}>{m.id||m.part||`model ${i}`}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <div style={s.section}>
                <div style={s.secHead}>Boxes ({uvBoxes.length})</div>
                <div style={{ ...s.secBody, maxHeight:'180px', overflowY:'auto' }}>
                  {uvBoxes.length === 0
                    ? <span style={{ color:'var(--clr-text-dim)', fontSize:'0.8rem' }}>No boxes</span>
                    : uvBoxes.map((entry, i) => (
                        <div key={entry.path} style={{ ...s.treeItem, background: i===uvBoxIdx?'var(--clr-accent)':'transparent', color: i===uvBoxIdx?'#fff':'var(--clr-text-dim)' }}
                          onClick={() => { setUvBoxIdx(i); setSelFace(null) }} title={entry.path}>
                          {entry.path}
                        </div>
                      ))
                  }
                </div>
              </div>

              <div style={s.section}>
                <div style={s.secHead}>Faces</div>
                <div style={s.secBody}>
                  {FACES.map(face => (
                    <div key={face} style={{ ...s.faceRow, cursor:'pointer', opacity: uvBox?1:0.3, background: selFace===face?'var(--clr-accent)':'transparent', borderRadius:'2px', padding:'2px 4px' }}
                      onClick={() => uvBox && setSelFace(face)}>
                      <div style={{ ...s.dot, background: FACE_COLORS[face] }} />
                      <span style={{ color: selFace===face?'#fff':'var(--clr-text-dim)', flex:1, fontSize:'11px', fontFamily:'Tahoma,sans-serif' }}>{face.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {uvBox && (
                <div style={s.section}>
                  <div style={s.secHead}>{uvBox.textureOffset ? 'Texture Offset' : `UV — ${selFace||'select face'}`}</div>
                  <div style={s.secBody}>
                    {uvBox.textureOffset ? (
                      <>
                        {[['U',0],['V',1]].map(([lbl,axis]) => (
                          <div key={lbl} style={s.offsetRow}>
                            <span style={s.offsetLabel}>{lbl}</span>
                            <input type="number" style={s.numInput} value={uvBox.textureOffset[axis]} onChange={e=>setUvOffset(axis,e.target.value)} />
                          </div>
                        ))}
                        <div style={{ fontSize:'0.7rem', color:'var(--clr-text-dim)', marginTop:'4px' }}>Drag any face to move offset.</div>
                      </>
                    ) : uvFaceCoords ? (
                      ['x1','y1','x2','y2'].map((lbl,ci) => (
                        <div key={lbl} style={s.offsetRow}>
                          <span style={s.offsetLabel}>{lbl}</span>
                          <input type="number" style={s.numInput} value={uvFaceCoords[ci]} onChange={e=>setUvFaceCoord(ci,e.target.value)} />
                        </div>
                      ))
                    ) : (
                      <span style={{ color:'var(--clr-text-dim)', fontSize:'0.8rem' }}>Select a face.</span>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                <button style={s.btn} onClick={uvSave}>Save</button>
                <button style={s.btnSm} onClick={uvRevert}>Revert</button>
                {uvStatus==='ok' && <span style={s.ok}>Saved!</span>}
                {uvStatus && uvStatus!=='ok' && <span style={s.err}>{uvStatus}</span>}
              </div>
            </>}

            {/* ══ TEXTURE ══ */}
            {tab === 'texture' && <>
              <div style={s.section}>
                <div style={s.secHead}>Source</div>
                <div style={s.secBody}>
                  <select style={s.select} value={texPartId} onChange={e=>setTexPartId(e.target.value)}>
                    {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="__body__">Body texture</option>
                  </select>
                  <input style={{ ...s.inputFull, marginTop:'4px' }} value={texPath}
                    onChange={e=>setTexPath(e.target.value)} placeholder="textures/entity/..." />
                  {texBuf && <div style={s.infoRow}>{texBuf.width} × {texBuf.height} px</div>}
                </div>
              </div>

              <div style={s.section}>
                <div style={s.secHead}>Variant Override</div>
                <div style={s.secBody}>
                  <select style={s.select} value={texVariantId} onChange={e=>setTexVariantId(e.target.value)}>
                    <option value="">— none —</option>
                    {bodyVariants.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.file_name}{v.texture_override ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                  {texVariantId && (() => {
                    const v = variants.find(x => String(x.id) === texVariantId)
                    return v?.texture_override
                      ? <div style={{ ...s.infoRow, color:'var(--clr-ok)', marginTop:'4px' }}>Override set</div>
                      : <div style={{ ...s.infoRow, marginTop:'4px' }}>No override — uses body texture</div>
                  })()}
                </div>
              </div>

              <div style={s.section}>
                <div style={s.secHead}>Tool</div>
                <div style={{ ...s.secBody, ...s.toolRow }}>
                  {[['pencil','✏ Pencil'],['fill','⬛ Fill'],['eye','💉 Pick']].map(([id,label]) => (
                    <button key={id} style={{ ...s.toolBtn, ...(tool===id?s.toolAct:{}) }} onClick={()=>setTool(id)}>{label}</button>
                  ))}
                </div>
              </div>

              <div style={s.section}>
                <div style={s.secHead}>Color</div>
                <div style={s.secBody}>
                  <div style={s.colorWrap}>
                    <div style={{ ...s.swatch, background: rgbaToSwatchCss(cR,cG,cB,alpha) }}
                      onClick={() => document.getElementById('_studioPicker').click()} />
                    <input id="_studioPicker" type="color" value={color}
                      style={{ position:'absolute', opacity:0, pointerEvents:'none', width:0, height:0 }}
                      onChange={e => { setColor(e.target.value); setHexInput(e.target.value) }} />
                    <input style={s.hexInput} value={hexInput} maxLength={7}
                      onChange={e=>onHexChange(e.target.value)} placeholder="#rrggbb" />
                  </div>
                  <div style={s.alphaRow}>
                    <span style={{ width:'40px', flexShrink:0 }}>Alpha</span>
                    <input type="range" min={0} max={255} style={s.alphaSlider} value={alpha} onChange={e=>setAlpha(Number(e.target.value))} />
                    <span style={{ width:'28px', textAlign:'right', flexShrink:0, fontSize:'0.72rem' }}>{alpha}</span>
                  </div>
                  {colorHistory.length > 0 && (
                    <div style={s.histRow}>
                      {colorHistory.map((c,i) => (
                        <div key={i} style={{ ...s.histSwatch, background:c }} title={c}
                          onClick={() => { setColor(c); setHexInput(c) }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={s.section}>
                <div style={s.secHead}>Zoom</div>
                <div style={{ ...s.secBody, ...s.zoomRow }}>
                  {ZOOM_LEVELS.map(z => (
                    <button key={z} style={{ ...s.zoomBtn, ...(zoom===z?s.zoomAct:{}) }} onClick={()=>setZoom(z)}>{z}×</button>
                  ))}
                </div>
              </div>

              <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
                <button style={s.btn} onClick={texSave}>Save PNG</button>
                <button style={{ ...s.btn, ...(texVariantId ? {} : { background: 'var(--bg-panel-alt)', borderTopColor:'var(--bdr-lt)', borderLeftColor:'var(--bdr-lt)', borderRightColor:'var(--bdr-dk)', borderBottomColor:'var(--bdr-dk)', color:'var(--clr-text-dim)', cursor:'not-allowed' }) }}
                  onClick={texSaveVariant} disabled={!texVariantId} title="Save as per-variant texture override">
                  Save Override
                </button>
                {hoverPixel && texBuf && <span style={{ fontSize:'0.72rem', color:'var(--clr-text-dim)' }}>({hoverPixel[0]}, {hoverPixel[1]})</span>}
                {texStatus==='ok' && <span style={s.ok}>Saved!</span>}
                {texStatus && texStatus!=='ok' && <span style={s.err}>{texStatus}</span>}
              </div>
            </>}

          </div>{/* tabContent */}

          {/* Save bar inside sidebar — compose only */}
          {tab === 'compose' && (
            <div style={s.saveBar}>
              <span style={s.label}>Save as variant</span>
              <input style={s.inputFull} placeholder="file_name e.g. oak_boat4"
                value={saveForm.file_name} onChange={e=>setSaveForm(f=>({...f,file_name:e.target.value}))} />
              <input style={s.inputFull} placeholder="trigger e.g. Duce"
                value={saveForm.trigger_name} onChange={e=>setSaveForm(f=>({...f,trigger_name:e.target.value}))} />
              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                <span style={s.label}>Order</span>
                <input style={{ ...s.input, width:'50px' }} type="number"
                  value={saveForm.order} onChange={e=>setSaveForm(f=>({...f,order:Number(e.target.value)}))} />
              </div>
              <button style={s.btn} onClick={saveVariant}>Save Variant</button>
              {saveStatus==='ok' && <span style={s.ok}>Saved!</span>}
              {saveStatus && saveStatus!=='ok' && <span style={s.err}>{saveStatus}</span>}
            </div>
          )}
        </div>{/* left panel */}

        {/* ── Left divider ── */}
        <div style={s.divider} onMouseDown={e => { e.preventDefault(); dragRef2.current = { side:'left', startX: e.clientX, startW: leftWidth } }} />

        {/* ── Center: always-on CemViewer ── */}
        <div style={s.centerPanel}>
          {jem
            ? <CemViewer jem={jem} onError={()=>{}} />
            : <div style={{ color:'var(--clr-text-dim)', padding:'2rem', fontSize:'0.9rem' }}>Select a body to preview.</div>}
        </div>

        {/* ── Right divider + panel (UV / Texture only) ── */}
        {tab !== 'compose' && <>
          <div style={s.divider} onMouseDown={e => { e.preventDefault(); dragRef2.current = { side:'right', startX: e.clientX, startW: rightWidth } }} />

          {tab === 'uv' && (
            <div style={{ ...s.rightPanel, width: rightWidth }}>
              {uvBox
                ? <UVCanvas img={uvImg} textureSize={uvTexSize} box={uvBox}
                    selectedFace={selFace} onFaceSelect={setSelFace} onBoxChange={uvHandleBoxChange} />
                : <div style={{ color:'var(--clr-text-dim)', fontSize:'0.9rem' }}>Select a box to edit UVs.</div>}
            </div>
          )}

          {tab === 'texture' && (
            <div style={{ ...s.rightPanelTex, width: rightWidth }}>
              {texPath
                ? <canvas ref={canvasRef} style={s.canvasWrap}
                    onMouseDown={onTexDown} onMouseMove={onTexMove}
                    onMouseUp={onTexUp} onMouseLeave={onTexLeave} />
                : <div style={{ color:'var(--clr-text-dim)', fontSize:'0.9rem' }}>Select a part to load its texture.</div>}
            </div>
          )}
        </>}

      </div>{/* content */}

    </div>
  )
}
