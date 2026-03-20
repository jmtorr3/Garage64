/**
 * Studio — compose variants, edit UVs, paint textures — all in one place.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import CemViewer from '../components/CemViewer'
import TexToolbox from '../components/TexToolbox'
import Modeler from './Modeler'
import { useTheme } from '../ThemeContext'


// ── constants ─────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [2, 4, 6, 8, 12, 16, 24, 32]

// ── styles ────────────────────────────────────────────────────────────────────

const XP_RAISED  = { borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)' }
const XP_SUNKEN  = { borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)' }
const XP_TITLE   = { background: 'var(--bg-title)', color: 'var(--clr-text-on-title)', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--bdr-dk)' }
const XP_BTN_SM  = { padding: '2px 8px', background: 'var(--bg-btn)', ...{ borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)' }, color: 'var(--clr-text)', cursor: 'pointer', fontSize: '11px', fontFamily: 'Monocraft, sans-serif', fontWeight: 'bold' }
const XP_INPUT   = { padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--clr-text)', ...{ borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)' }, fontFamily: 'Monocraft, sans-serif', fontSize: '11px' }

const s = {
  page:        { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', background: 'var(--bg-window)', margin: '-1.5rem -2rem', overflow: 'hidden' },
  topBar:      { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', flexShrink: 0, borderBottom: '2px solid var(--bdr-dk)', background: 'var(--bg-panel)' },
  content:       { flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' },
  sidebar:       { flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', overflow: 'hidden' },
  centerPanel:   { flex: 1, position: 'relative', overflow: 'hidden' },
  divider:       { width: '4px', flexShrink: 0, cursor: 'col-resize', background: 'var(--bdr-dk)', userSelect: 'none' },
  rightPanelEdit: { flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  rightPanelUV:  { flex: 1, overflow: 'auto', padding: '12px', background: 'var(--bg-window)', minHeight: 0 },
  rightPanelTex: { flex: 1, overflow: 'auto', padding: '1rem', background: '#1a1a1a', minHeight: 0 },
  rightPanelDivH:{ height: '4px', flexShrink: 0, background: 'var(--bdr-dk)' },
  tabBar:      { display: 'flex', gap: '2px', background: 'var(--bg-panel)', borderBottom: '2px solid var(--bdr-dk)', padding: '4px 4px 0', flexShrink: 0 },
  tab:         { flex: 1, padding: '3px 0', textAlign: 'center', borderRadius: '3px 3px 0 0', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid var(--bdr-dk)', borderBottom: 'none', fontFamily: 'Monocraft, sans-serif', background: 'var(--bg-panel-alt)', color: 'var(--clr-text-dim)' },
  tabContent:  { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-panel)', padding: '4px', borderTop: 'none', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)' },
  saveBar:     { flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', borderTop: '2px solid var(--bdr-dk)', background: 'var(--bg-panel)' },
  section:     { background: 'var(--bg-window)', overflow: 'hidden', flexShrink: 0, ...XP_RAISED },
  secHead:     XP_TITLE,
  secBody:     { padding: '6px 8px' },
  select:      { ...XP_INPUT, width: '100%', boxSizing: 'border-box' },
  selectSm:    { ...XP_INPUT },
  label:       { color: 'var(--clr-text-dim)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  input:       { ...XP_INPUT },
  inputFull:   { ...XP_INPUT, width: '100%', boxSizing: 'border-box' },
  btn:         { padding: '4px 16px', background: 'var(--bg-btn-primary)', borderTop: '2px solid var(--bdr-btn-primary-lt)', borderLeft: '2px solid var(--bdr-btn-primary-lt)', borderRight: '2px solid var(--bdr-btn-primary-dk)', borderBottom: '2px solid var(--bdr-btn-primary-dk)', color: '#fff', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  btnSm:       XP_BTN_SM,
  badge:       { display: 'inline-block', background: 'var(--clr-badge-bg)', border: '1px solid var(--clr-badge-border)', color: 'var(--clr-badge-text)', padding: '1px 5px', fontSize: '10px', fontFamily: 'Monocraft, sans-serif', marginRight: 3 },
  ok:          { color: 'var(--clr-ok)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  err:         { color: 'var(--clr-err)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  // compose
  slotBox:     { background: 'var(--bg-window)', overflow: 'hidden', flexShrink: 0, ...XP_RAISED },
  slotHeader:  { display: 'flex', alignItems: 'center', padding: '2px 8px', ...XP_TITLE, textTransform: 'uppercase' },
  slotTitle:   { flex: 1, fontSize: '11px', fontWeight: 'bold', color: 'var(--clr-text-on-title)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Monocraft, sans-serif' },
  slotBody:    { padding: '4px 8px' },
  miniViewer:  { height: '90px', position: 'relative', overflow: 'hidden', flexShrink: 0 },
  slotNav:     { display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 4px', borderTop: '1px solid var(--bdr-dk)', flexShrink: 0 },
  slotNavBtn:  { padding: '1px 7px', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', cursor: 'pointer', fontSize: '10px', fontFamily: 'Monocraft, sans-serif', flexShrink: 0 },
  partLabel:   { flex: 1, textAlign: 'center', fontSize: '10px', fontFamily: 'Monocraft, sans-serif', color: 'var(--clr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  radioRow:    { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0', cursor: 'pointer', userSelect: 'none', justifyContent: 'space-between' },
  editBtns:    { display: 'flex', gap: '2px', flexShrink: 0 },
  editBtn:     { padding: '1px 5px', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', cursor: 'pointer', fontSize: '9px', fontFamily: 'Monocraft, sans-serif', fontWeight: 'bold' },
  radioActive: { fontSize: '11px', color: 'var(--clr-text)', fontFamily: 'Monocraft, sans-serif' },
  radioInact:  { fontSize: '11px', color: 'var(--clr-text-dim)', fontFamily: 'Monocraft, sans-serif' },
  emptySlot:   { fontSize: '11px', color: 'var(--clr-text-dim)', padding: '3px 0', fontFamily: 'Monocraft, sans-serif' },
  addSlotRow:  { display: 'flex', gap: '4px', alignItems: 'center' },
  manageBox:   { background: 'var(--bg-panel)', padding: '6px', marginTop: '4px', borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-lt)', borderBottom: '2px solid var(--bdr-lt)' },
  manageTitle: { fontSize: '10px', color: 'var(--clr-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', fontFamily: 'Monocraft, sans-serif' },
  slotRow:     { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' },
  // uv
  treeItem:    { padding: '2px 4px', cursor: 'pointer', fontSize: '11px', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Monocraft, sans-serif' },
  faceRow:     { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0', fontSize: '11px' },
  dot:         { width: '10px', height: '10px', flexShrink: 0 },
  numInput:    { width: '46px', ...XP_INPUT },
  offsetRow:   { display: 'flex', gap: '6px', alignItems: 'center', padding: '3px 0', fontSize: '11px' },
  offsetLabel: { color: 'var(--clr-text-dim)', width: '14px', textAlign: 'right', fontSize: '10px', fontFamily: 'Monocraft, sans-serif' },
  // texture
  toolRow:     { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  toolBtn:     { ...XP_BTN_SM, padding: '4px 8px' },
  toolAct:     { background: 'var(--bg-btn-active)', borderTop: '1px solid var(--bdr-dk)', borderLeft: '1px solid var(--bdr-dk)', borderRight: '1px solid var(--bdr-input-lt)', borderBottom: '1px solid var(--bdr-input-lt)', color: 'var(--clr-text)' },
  colorWrap:   { display: 'flex', gap: '8px', alignItems: 'center' },
  swatch:      { width: '32px', height: '32px', ...XP_SUNKEN, cursor: 'pointer', flexShrink: 0 },
  hexInput:    { ...XP_INPUT, flex: 1 },
  alphaRow:    { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', fontSize: '11px', color: 'var(--clr-text-dim)', fontFamily: 'Monocraft, sans-serif' },
  alphaSlider: { flex: 1, accentColor: 'var(--clr-accent)' },
  zoomRow:     { display: 'flex', gap: '3px', flexWrap: 'wrap' },
  zoomBtn:     { ...XP_BTN_SM, padding: '2px 5px', fontSize: '10px' },
  zoomAct:     { background: 'var(--bg-btn-active)', borderTop: '1px solid var(--bdr-dk)', borderLeft: '1px solid var(--bdr-dk)', borderRight: '1px solid var(--bdr-input-lt)', borderBottom: '1px solid var(--bdr-input-lt)', color: 'var(--clr-text)', fontWeight: 'bold' },
  histRow:     { display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' },
  histSwatch:  { width: '18px', height: '18px', ...XP_SUNKEN, cursor: 'pointer', flexShrink: 0 },
  infoRow:     { fontSize: '10px', color: 'var(--clr-text-dim)', marginTop: '4px', fontFamily: 'Monocraft, sans-serif' },
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

function buildVirtualJem(bodyData, activeParts, includeBody = true) {
  const jem = JSON.parse(JSON.stringify(bodyData))
  const attachments = activeParts.map(part => {
    const entry = Object.fromEntries(Object.entries(part.attachment_meta).filter(([k]) => k !== 'model'))
    entry.submodels = [part.part_data]
    return entry
  })
  if (includeBody) {
    if (attachments.length) jem.models = [jem.models[0], ...attachments, ...jem.models.slice(1)]
  } else {
    jem.models = attachments
  }
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
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const bg = isDark ? '#1e1e1e' : '#ece9d8'

  const [createPartMode, setCreatePartMode] = useState(false)
  const partEditMode = searchParams.get('newPart') === '1' || createPartMode  // arrived from Parts Library or folder ctx menu

  const [texEditorMode, setTexEditorMode] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [modelerBar, setModelerBar] = useState({ tcMode: 'translate', showGrid: false, hasSel: false, undoCount: 0, redoCount: 0 })

  // Shared data
  const [bodies, setBodies] = useState([])
  const [parts,  setParts]  = useState([])
  const [slots,  setSlots]  = useState([])
  const [bodyId, setBodyId] = useState(null)

  // ── Compose ──────────────────────────────────────────────────────────────────
  const [slotSel,    setSlotSel]    = useState({})
  const [extraSel,   setExtraSel]   = useState(new Set())
  const [saveForm,        setSaveForm]        = useState({ file_name: '', trigger_name: '', order: 1 })
  const [currentVariantId, setCurrentVariantId] = useState(null)
  const [saveStatus, setSaveStatus] = useState('')
  const [partSaveName,  setPartSaveName]  = useState('')
  const [partSaveStatus, setPartSaveStatus] = useState('')
  const [newTexSize, setNewTexSize] = useState([64, 32])
  const [newPartSlot, setNewPartSlot] = useState('')
  const [newPartBodyId, setNewPartBodyId] = useState(null)
  const [showNewBody, setShowNewBody] = useState(false)
  const [newBodyName, setNewBodyName] = useState('')
  const [showManage,   setShowManage]   = useState(false)
  const [showCompose,  setShowCompose]  = useState(true)
  const [showBodyViewer,  setShowBodyViewer]  = useState(true)
  const [showSlotViewer,  setShowSlotViewer]  = useState({})
  const [newSlot,    setNewSlot]    = useState({ name: '', display_name: '', order: '' })
  const [slotStatus, setSlotStatus] = useState('')

  // ── Shared viewer ref (center CemViewer exposed to Modeler) ─────────────────
  const viewerRef  = useRef(null)
  const modelerRef = useRef(null)
  const redrawRef  = useRef(null)
  const initialCamera = useMemo(() => {
    const raw = sessionStorage.getItem('garage64_camera')
    if (!raw) return null
    sessionStorage.removeItem('garage64_camera')
    return JSON.parse(raw)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Panel resize ──────────────────────────────────────────────────────────────
  const [leftWidth,  setLeftWidth]  = useState(244)
  const [rightWidth, setRightWidth] = useState(480)
  const dragRef2 = useRef(null) // { side:'left'|'right', startX, startW }

  // ── Compose selection (drives Advanced Editor) ───────────────────────────────
  const [composeSelItem, setComposeSelItem] = useState({ kind: 'body' })

  // ── UV ────────────────────────────────────────────────────────────────────────
  const [editTab,     setEditTab]     = useState('texture') // 'texture' | 'modeler'
  const [uvPartId,    setUvPartId]    = useState(null)
  const [texTargetId, setTexTargetId] = useState('')       // '' = body
  const [bodyData,    setBodyData]    = useState(null)

  // ── Texture ───────────────────────────────────────────────────────────────────
  const [texPath,      setTexPath]      = useState('')
  const [showSaveAs,   setShowSaveAs]   = useState(false)
  const [saveAsPath,   setSaveAsPath]   = useState('')
  const [zoom,         setZoom]         = useState(2)
  const [tool,         setTool]         = useState('drag')
  const [color,        setColor]        = useState(() => localStorage.getItem('g64-color') || '#ff4455')
  const [alpha,        setAlpha]        = useState(255)
  const [hexInput,     setHexInput]     = useState(() => localStorage.getItem('g64-color') || '#ff4455')
  const [colorHistory, setColorHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('g64-color-history') || '[]') } catch { return [] } })
  const [hoverPixel,   setHoverPixel]   = useState(null)
  const [texStatus,    setTexStatus]    = useState('')
  const [viewerVer,    setViewerVer]    = useState(0)
  const canvasRef     = useRef(null)
  const bufRef        = useRef(null)
  const uvOverlayRef  = useRef(null)   // { rects, selFace } from Modeler
  const drawingRef = useRef(false)
  const undoRef    = useRef([])
  const redoRef    = useRef([])
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const texUndoRef        = useRef(null)
  const texRedoRef        = useRef(null)
  const saveVariantRef    = useRef(null)
  const scrollContainerRef = useRef(null)
  const pendingScrollRef   = useRef(null)
  const dragStartRef       = useRef(null) // { mouseX, mouseY, scrollLeft, scrollTop }

  // ── Load on mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const variantId  = searchParams.get('variantId')
    const bodyIdParam = searchParams.get('bodyId')
    api.getBodies().then(bs => {
      setBodies(bs)
      if (variantId) {
        api.getVariant(Number(variantId)).then(v => {
          const match = bs.find(b => b.name === v.body_name)
          if (match) setBodyId(match.id)
          else if (bs.length) setBodyId(bs[0].id)
          // pre-select parts from the variant
          const newSlotSel = {}
          const newExtraSel = new Set()
          for (const vp of (v.variant_parts || [])) {
            if (vp.part.slot) newSlotSel[vp.part.slot] = vp.part.id
            else newExtraSel.add(vp.part.id)
          }
          setSlotSel(newSlotSel)
          setExtraSel(newExtraSel)
          setCurrentVariantId(v.id)
          setSaveForm({ file_name: v.file_name, trigger_name: v.trigger_name || '', order: v.order ?? 1 })
        }).catch(() => { if (bs.length) setBodyId(bs[0].id) })
      } else if (bodyIdParam) {
        const match = bs.find(b => String(b.id) === bodyIdParam)
        if (match) setBodyId(match.id)
        else if (bs.length) setBodyId(bs[0].id)
      } else if (bs.length) {
        setBodyId(bs[0].id)
      }
    })
    api.getParts().then(ps => {
      setParts(ps)
      if (ps.length) { setUvPartId(ps[0].id) }
      const presetId = searchParams.get('presetPartId')
      if (presetId) {
        // Preset launch from Parts Library — select that part and open Block Editor
        const preset = ps.find(p => String(p.id) === presetId)
        if (preset) {
          if (preset.slot) {
            setSlotSel(prev => ({ ...prev, [preset.slot]: preset.id }))
          } else {
            setExtraSel(new Set([preset.id]))
          }
          setComposeSelItem({ kind: 'part', partId: preset.id })
          setEditTab('texture')
          setPartSaveName(preset.name)
        }
      } else if (!searchParams.get('variantId') && !searchParams.get('new')) {
        // Template: pre-select first part from each slot when coming from presetPartId flow
        const template = {}
        for (const p of ps) {
          if (p.slot && !template[p.slot]) template[p.slot] = p.id
        }
        setSlotSel(template)
      }
    })
    api.getSlots().then(setSlots)
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

  const bodyMiniJem = useMemo(() => {
    if (!currentBody) return null
    return buildVirtualJem(currentBody.body_data, [])
  }, [currentBody])

  const centerJem = useMemo(() => {
    if (composeSelItem?.kind === 'body') return bodyMiniJem
    if (composeSelItem?.kind === 'part') {
      const p = parts.find(x => x.id === composeSelItem.partId)
      return p ? partToMiniJem(p) : jem
    }
    return jem
  }, [composeSelItem, bodyMiniJem, jem, parts])

  const viewerJem = useMemo(() => {
    if (!currentBody) return null
    const visibleParts = []
    for (const [slotName, pid] of Object.entries(slotSel)) {
      if (pid && showSlotViewer[slotName] !== false) {
        const p = parts.find(x => x.id === pid)
        if (p) visibleParts.push(p)
      }
    }
    for (const pid of extraSel) { const p = parts.find(x => x.id === pid); if (p) visibleParts.push(p) }
    if (!showBodyViewer && !visibleParts.length) return null
    return buildVirtualJem(currentBody.body_data, visibleParts, showBodyViewer)
  }, [currentBody, slotSel, extraSel, parts, showBodyViewer, showSlotViewer])

  // ── 3D viewer texture patch (for live paint on model) ────────────────────────
  const [texturePatch, setTexturePatch] = useState(null)
  const viewerStrokeRef = useRef(false) // true during a paint stroke in the 3D viewer

  // ── Dirty tracking ────────────────────────────────────────────────────────────
  const [texDirty, setTexDirty] = useState(false)
  const isDirty = texDirty

  // ── UV/body effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!bodyId) return
    api.getBody(bodyId).then(b => { setBodyData(b.body_data) })
  }, [bodyId])

  // Reset zoom when uvPartId changes
  useEffect(() => {
    setZoom(2)
  }, [uvPartId]) // eslint-disable-line react-hooks/exhaustive-deps


  // ── Sync texture target from compose selection ────────────────────────────────
  useEffect(() => {
    if (composeSelItem?.kind === 'body') {
      setTexTargetId('')
      setUvPartId(null)
    } else if (composeSelItem?.kind === 'part') {
      setTexTargetId(String(composeSelItem.partId))
      setUvPartId(composeSelItem.partId)
      const p = parts.find(x => x.id === composeSelItem.partId)
      if (p) setPartSaveName(p.name)
    }
  }, [composeSelItem]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Texture effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!texTargetId) {
      if (bodyData?.texture) setTexPath(bodyData.texture.replace(/^minecraft:/, ''))
    } else {
      const p = parts.find(x => String(x.id) === texTargetId)
      const raw = p?.attachment_meta?.textureFile || p?.attachment_meta?.texture || ''
      if (raw) {
        setTexPath(raw.replace(/^minecraft:/, ''))
      } else if (bodyData?.texture) {
        setTexPath(bodyData.texture.replace(/^minecraft:/, ''))
      }
    }
  }, [texTargetId, parts, bodyData])

  useEffect(() => {
    bufRef.current = null; redraw()  // clear old texture immediately
    if (!texPath) {
      // Part selected but has no texture yet — create blank canvas so painting works
      if (texTargetId) {
        const p = parts.find(x => String(x.id) === texTargetId)
        const [tw, th] = p?.attachment_meta?.textureSize || [64, 32]
        const buf = document.createElement('canvas')
        buf.width = tw; buf.height = th
        bufRef.current = buf
        undoRef.current = []; redoRef.current = []
        setUndoCount(0); setRedoCount(0)
        setZoom(Math.max(1, Math.floor(340 / tw)))
        redraw(); setTexStatus('New texture — use Save As to name it')
      }
      return
    }
    const img = new Image()
    img.onload = () => {
      const buf = document.createElement('canvas')
      buf.width = img.naturalWidth; buf.height = img.naturalHeight
      buf.getContext('2d').drawImage(img, 0, 0)
      bufRef.current = buf
      undoRef.current = []; redoRef.current = []
      setUndoCount(0); setRedoCount(0)
      // auto-zoom: fit texture width inside the 340px panel
      const ideal = 340 / img.naturalWidth
      const autoZoom = [...ZOOM_LEVELS].reverse().find(z => z <= ideal) ?? ZOOM_LEVELS[0]
      setZoom(autoZoom)
      redraw(); setTexStatus('')
    }
    img.onerror = () => setTexStatus(`Could not load: ${texPath}`)
    img.src = `${import.meta.env.BASE_URL}api/asset/?path=${encodeURIComponent(texPath)}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texPath])

  // ── Blank texture for new part creation ───────────────────────────────────────
  function initNewPartTexture(w, h) {
    const buf = document.createElement('canvas')
    buf.width = w; buf.height = h
    bufRef.current = buf
    undoRef.current = []; redoRef.current = []
    setUndoCount(0); setRedoCount(0)
    setZoom(Math.max(1, Math.floor(340 / w)))
    setTexPath('')
    setTexStatus('New texture — use Save As to name it')
  }

  useEffect(() => {
    if (!createPartMode || editTab !== 'texture' || bufRef.current) return
    initNewPartTexture(newTexSize[0], newTexSize[1])
  }, [createPartMode, editTab]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // UV overlay from block editor selection
    const uvo = uvOverlayRef.current
    if (uvo) {
      const FACE_COLORS = { north:'#ff4455', south:'#44dd66', east:'#4499ff', west:'#ffcc00', up:'#44ffdd', down:'#ff44cc' }
      for (const rects of uvo.rectSets) {
        for (const [face, r] of Object.entries(rects)) {
          if (!r) continue
          const [x1,y1,x2,y2] = r
          const color = FACE_COLORS[face] || '#fff'
          const isSel = face === uvo.selFace
          const sx = Math.min(x1,x2)*zoom, sy = Math.min(y1,y2)*zoom
          const sw = Math.abs(x2-x1)*zoom,  sh = Math.abs(y2-y1)*zoom
          ctx.fillStyle = color + (isSel ? '66' : '30')
          ctx.fillRect(sx, sy, sw, sh)
          ctx.strokeStyle = color; ctx.lineWidth = isSel ? 2 : 1
          ctx.strokeRect(sx+0.5, sy+0.5, sw-1, sh-1)
          const ls = Math.max(6, zoom-1)
          ctx.font = `bold ${ls}px monospace`; ctx.fillStyle = color
          ctx.fillText(face[0].toUpperCase(), sx+2, sy+ls+1)
        }
      }
    }
  }, [zoom])

  redrawRef.current = redraw

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    redraw()
    if (pendingScrollRef.current) {
      const { container, left, top } = pendingScrollRef.current
      container.scrollLeft = left
      container.scrollTop  = top
      pendingScrollRef.current = null
    }
  }, [zoom])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { redraw() }, [texEditorMode])
  // Redraw when switching back to texture tab — canvas just mounted
  useEffect(() => { if (editTab === 'texture') redraw() }, [editTab]) // eslint-disable-line react-hooks/exhaustive-deps

  function toPixel(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return [Math.floor((e.clientX - r.left) / zoom), Math.floor((e.clientY - r.top) / zoom)]
  }

  function paintPixel(px, py) {
    const buf = bufRef.current
    if (!buf || px<0||py<0||px>=buf.width||py>=buf.height) return
    const ctx = buf.getContext('2d')
    if (tool === 'pencil') {
      const [r,g,b] = hexToRgba(color)
      ctx.clearRect(px,py,1,1); ctx.fillStyle = rgbaToSwatchCss(r,g,b,alpha); ctx.fillRect(px,py,1,1); redraw(); setTexDirty(true)
      if (texPath) setTexturePatch({ path: texPath, canvas: buf })
    } else if (tool === 'fill') {
      const imgData = ctx.getImageData(0,0,buf.width,buf.height)
      const [r,g,b] = hexToRgba(color); floodFill(imgData,px,py,r,g,b,alpha)
      ctx.putImageData(imgData,0,0); redraw(); setTexDirty(true)
      if (texPath) setTexturePatch({ path: texPath, canvas: buf })
    } else if (tool === 'eraser') {
      ctx.clearRect(px, py, 1, 1); redraw(); setTexDirty(true)
      if (texPath) setTexturePatch({ path: texPath, canvas: buf })
    } else if (tool === 'eye') {
      const d = ctx.getImageData(px,py,1,1).data
      const hex = rgbaToHex(d[0],d[1],d[2])
      setColor(hex); setHexInput(hex); setAlpha(d[3]); pushHistory(hex); setTool('pencil')
    }
  }

  function pushHistory(hex) {
    localStorage.setItem('g64-color', hex)
    setColorHistory(h => {
      const next = [hex, ...h.filter(c => c !== hex)].slice(0, 20)
      localStorage.setItem('g64-color-history', JSON.stringify(next))
      return next
    })
  }

  function saveTexUndoState() {
    const buf = bufRef.current
    if (!buf) return
    const ctx = buf.getContext('2d')
    undoRef.current.push(ctx.getImageData(0, 0, buf.width, buf.height))
    if (undoRef.current.length > 50) undoRef.current.shift()
    redoRef.current = []
    setUndoCount(undoRef.current.length)
    setRedoCount(0)
  }

  function texUndo() {
    if (!undoRef.current.length || !bufRef.current) return
    const buf = bufRef.current
    const ctx = buf.getContext('2d')
    const prev = undoRef.current.pop()
    redoRef.current.push(ctx.getImageData(0, 0, buf.width, buf.height))
    ctx.putImageData(prev, 0, 0)
    redraw(); setTexDirty(true)
    if (texPath) setTexturePatch({ path: texPath, canvas: buf })
    setUndoCount(undoRef.current.length)
    setRedoCount(redoRef.current.length)
  }

  function texRedo() {
    if (!redoRef.current.length || !bufRef.current) return
    const buf = bufRef.current
    const ctx = buf.getContext('2d')
    const next = redoRef.current.pop()
    undoRef.current.push(ctx.getImageData(0, 0, buf.width, buf.height))
    ctx.putImageData(next, 0, 0)
    redraw(); setTexDirty(true)
    if (texPath) setTexturePatch({ path: texPath, canvas: buf })
    setUndoCount(undoRef.current.length)
    setRedoCount(redoRef.current.length)
  }

  texUndoRef.current = texUndo
  texRedoRef.current = texRedo
  saveVariantRef.current = saveVariant

  const editTabRef = useRef(editTab)
  useEffect(() => { editTabRef.current = editTab }, [editTab])

  const texSaveRef = useRef(null)
  texSaveRef.current = texSave

  function switchEditTab(tab) {
    if (texPath && bufRef.current) setTexturePatch({ path: texPath, canvas: bufRef.current })
    if (tab !== 'modeler') uvOverlayRef.current = null
    setEditTab(tab)
  }

  function onTexDown(e) {
    drawingRef.current = true
    if (tool === 'drag') {
      const c = scrollContainerRef.current
      dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, scrollLeft: c?.scrollLeft ?? 0, scrollTop: c?.scrollTop ?? 0 }
      return
    }
    if (tool === 'pencil' || tool === 'fill' || tool === 'eraser') saveTexUndoState()
    if (tool === 'pencil') pushHistory(color)
    paintPixel(...toPixel(e))
  }
  function onTexMove(e) {
    const [px, py] = toPixel(e)
    setHoverPixel([px, py])
    if (!drawingRef.current) return
    if (tool === 'drag') {
      const c = scrollContainerRef.current
      const d = dragStartRef.current
      if (c && d) { c.scrollLeft = d.scrollLeft - (e.clientX - d.mouseX); c.scrollTop = d.scrollTop - (e.clientY - d.mouseY) }
      return
    }
    if (tool === 'pencil' || tool === 'eraser') paintPixel(px, py)
  }
  function onTexUp()    { drawingRef.current = false; dragStartRef.current = null; viewerStrokeRef.current = false }
  function onTexLeave() { drawingRef.current = false; dragStartRef.current = null; setHoverPixel(null); viewerStrokeRef.current = false }

  // Called by the center 3D viewer when user paints on the model surface
  function onPaintUV(u, v, isFirst) {
    const buf = bufRef.current
    if (!buf || !texPath) return
    const px = Math.floor(u * buf.width)
    const py = Math.floor((1 - v) * buf.height)
    if (px < 0 || py < 0 || px >= buf.width || py >= buf.height) return
    if (tool === 'eye') {
      const ctx = buf.getContext('2d')
      const d = ctx.getImageData(px, py, 1, 1).data
      const hex = rgbaToHex(d[0], d[1], d[2])
      setColor(hex); setHexInput(hex); setAlpha(d[3]); pushHistory(hex); setTool('pencil')
      return
    }
    if (isFirst && !viewerStrokeRef.current) {
      if (tool === 'pencil' || tool === 'fill' || tool === 'eraser') saveTexUndoState()
      if (tool === 'pencil') pushHistory(color)
      viewerStrokeRef.current = true
    }
    paintPixel(px, py)
    redrawRef.current?.()
    setTexturePatch({ path: texPath, canvas: buf })
  }
  function onTexWheel(e) {
    e.preventDefault()
    const idx = ZOOM_LEVELS.indexOf(zoom)
    const newIdx = e.deltaY < 0 ? Math.min(idx + 1, ZOOM_LEVELS.length - 1) : Math.max(idx - 1, 0)
    if (newIdx === idx) return
    const newZoom = ZOOM_LEVELS[newIdx]
    // Compute scroll so the pixel under cursor stays fixed
    const canvas = canvasRef.current
    const container = scrollContainerRef.current
    if (canvas && container) {
      const cr = canvas.getBoundingClientRect()
      const tr = container.getBoundingClientRect()
      const px = (e.clientX - cr.left) / zoom
      const py = (e.clientY - cr.top)  / zoom
      const canvasLeft = cr.left - tr.left + container.scrollLeft
      const canvasTop  = cr.top  - tr.top  + container.scrollTop
      pendingScrollRef.current = {
        container,
        left: canvasLeft + px * newZoom - (e.clientX - tr.left),
        top:  canvasTop  + py * newZoom - (e.clientY - tr.top),
      }
    }
    setZoom(newZoom)
  }

  function refreshViewers() {
    viewerRef.current?.triggerRebuild()
    setViewerVer(v => v + 1)
  }

  async function texSave() {
    if (!bufRef.current||!texPath) { setTexStatus('No texture loaded.'); return }
    setTexStatus('')
    bufRef.current.toBlob(async blob => {
      try { await api.saveTexture(texPath, blob); setTexStatus('ok'); setTexDirty(false); refreshViewers() }
      catch (e) { setTexStatus(e.message) }
    }, 'image/png')
  }

  function texSaveAs() {
    if (!bufRef.current) { setTexStatus('No texture loaded.'); return }
    // Suggest a path based on current context
    let suggested = texPath
    if (!suggested && composeSelItem?.kind === 'part' && currentBody) {
      const p = parts.find(x => x.id === composeSelItem.partId)
      suggested = `optifine/cem/${currentBody.name}/parts/${p?.name || 'texture'}.png`
    }
    setSaveAsPath(suggested || '')
    setShowSaveAs(true)
  }

  async function doSaveAs() {
    if (!bufRef.current || !saveAsPath) return
    setShowSaveAs(false)
    bufRef.current.toBlob(async blob => {
      try {
        await api.saveTexture(saveAsPath, blob)
        // If a part is selected, update its attachment_meta.texture in the DB
        if (composeSelItem?.kind === 'part') {
          const p = parts.find(x => x.id === composeSelItem.partId)
          if (p) {
            const newMeta = { ...p.attachment_meta, texture: `minecraft:${saveAsPath}` }
            await api.patchPart(p.id, { attachment_meta: newMeta })
            setParts(ps => ps.map(x => x.id === p.id ? { ...x, attachment_meta: newMeta } : x))
          }
        }
        setTexPath(saveAsPath)
        setTexStatus('ok')
        setTexDirty(false)
        refreshViewers()
      } catch (e) { setTexStatus(e.message) }
    }, 'image/png')
  }


  function onHexChange(val) {
    setHexInput(val)
    if (/^#[0-9a-fA-F]{6}$/.test(val)) { setColor(val); localStorage.setItem('g64-color', val) }
  }

  // ── Compose logic ─────────────────────────────────────────────────────────────

  function stepSlotPart(slotName, dir) {
    const opts = [null, ...(partsBySlot[slotName] || []).map(p => p.id)]
    const idx = opts.indexOf(slotSel[slotName] || null)
    setSlotSel(prev => ({ ...prev, [slotName]: opts[(idx + dir + opts.length) % opts.length] }))
  }

  function toggleExtra(partId) {
    setExtraSel(prev => { const n=new Set(prev); n.has(partId)?n.delete(partId):n.add(partId); return n })
  }
  function handleCreatePartFromFolder(folderName) {
    setCreatePartMode(true)
    setPartSaveName(folderName)
    setNewPartSlot(folderName)
    setNewPartBodyId(bodyId)
    setComposeSelItem(null)
    switchEditTab('modeler')
  }

  async function savePartFromEditor() {
    setPartSaveStatus('')
    if (!partSaveName) { setPartSaveStatus('Enter a part name.'); return }
    const { partObj, partData } = modelerRef.current?.getPartData() ?? {}
    if (!partData) { setPartSaveStatus('No part data.'); return }
    const editingPart = composeSelItem?.kind === 'part' && !createPartMode
      ? parts.find(p => p.id === composeSelItem.partId) : null
    if (!editingPart) {
      const conflict = parts.find(p => p.name === partSaveName)
      if (conflict) { setPartSaveStatus(`Part "${partSaveName}" already exists.`); return }
    }
    const saveBody = createPartMode ? bodies.find(b => b.id === newPartBodyId) || currentBody : currentBody
    const bodyName = saveBody?.name || 'unknown'
    const jpmPath  = editingPart ? editingPart.jpm_path : `minecraft:optifine/cem/${bodyName}/parts/${partSaveName}.jpm`
    try {
      const payload = {
        name:            partSaveName,
        jpm_path:        jpmPath,
        slot:            createPartMode ? newPartSlot : (editingPart?.slot ?? partObj?.slot ?? ''),
        part_data:       partData,
        attachment_meta: partObj?.attachment_meta || editingPart?.attachment_meta || {},
      }
      if (editingPart) {
        const updated = await api.updatePart(editingPart.id, payload)
        setParts(ps => ps.map(p => p.id === editingPart.id ? updated : p))
      } else {
        const created = await api.createPart(payload)
        setParts(ps => [...ps, created])
      }
      setPartSaveStatus('ok')
    } catch (e) { setPartSaveStatus(e.message) }
  }

  async function saveVariant() {
    setSaveStatus('')
    if (!saveForm.file_name) { setSaveStatus('Enter a file name.'); return }
    const payload = { file_name: saveForm.file_name, trigger_name: saveForm.trigger_name, body: bodyId, order: saveForm.order, part_ids: activeParts.map(p=>p.id) }
    try {
      if (currentVariantId) {
        await api.updateVariant(currentVariantId, payload)
      } else {
        await api.createVariant(payload)
      }
      setSaveStatus('ok')
    } catch (e) { setSaveStatus(e.message) }
  }

  async function saveAll() {
    setSaveStatus('')
    const errors = []
    // Save texture if loaded and dirty
    if (bufRef.current && texPath && texDirty) {
      await new Promise(resolve => bufRef.current.toBlob(async blob => {
        try { await api.saveTexture(texPath, blob); setTexDirty(false); refreshViewers() }
        catch (e) { errors.push(`Texture: ${e.message}`) }
        resolve()
      }, 'image/png'))
    }
    // Save variant metadata
    if (saveForm.file_name) {
      const payload = { file_name: saveForm.file_name, trigger_name: saveForm.trigger_name, body: bodyId, order: saveForm.order, part_ids: activeParts.map(p=>p.id) }
      try {
        if (currentVariantId) await api.updateVariant(currentVariantId, payload)
        else await api.createVariant(payload)
      } catch (e) { errors.push(`Variant: ${e.message}`) }
    }
    if (errors.length) setSaveStatus(errors.join(' | '))
    else setSaveStatus('ok')
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

  // ── Undo/redo keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 's') { e.preventDefault(); saveVariantRef.current?.() }
      if (editTabRef.current === 'modeler') return // Block Editor handles its own undo/redo
      if (!e.shiftKey && e.key === 'z') { e.preventDefault(); texUndoRef.current?.() }
      if (e.key === 'y' || (e.shiftKey && e.key === 'Z') || (e.shiftKey && e.key === 'z')) { e.preventDefault(); texRedoRef.current?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  // ── Texture editor full-screen mode ────────────────────────────────────────
  if (texEditorMode) return (
    <div style={{ ...s.page, flexDirection: 'row' }}>
      {/* Large canvas area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a1a', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', flexShrink: 0, borderBottom: '2px solid var(--bdr-dk)', background: 'var(--bg-panel)' }}>
          <button style={s.btnSm} onClick={() => setTexEditorMode(false)}>← Back to Studio</button>
          <span style={{ ...s.label, marginLeft: '8px' }}>{texPath || '—'}</span>
          {texBuf && <span style={s.infoRow}>{texBuf.width} × {texBuf.height} px</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
            {hoverPixel && texBuf && <span style={{ fontSize: '10px', color: 'var(--clr-text-dim)', fontFamily: 'Monocraft, sans-serif' }}>({hoverPixel[0]}, {hoverPixel[1]})</span>}
            {texStatus === 'ok' && <span style={s.ok}>Saved!</span>}
            {texStatus && texStatus !== 'ok' && <span style={s.err}>{texStatus}</span>}
          </span>
        </div>

        {/* Canvas + floating toolbox */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div ref={scrollContainerRef} style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '12px', display: 'flex', alignItems: 'flex-start' }}>
            {texPath
              ? <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated', cursor: tool === 'drag' ? 'grab' : 'crosshair' }}
                  onMouseDown={onTexDown} onMouseMove={onTexMove} onMouseUp={onTexUp} onMouseLeave={onTexLeave} onWheel={onTexWheel} />
              : <div style={{ color: 'var(--clr-text-dim)', fontFamily: 'Monocraft, sans-serif' }}>No texture loaded.</div>
            }
          </div>
          <TexToolbox
            tool={tool} setTool={setTool}
            color={color} setColor={setColor}
            hexInput={hexInput} setHexInput={setHexInput}
            alpha={alpha} setAlpha={setAlpha}
            undoCount={undoCount} redoCount={redoCount}
            texUndo={texUndo} texRedo={texRedo}
            colorHistory={colorHistory}
            onHexChange={onHexChange} pushHistory={pushHistory}
          />
        </div>

        {/* Zoom bar */}
        <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', padding: '4px 8px', borderTop: '1px solid var(--bdr-dk)', background: 'var(--bg-panel)', flexShrink: 0 }}>
          {ZOOM_LEVELS.map(z => (
            <button key={z} style={{ ...s.zoomBtn, ...(zoom === z ? s.zoomAct : {}) }} onClick={() => setZoom(z)}>{z}×</button>
          ))}
        </div>
      </div>

      {/* Right panel — save only */}
      <div style={{ width: 160, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-panel)', borderLeft: '2px solid var(--bdr-dk)' }}>
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button style={s.btn} onClick={texSave}>Save PNG</button>
          <button style={s.btn} onClick={texSaveAs}>Save As</button>
          {showSaveAs && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input style={{ ...s.inputFull, flex: 1, fontSize: '10px' }}
                value={saveAsPath} onChange={e => setSaveAsPath(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doSaveAs(); if (e.key === 'Escape') setShowSaveAs(false) }}
                placeholder="optifine/cem/..." autoFocus />
              <button style={s.btnSm} onClick={doSaveAs}>OK</button>
              <button style={s.btnSm} onClick={() => setShowSaveAs(false)}>✕</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div style={s.page}>

      {/* Top bar */}
      <div style={s.topBar}>
        <button style={s.btnSm} onClick={() => navigate('/gallery')}>← Garage</button>
        <span style={{ marginLeft: 'auto' }}>
          {activeParts.length
            ? activeParts.map(p => <span key={p.id} style={s.badge}>+{p.name}</span>)
            : <span style={{ color:'var(--clr-text-dim)', fontSize:'11px', fontFamily:'Monocraft, sans-serif' }}>no parts selected</span>}
        </span>
      </div>

      {/* Content */}
      <div style={s.content}>

        {/* ── Left panel ── */}
        <div style={{ ...s.sidebar, width: leftWidth }}>

          {partEditMode ? (() => {
            // ── Part Edit Mode: simplified single-part view ──
            const editingPart = composeSelItem?.kind === 'part'
              ? parts.find(p => p.id === composeSelItem.partId) : null
            const partMini = editingPart ? partToMiniJem(editingPart) : null
            return (
              <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
                <div style={{ ...XP_TITLE, display:'flex', alignItems:'center', gap:'6px' }}>
                  <button style={{ ...s.btnSm, fontSize:'9px', padding:'1px 6px' }}
                    onClick={() => createPartMode ? setCreatePartMode(false) : navigate('/parts-library')}>←</button>
                  <span style={{ flex:1 }}>{createPartMode ? 'Creating New Part' : 'Editing Part'}</span>
                </div>
                <div style={{ flex:1, overflowY:'auto', padding:'6px' }}>
                  {editingPart ? (
                    <div style={s.slotBox}>
                      <div style={s.miniViewer}>
                        {partMini
                          ? <CemViewer key={viewerVer} jem={partMini} onError={()=>{}} autoRotate sidebarOffset={0} showGrid={false} showAxes={false} fitScale={0.55} enableZoom={false} bgColor={bg} />
                          : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.25)', fontSize:'10px', fontFamily:'Monocraft, sans-serif' }}>no preview</div>
                        }
                      </div>
                      <div style={{ padding:'6px 8px', display:'flex', flexDirection:'column', gap:'6px' }}>
                        <div style={{ fontSize:'11px', fontWeight:'bold', color:'var(--clr-text)', fontFamily:'Monocraft, sans-serif' }}>{editingPart.name}</div>
                        <div style={{ fontSize:'9px', color:'var(--clr-text-dim)', fontFamily:'monospace', wordBreak:'break-all' }}>{editingPart.jpm_path}</div>
                        <div>
                          <div style={s.label}>Category</div>
                          <select style={s.select} value={editingPart.slot || ''}
                            onChange={async e => {
                              const slot = e.target.value
                              await api.patchPart(editingPart.id, { slot })
                              setParts(ps => ps.map(p => p.id === editingPart.id ? { ...p, slot } : p))
                            }}>
                            <option value="">Standalone (no category)</option>
                            {slots.map(sl => <option key={sl.id} value={sl.name}>{sl.display_name}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : createPartMode ? (
                    <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:'12px' }}>
                      <div>
                        <div style={s.label}>Car Body</div>
                        <select style={s.select} value={newPartBodyId ?? ''} onChange={e => setNewPartBodyId(Number(e.target.value))}>
                          {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={s.label}>Category</div>
                        <select style={s.select} value={newPartSlot} onChange={e => setNewPartSlot(e.target.value)}>
                          <option value="">Standalone (no category)</option>
                          {slots.map(sl => <option key={sl.id} value={sl.name}>{sl.display_name}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding:'8px', fontSize:'11px', color:'var(--clr-text-dim)', fontFamily:'Monocraft, sans-serif' }}>No part selected.</div>
                  )}
                </div>
                <div style={s.saveBar}>
                  <span style={s.label}>Save as part (.jpm)</span>
                  <input style={s.inputFull} placeholder="part_name e.g. miata_duce_wheels"
                    value={partSaveName} onChange={e => setPartSaveName(e.target.value)} />
                  <button style={s.btn} onClick={savePartFromEditor}>Save Part</button>
                  {partSaveStatus === 'ok' && <span style={s.ok}>Saved!</span>}
                  {partSaveStatus && partSaveStatus !== 'ok' && <span style={s.err}>{partSaveStatus}</span>}
                </div>
              </div>
            )
          })() : (
          <>
          <div style={{ ...XP_TITLE, display:'flex', alignItems:'center' }}>
            <span style={{ flex:1 }}>Compose</span>
            <input type="checkbox" checked={showCompose} onChange={() => setShowCompose(v => !v)}
              style={{ cursor:'pointer', margin:0, accentColor:'var(--clr-accent)' }} />
          </div>

          {showCompose && <div style={s.tabContent}>

            {/* Body box */}
            <div style={{ ...s.slotBox, ...(composeSelItem?.kind==='body' ? { outline:'2px solid #4488ff' } : {}) }}
              onClick={() => setComposeSelItem({ kind:'body' })}>
              <div style={s.slotHeader}>
                <span style={s.slotTitle}>Body</span>
                <input type="checkbox" checked={showBodyViewer} onChange={e => { e.stopPropagation(); setShowBodyViewer(v => !v) }}
                  onClick={e => e.stopPropagation()} style={{ cursor:'pointer', margin:0, accentColor:'var(--clr-accent)' }} />
              </div>
              {showBodyViewer && <div style={s.miniViewer}>
                {bodyMiniJem
                  ? <CemViewer key={viewerVer} jem={bodyMiniJem} onError={()=>{}} autoRotate sidebarOffset={0} showGrid={false} showAxes={false} fitScale={0.55} enableZoom={false} bgColor={bg} />
                  : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--clr-accent)', fontSize:'10px', fontFamily:'Monocraft, sans-serif', cursor:'pointer', opacity:0.7 }}
                      onClick={e=>{e.stopPropagation();setShowNewBody(true)}}>Create New Body</div>
                }
              </div>}
              <div style={s.slotNav}>
                {showNewBody
                  ? <form style={{display:'flex',gap:'3px',flex:1,alignItems:'center'}} onSubmit={async e=>{
                      e.preventDefault();e.stopPropagation()
                      if(!newBodyName.trim())return
                      try{const b=await api.createBody({name:newBodyName.trim(),body_data:{models:[],texture:'',textureSize:[64,32]}});setBodies(bs=>[...bs,b]);setBodyId(b.id);setShowNewBody(false);setNewBodyName('')}catch(err){alert(err.message)}
                    }} onClick={e=>e.stopPropagation()}>
                      <input autoFocus style={{...s.input,flex:1,fontSize:'10px'}} placeholder="body name" value={newBodyName} onChange={e=>setNewBodyName(e.target.value)}/>
                      <button type="submit" style={s.editBtn}>✓</button>
                      <button type="button" style={s.editBtn} onClick={()=>{setShowNewBody(false);setNewBodyName('')}}>✕</button>
                    </form>
                  : <>
                      <select
                        style={{...s.select, flex:1, fontSize:'10px'}}
                        value={bodyId ?? ''}
                        onClick={e=>e.stopPropagation()}
                        onChange={e=>{e.stopPropagation();setBodyId(e.target.value ? Number(e.target.value) : null)}}
                      >
                        <option value=''>— none —</option>
                        {bodies.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <div style={s.editBtns}>
                        <button style={s.editBtn} title="Create new body" onClick={e=>{e.stopPropagation();setShowNewBody(true)}}>+</button>
                        <button style={s.editBtn} title="Edit body" onClick={e=>{e.stopPropagation();setComposeSelItem({kind:'body'});switchEditTab('modeler')}}>Edit</button>
                      </div>
                    </>
                }
              </div>
            </div>

            {slots.map(slot => {
              const slotParts = partsBySlot[slot.name] || []
              const selected  = slotSel[slot.name] || null
              const selPart   = slotParts.find(p => p.id === selected) || null
              const miniJem   = selPart ? partToMiniJem(selPart) : null
              return (
                <div key={slot.id}
                  style={{ ...s.slotBox, ...(composeSelItem?.kind==='part' && composeSelItem.partId===selPart?.id ? { outline:'2px solid #4488ff' } : {}) }}
                  onClick={() => selPart && setComposeSelItem({ kind:'part', partId: selPart.id })}>
                  <div style={s.slotHeader}>
                    <span style={s.slotTitle}>{slot.display_name}</span>
                    <input type="checkbox" checked={showSlotViewer[slot.name] !== false} onChange={() => setShowSlotViewer(v => ({ ...v, [slot.name]: v[slot.name] === false }))}
                      onClick={e => e.stopPropagation()} style={{ cursor:'pointer', margin:0, accentColor:'var(--clr-accent)' }} />
                  </div>
                  {showSlotViewer[slot.name] !== false && <div style={s.miniViewer}>
                    {miniJem
                      ? <CemViewer key={`${slot.id}-${viewerVer}`} jem={miniJem} onError={()=>{}} autoRotate sidebarOffset={0} showGrid={false} showAxes={false} fitScale={0.55} enableZoom={false} bgColor={bg} />
                      : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--clr-accent)', fontSize:'10px', fontFamily:'Monocraft, sans-serif', cursor:'pointer', opacity:0.6 }}
                          onClick={e=>{e.stopPropagation();handleCreatePartFromFolder(slot.name)}}>Create New Part</div>
                    }
                  </div>}
                  <div style={s.slotNav}>
                    <button style={s.slotNavBtn} onClick={() => stepSlotPart(slot.name, -1)}>◀</button>
                    {selPart
                      ? <span style={s.partLabel}>{selPart.name}</span>
                      : <span style={{...s.partLabel, cursor:'pointer', color:'var(--clr-accent)', textDecoration:'underline'}}
                          onClick={e=>{e.stopPropagation();handleCreatePartFromFolder(slot.name)}}>
                          Create New Part
                        </span>}
                    {selPart && (
                      <div style={s.editBtns}>
                        <button style={s.editBtn} title="Edit part" onClick={e=>{e.stopPropagation();setComposeSelItem({kind:'part',partId:selPart.id});switchEditTab('modeler')}}>Edit</button>
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
                        <button style={s.editBtn} title="Edit part" onClick={e=>{e.stopPropagation();setComposeSelItem({kind:'part',partId:p.id});switchEditTab('modeler')}}>Edit</button>
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
                      <span style={{ fontSize:'11px', flex:1, color:'var(--clr-text)', fontFamily:'Monocraft, sans-serif' }}>
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

          </div>}{/* tabContent / showCompose */}

          {showCompose && <div style={s.saveBar}>
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
            <button style={s.btn} onClick={saveAll}>Save</button>
            {saveStatus==='ok' && <span style={s.ok}>Saved!</span>}
            {saveStatus && saveStatus!=='ok' && <span style={s.err}>{saveStatus}</span>}
          </div>}
          </>)}
        </div>{/* left panel */}

        {/* ── Left divider ── */}
        <div style={s.divider} onMouseDown={e => { e.preventDefault(); dragRef2.current = { side:'left', startX: e.clientX, startW: leftWidth } }} />

        {/* ── Center: 3D viewer (always visible) ── */}
        <div style={{ ...s.centerPanel, position: 'relative', display: 'flex', flexDirection: 'column' }}>

          {/* Toolbox bar above viewer */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px', borderBottom: '1px solid var(--bdr-dk)', background: 'var(--bg-panel)', flexWrap: 'wrap' }}>
            {editTab === 'modeler' ? <>
              {/* Block Editor toolbar */}
              {[['translate','⤢','Move (W)'],['rotate','↻','Rotate (E)'],['pivot','⊙','Move Pivot']].map(([id,icon,label]) => (
                <button key={id} title={label}
                  style={{ ...s.btnSm, ...(modelerBar.tcMode===id ? { background:'var(--bg-btn-active)', borderTopColor:'var(--bdr-dk)', borderLeftColor:'var(--bdr-dk)', borderRightColor:'var(--bdr-input-lt)', borderBottomColor:'var(--bdr-input-lt)' } : {}) }}
                  onClick={() => modelerRef.current?.setTcMode(id)}>{icon}</button>
              ))}
              <div style={{ width: '1px', height: '18px', background: 'var(--bdr-dk)', margin: '0 2px' }} />
              <button title="Undo (Ctrl+Z)" style={{ ...s.btnSm, opacity: modelerBar.undoCount ? 1 : 0.4 }} onClick={() => modelerRef.current?.undo()} disabled={!modelerBar.undoCount}>↩</button>
              <button title="Redo (Ctrl+Shift+Z)" style={{ ...s.btnSm, opacity: modelerBar.redoCount ? 1 : 0.4 }} onClick={() => modelerRef.current?.redo()} disabled={!modelerBar.redoCount}>↪</button>
              <div style={{ width: '1px', height: '18px', background: 'var(--bdr-dk)', margin: '0 2px' }} />
              <button title="Add Cube" style={s.btnSm} onClick={() => modelerRef.current?.addCube()}>+ Cube</button>
              <button title="Delete Selected (Del)" style={{ ...s.btnSm, opacity: modelerBar.hasSel ? 1 : 0.4 }} onClick={() => modelerRef.current?.deleteSelected()} disabled={!modelerBar.hasSel}>✕ Delete</button>
            </> : <>
              {/* Texture toolbar */}
              {[['drag','✥'],['pencil','✏'],['fill','▦'],['eraser','◻'],['eye','⊕']].map(([id, icon]) => (
                <button key={id} title={id} style={{ ...s.btnSm, ...(tool===id ? { background:'var(--bg-btn-active)', borderTopColor:'var(--bdr-dk)', borderLeftColor:'var(--bdr-dk)', borderRightColor:'var(--bdr-input-lt)', borderBottomColor:'var(--bdr-input-lt)' } : {}) }}
                  onClick={() => setTool(id)}>{icon}</button>
              ))}
              <div style={{ width: '1px', height: '18px', background: 'var(--bdr-dk)', margin: '0 2px' }} />
              <button title="Undo" style={{ ...s.btnSm, opacity: undoCount ? 1 : 0.4 }} onClick={texUndo} disabled={!undoCount}>↩</button>
              <button title="Redo" style={{ ...s.btnSm, opacity: redoCount ? 1 : 0.4 }} onClick={texRedo} disabled={!redoCount}>↪</button>
              <div style={{ width: '1px', height: '18px', background: 'var(--bdr-dk)', margin: '0 2px' }} />
              <div title="Color" style={{ width: '22px', height: '22px', background: `rgba(${(hexInput||'#000000').replace('#','').match(/../g).map(h=>parseInt(h,16)).join(',')},${(alpha/255).toFixed(2)})`, border: '2px solid var(--bdr-dk)', cursor: 'pointer', flexShrink: 0 }}
                onClick={() => document.getElementById('_tbCenterPicker').click()} />
              <input id="_tbCenterPicker" type="color" value={color}
                style={{ position:'absolute', opacity:0, pointerEvents:'none', width:0, height:0 }}
                onChange={e => { setColor(e.target.value); setHexInput(e.target.value) }} />
              <input style={{ ...s.input, width: '72px', fontSize: '10px' }} value={hexInput} maxLength={7}
                onChange={e => onHexChange(e.target.value)} placeholder="#rrggbb" />
              <input type="range" min={0} max={255} value={alpha} onChange={e => setAlpha(Number(e.target.value))}
                style={{ width: '60px', accentColor: 'var(--clr-accent)' }} title={`Alpha: ${alpha}`} />
            </>}
          </div>

          {/* 3D viewer */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {(centerJem || editTab === 'modeler')
            ? <CemViewer ref={viewerRef} jem={editTab === 'modeler' ? null : (partEditMode ? centerJem : viewerJem)} onError={()=>{}} showGrid={showGrid} showAxes={false} bgColor={bg}
                initialCamera={initialCamera} showNavCube
                enablePaint={editTab !== 'modeler' && !!texPath && tool !== 'drag'} onPaintUV={onPaintUV} texturePatch={texturePatch} paintTexPath={texPath} />
            : <div style={{ color:'var(--clr-text-dim)', padding:'2rem', fontSize:'0.9rem' }}>Select a body to preview.</div>}
          {/* Grid toggle */}
          <div style={{ position:'absolute', top:'10px', left:'10px' }}>
            <button
              style={{ ...s.btnSm, ...(showGrid ? { background:'var(--bg-btn-active)', borderTop:'1px solid var(--bdr-dk)', borderLeft:'1px solid var(--bdr-dk)', borderRight:'1px solid var(--bdr-input-lt)', borderBottom:'1px solid var(--bdr-input-lt)' } : {}) }}
              onClick={() => setShowGrid(g => !g)}>⊞ Grid</button>
          </div>
          </div>{/* inner flex viewer */}
        </div>{/* centerPanel */}

        {/* ── Right divider ── */}
        <div style={s.divider} onMouseDown={e => { e.preventDefault(); dragRef2.current = { side:'right', startX: e.clientX, startW: rightWidth } }} />

        {/* ── Right panel — Texture / Advanced Editor tabs ── */}
        <div style={{ ...s.rightPanelEdit, width: rightWidth }}>

          {/* Tab bar */}
          <div style={s.tabBar}>
            {[['texture','Texture'],['modeler','Block Editor']].map(([tab,label]) => (
              <button key={tab}
                style={{ ...s.tab, background: editTab===tab?'var(--clr-accent)':'var(--bg-panel-alt)', color: editTab===tab?'#fff':'var(--clr-text-dim)' }}
                onClick={() => switchEditTab(tab)}>{label}</button>
            ))}
          </div>

          {/* Scrollable content under the active tab */}
          {editTab === 'modeler' ? (
            <Modeler ref={modelerRef} sharedViewerRef={viewerRef} embedded texturePatch={texturePatch}
              bodyId={bodyId}
              partId={composeSelItem?.kind === 'part' ? composeSelItem.partId : null}
              newPart={createPartMode && !composeSelItem}
              onBack={() => switchEditTab('texture')}
              onBarUpdate={setModelerBar}
              showGridProp={showGrid}
              uvZoom={zoom}
              onUvChange={data => { uvOverlayRef.current = data; redrawRef.current?.() }}
              />
          ) : (
          <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'0', background:'var(--bg-panel)', minHeight:0 }}>

            {/* Target selector */}
            <div style={{ padding:'4px 6px', display:'flex', gap:'4px', alignItems:'center', borderBottom:'1px solid var(--bdr-dk)', flexShrink:0 }}>
              {editTab === 'texture' ? (
                <select style={{ ...s.select, flex:1 }} value={texTargetId} onChange={e => setTexTargetId(e.target.value)}>
                  <option value="">Body: {currentBody?.name ?? '—'}</option>
                  {activeParts.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              ) : (
                <select style={{ ...s.select, flex:1 }} value={uvPartId??''} onChange={e => { const id = e.target.value ? Number(e.target.value) : null; setUvPartId(id) }}>
                  <option value="">Body: {currentBody?.name ?? '—'}</option>
                  {activeParts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            {/* ── New part texture size picker ── */}
            {createPartMode && <div style={{ padding:'4px 6px 6px', borderBottom:'1px solid var(--bdr-dk)', flexShrink:0 }}>
              <div style={{ fontSize:'10px', color:'var(--clr-text-dim)', marginBottom:'4px', fontFamily:'Monocraft, sans-serif' }}>Texture Size</div>
              <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                <input type="number" style={{ ...s.input, width:'44px' }} value={newTexSize[0]}
                  onChange={e => setNewTexSize(v => [Number(e.target.value)||v[0], v[1]])} min={1} max={512} />
                <span style={{ fontSize:'10px', color:'var(--clr-text-dim)' }}>×</span>
                <input type="number" style={{ ...s.input, width:'44px' }} value={newTexSize[1]}
                  onChange={e => setNewTexSize(v => [v[0], Number(e.target.value)||v[1]])} min={1} max={512} />
                <button style={s.btnSm} onClick={() => { bufRef.current = null; initNewPartTexture(newTexSize[0], newTexSize[1]) }}>New</button>
              </div>
            </div>}

            {/* ── TEXTURE PAINTER ── */}
            <div style={{ ...XP_TITLE, flexShrink:0 }}>Texture Painter{texDirty ? ' *' : ''}</div>
            <div style={{ padding:'4px', display:'flex', flexDirection:'column', gap:'4px' }}>

              {/* Fullscreen button */}
              <div style={{ display:'flex', padding:'2px 4px' }}>
                <button style={{ ...s.btnSm, marginLeft:'auto' }} onClick={() => setTexEditorMode(true)}>⛶ Full Editor</button>
              </div>

              {/* Texture path + dimensions */}
              <div style={{ padding:'0 4px', display:'flex', flexDirection:'column', gap:'3px' }}>
                <input style={{ ...s.inputFull, fontSize:'10px' }}
                  value={texPath} onChange={e => setTexPath(e.target.value)}
                  placeholder="textures/entity/..." />
                {texBuf && <div style={s.infoRow}>{texBuf.width} × {texBuf.height} px</div>}
              </div>

              {/* Canvas */}
              <div ref={scrollContainerRef} style={{ overflow:'auto', maxHeight:'340px', background:'#111', border:'1px solid var(--bdr-dk)', margin:'0 4px' }}>
                {texPath
                  ? <canvas ref={canvasRef} style={{ display:'block', imageRendering:'pixelated', cursor: tool==='drag'?'grab':'crosshair' }}
                      onMouseDown={onTexDown} onMouseMove={onTexMove} onMouseUp={onTexUp} onMouseLeave={onTexLeave} />
                  : <div style={{ padding:'8px', color:'var(--clr-text-dim)', fontSize:'11px', fontFamily:'Monocraft, sans-serif' }}>No texture loaded.</div>
                }
              </div>

              {/* Zoom */}
              <div style={{ ...s.zoomRow, padding:'0 4px' }}>
                {ZOOM_LEVELS.map(z => (
                  <button key={z} style={{ ...s.zoomBtn, ...(zoom===z?s.zoomAct:{}) }} onClick={()=>setZoom(z)}>{z}×</button>
                ))}
                {hoverPixel && texBuf && <span style={{ marginLeft:'auto', fontSize:'10px', color:'var(--clr-text-dim)', fontFamily:'Monocraft, sans-serif' }}>({hoverPixel[0]},{hoverPixel[1]})</span>}
              </div>

              <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap', padding:'0 4px 8px' }}>
                <button style={s.btn} onClick={texSave}>Save PNG</button>
                <button style={s.btn} onClick={texSaveAs}>Save As</button>
                {texStatus==='ok' && <span style={s.ok}>Saved!</span>}
                {texStatus && texStatus!=='ok' && <span style={s.err}>{texStatus}</span>}
              </div>
              {showSaveAs && (
                <div style={{ display:'flex', gap:'4px', alignItems:'center', padding:'0 4px 8px' }}>
                  <input style={{ ...s.inputFull, flex:1, fontSize:'10px' }}
                    value={saveAsPath} onChange={e => setSaveAsPath(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doSaveAs(); if (e.key === 'Escape') setShowSaveAs(false) }}
                    placeholder="optifine/cem/..." autoFocus />
                  <button style={s.btnSm} onClick={doSaveAs}>OK</button>
                  <button style={s.btnSm} onClick={() => setShowSaveAs(false)}>✕</button>
                </div>
              )}
            </div>

          </div>
          )}

        </div>{/* right panel */}

      </div>{/* content */}

    </div>
  )
}
