/**
 * Modeler — Blockbench-style CEM geometry editor.
 * Outliner | 3D viewport with TransformControls gizmos | Properties panel.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTheme } from '../ThemeContext'
import * as THREE from 'three'
import { OrbitControls }     from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { api } from '../api'
import { collectTexturePaths, normTexPath, jemToScene } from '../cem'
import CemViewer from '../components/CemViewer'

const DEG = Math.PI / 180

// ── styles ─────────────────────────────────────────────────────────────────────

const XP_TITLE  = { background:'var(--bg-title)', color:'var(--clr-text-on-title)', padding:'2px 8px', fontSize:'11px', fontWeight:'bold', fontFamily:'Monocraft, sans-serif', textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0 }
const XP_BTN_SM = { padding:'2px 8px', background:'var(--bg-btn)', borderTop:'1px solid var(--bdr-btn-lt)', borderLeft:'1px solid var(--bdr-btn-lt)', borderRight:'1px solid var(--bdr-btn-dk)', borderBottom:'1px solid var(--bdr-btn-dk)', color:'var(--clr-text)', cursor:'pointer', fontSize:'11px', fontFamily:'Monocraft, sans-serif', fontWeight:'bold' }
const XP_INPUT  = { padding:'3px 6px', background:'var(--bg-input)', color:'var(--clr-text)', borderTop:'2px solid var(--bdr-dk)', borderLeft:'2px solid var(--bdr-dk)', borderRight:'2px solid var(--bdr-input-lt)', borderBottom:'2px solid var(--bdr-input-lt)', fontFamily:'Monocraft, sans-serif', fontSize:'11px' }

const s = {
  page:      { display:'flex', flexDirection:'column', height:'calc(100vh - 48px)', background:'var(--bg-window)', margin:'-1.5rem -2rem', overflow:'hidden' },
  topBar:    { display:'flex', alignItems:'center', gap:'6px', padding:'4px 8px', flexShrink:0, borderBottom:'2px solid var(--bdr-dk)', background:'var(--bg-panel)' },
  content:   { flex:1, display:'flex', overflow:'hidden' },
  outliner:  { width:240, flexShrink:0, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg-panel)', borderRight:'2px solid var(--bdr-dk)' },
  viewport:  { flex:1, position:'relative', overflow:'hidden' },
  rPanel:    { flexShrink:0, position:'relative', display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg-panel)', borderLeft:'2px solid var(--bdr-dk)' },
  label:     { color:'var(--clr-text-dim)', fontSize:'11px', fontFamily:'Monocraft, sans-serif' },
  btnSm:     XP_BTN_SM,
  btnAct:    { ...XP_BTN_SM, background:'var(--bg-btn-active)', borderTop:'1px solid var(--bdr-dk)', borderLeft:'1px solid var(--bdr-dk)', borderRight:'1px solid var(--bdr-input-lt)', borderBottom:'1px solid var(--bdr-input-lt)' },
  btn:       { padding:'4px 16px', background:'var(--bg-btn-primary)', borderTop:'2px solid var(--bdr-btn-primary-lt)', borderLeft:'2px solid var(--bdr-btn-primary-lt)', borderRight:'2px solid var(--bdr-btn-primary-dk)', borderBottom:'2px solid var(--bdr-btn-primary-dk)', color:'#fff', fontFamily:'Monocraft, sans-serif', fontSize:'11px', fontWeight:'bold', cursor:'pointer' },
  divider:   { width:1, height:22, background:'var(--bdr-dk)', margin:'0 2px', flexShrink:0 },
  select:    { ...XP_INPUT },
  numInput:  { ...XP_INPUT, flex:1, minWidth:'40px' },
  propLabel: { color:'var(--clr-text-dim)', fontSize:'10px', fontFamily:'Monocraft, sans-serif', width:'14px', textAlign:'right', flexShrink:0 },
  ok:        { color:'var(--clr-ok)', fontSize:'11px', fontFamily:'Monocraft, sans-serif' },
  err:       { color:'var(--clr-err)', fontSize:'11px', fontFamily:'Monocraft, sans-serif' },
  treeRow:   { display:'flex', alignItems:'center', gap:'3px', padding:'1px 4px', cursor:'pointer', fontSize:'11px', fontFamily:'Monocraft, sans-serif', userSelect:'none', minHeight:'20px' },
}

// ── Scene building — uses cem.js for correct rendering, annotates for picking ──

function annotateGroup(group, model, modelPath) {
  group.userData.cemSel = { kind:'model', modelPath }
  let boxIdx = 0, subIdx = 0
  for (const child of group.children) {
    if (child.isMesh) {
      child.userData.cemSel = { kind:'box', modelPath, boxIdx }; boxIdx++
    } else if (child.isGroup) {
      annotateGroup(child, (model.submodels||[])[subIdx], [...modelPath, subIdx]); subIdx++
    }
  }
}

function buildSceneRoot(jem, textureMap) {
  const root = jemToScene(jem, textureMap)
  const models = jem.models || []
  let childIdx = 0
  for (let mi = 0; mi < models.length; mi++) {
    if ('model' in models[mi]) continue // skipped by jemToScene
    if (childIdx < root.children.length) {
      annotateGroup(root.children[childIdx], models[mi], [mi]); childIdx++
    }
  }
  return root
}

// ── CEM data utilities ─────────────────────────────────────────────────────────

function getNode(models, modelPath) {
  if (!models||!modelPath?.length) return null
  let n=models[modelPath[0]]
  for (let i=1;i<modelPath.length;i++) n=n?.submodels?.[modelPath[i]]??null
  return n
}

function updateNode(models, modelPath, updater) {
  const clone=JSON.parse(JSON.stringify(models))
  if (modelPath.length===1) { clone[modelPath[0]]=updater(clone[modelPath[0]]); return clone }
  let n=clone[modelPath[0]]
  for (let i=1;i<modelPath.length-1;i++) n=n.submodels[modelPath[i]]
  n.submodels[modelPath[modelPath.length-1]]=updater(n.submodels[modelPath[modelPath.length-1]])
  return clone
}

function selKey(sel) {
  if (!sel) return ''
  return sel.kind==='model' ? `m_${sel.modelPath.join('_')}` : `b_${sel.modelPath.join('_')}_${sel.boxIdx}`
}

function findThreeObj(root, sel) {
  if (!root||!sel) return null
  let found=null
  root.traverse(obj=>{ if (!found && selKey(obj.userData.cemSel)===selKey(sel)) found=obj })
  return found
}

function partToJem(part) {
  const meta = part.attachment_meta || {}
  const tex = (meta.textureFile || meta.texture || '').replace(/^minecraft:/, '')
  // Mirror compiled_jem: attachment_meta is the outer group, part_data is a submodel.
  // This ensures the attachment's invertAxis/rotate/translate are applied, matching
  // how the part appears when assembled into the full body JEM.
  const outerModel = { ...meta, submodels: [part.part_data] }
  delete outerModel.model  // strip any .jpm path ref
  return {
    ...(tex ? { texture: tex } : {}),
    textureSize: meta.textureSize || [64, 32],
    models: [outerModel],
  }
}

function disposeGroup(group) {
  group.traverse(obj=>{
    obj.geometry?.dispose()
    const mats=obj.material ? (Array.isArray(obj.material)?obj.material:[obj.material]) : []
    mats.forEach(m=>{ if(m.map)m.map.dispose(); m.dispose() })
  })
}

// ── UV helpers ─────────────────────────────────────────────────────────────────
const FACE_COLORS = { north:'#ff4455', south:'#44dd66', east:'#4499ff', west:'#ffcc00', up:'#44ffdd', down:'#ff44cc' }
const FACES = ['north','south','east','west','up','down']

function textureOffsetRects(u,v,w,h,d) {
  return {
    up:    [u+d,       v,   u+d+w,     v+d  ],
    down:  [u+d+w,     v,   u+2*d+w,   v+d  ],
    west:  [u,         v+d, u+d,       v+d+h],
    south: [u+d,       v+d, u+d+w,     v+d+h],
    east:  [u+d+w,     v+d, u+2*d+w,   v+d+h],
    north: [u+2*d+w,   v+d, u+2*d+2*w, v+d+h],
  }
}

function getFaceRects(box) {
  if (!box) return {}
  if (box.textureOffset) {
    const [u,v] = box.textureOffset
    const [,,,w,h,d] = box.coordinates
    return textureOffsetRects(u,v,w,h,d)
  }
  return { north:box.uvNorth, south:box.uvSouth, east:box.uvEast, west:box.uvWest, up:box.uvUp, down:box.uvDown }
}

// ── UV helpers (shared) ───────────────────────────────────────────────────────

function collectBoxes(model) {
  const result = []
  for (const box of (model.boxes || [])) result.push(box)
  for (const sub of (model.submodels || [])) result.push(...collectBoxes(sub))
  return result
}

// ── Model move helpers ────────────────────────────────────────────────────────

// Remove node at modelPath, return [newModels, removedNode]
function extractModel(models, path) {
  const m = JSON.parse(JSON.stringify(models))
  const idx = path[path.length - 1]
  if (path.length === 1) { const [n] = m.splice(idx, 1); return [m, n] }
  let parent = m[path[0]]
  for (let i = 1; i < path.length - 1; i++) parent = parent.submodels[path[i]]
  const [n] = parent.submodels.splice(idx, 1)
  return [m, n]
}

// Insert node as last submodel of the node at targetPath (or at top level if targetPath=[])
function nestModel(models, targetPath, node) {
  const m = JSON.parse(JSON.stringify(models))
  if (targetPath.length === 0) { m.push(node); return m }
  let t = m[targetPath[0]]
  for (let i = 1; i < targetPath.length; i++) t = t.submodels[targetPath[i]]
  if (!t.submodels) t.submodels = []
  t.submodels.push(node)
  return m
}

// After removing src at srcPath, the targetPath may shift at the divergence level
function adjustPath(srcPath, tgtPath) {
  const adj = [...tgtPath]
  // Find first level where they share the same parent chain
  let shared = 0
  while (shared < srcPath.length - 1 && shared < tgtPath.length && srcPath[shared] === tgtPath[shared]) shared++
  // At level `shared`, src's removal may shift tgt's index
  if (shared === srcPath.length - 1 && shared < tgtPath.length && srcPath[shared] < tgtPath[shared]) {
    adj[shared]--
  }
  return adj
}

// ── Outliner ──────────────────────────────────────────────────────────────────

function OutlinerNode({model, modelPath, sel, onSel, onDragStart, onDrop, depth=0, hiddenModels, onToggleVisible, onRename, onDelete}) {
  const [open,setOpen]=useState(false)
  const [editing,setEditing]=useState(false)
  const [editVal,setEditVal]=useState('')
  const [ctxMenu,setCtxMenu]=useState(null)
  const [dropOver, setDropOver]=useState(false)

  useEffect(()=>{
    if (!ctxMenu) return
    function close(){setCtxMenu(null)}
    window.addEventListener('click',close)
    window.addEventListener('contextmenu',close)
    return ()=>{window.removeEventListener('click',close);window.removeEventListener('contextmenu',close)}
  },[ctxMenu])
  const hoverTimer = useRef(null)
  const indent=depth*14
  const isSel=sel?.kind==='model'&&selKey(sel)===selKey({kind:'model',modelPath})

  // Auto-open when selection is inside this node
  useEffect(()=>{
    if (!sel?.modelPath) return
    const sp=sel.modelPath
    const isAnc = sp.length > modelPath.length && modelPath.every((v,i)=>sp[i]===v)
    const isParent = sel.kind==='box' && sp.length===modelPath.length && modelPath.every((v,i)=>sp[i]===v)
    if (isAnc || isParent) setOpen(true)
  },[sel]) // eslint-disable-line react-hooks/exhaustive-deps

  function onDragOverNode(e) {
    e.preventDefault(); e.stopPropagation(); setDropOver(true)
    if (!hoverTimer.current) hoverTimer.current = setTimeout(() => setOpen(true), 600)
  }
  function onDragLeaveNode() {
    setDropOver(false)
    clearTimeout(hoverTimer.current); hoverTimer.current = null
  }

  const hasChildren=(model.boxes?.length||0)+(model.submodels?.length||0)>0
  const isHidden = hiddenModels?.has(modelPath.join('_'))
  return (
    <div>
      <div draggable
        onDragStart={e=>{e.stopPropagation();onDragStart({kind:'model',modelPath})}}
        onDragOver={onDragOverNode}
        onDragLeave={onDragLeaveNode}
        onDrop={e=>{e.stopPropagation();setDropOver(false);clearTimeout(hoverTimer.current);hoverTimer.current=null;onDrop({kind:'model',modelPath})}}
        style={{...s.treeRow, paddingLeft:4+indent,
          background:isSel?'var(--clr-accent)':dropOver?'rgba(100,160,255,0.18)':'transparent',
          color:isSel?'#fff':'var(--clr-text)',
          outline:dropOver?'1px dashed #4488ff':'none', cursor:'grab'}}
        onClick={()=>onSel({kind:'model',modelPath})}
        onContextMenu={e=>{e.preventDefault();e.stopPropagation();onSel({kind:'model',modelPath});setCtxMenu({x:e.clientX,y:e.clientY})}}>
        <span style={{fontSize:'9px',width:'10px',color:isSel?'#fff':'var(--clr-text-dim)',flexShrink:0}}
          onClick={e=>{e.stopPropagation();setOpen(v=>!v)}}>
          {hasChildren?(open?'▼':'▶'):' '}
        </span>
        <span style={{color:isSel?'#fff':'#88aaff'}}>{(model.submodels?.length && !model.boxes?.length) ? '📁' : '⬡'}</span>
        <span style={{flex:1,opacity:isHidden?0.4:1}}
          onDoubleClick={e=>{e.stopPropagation();setEditVal(model.id||model.part||'');setEditing(true)}}>
          {editing
            ? <input autoFocus value={editVal}
                style={{background:'var(--bg-panel)',color:'var(--clr-text)',border:'1px solid var(--clr-accent)',borderRadius:2,width:'90%',fontSize:'inherit',padding:'0 2px'}}
                onChange={e=>setEditVal(e.target.value)}
                onBlur={()=>{if(editVal.trim()&&onRename)onRename(modelPath,editVal.trim());setEditing(false)}}
                onKeyDown={e=>{if(e.key==='Enter'){if(editVal.trim()&&onRename)onRename(modelPath,editVal.trim());setEditing(false)}else if(e.key==='Escape'){setEditing(false)}e.stopPropagation()}}
                onClick={e=>e.stopPropagation()}/>
            : model.id||model.part||`bone ${modelPath[modelPath.length-1]}`}
        </span>
        {onToggleVisible&&<span title={isHidden?'Show':'Hide'}
          onClick={e=>{e.stopPropagation();onToggleVisible(modelPath)}}
          style={{marginLeft:'auto',fontSize:'11px',opacity:isHidden?0.35:0.7,cursor:'pointer',paddingRight:'2px',flexShrink:0}}>
          {isHidden?'○':'●'}
        </span>}
      </div>
      {open&&<>
        {(model.boxes||[]).map((box,bi)=>{
          const boxSel={kind:'box',modelPath,boxIdx:bi}
          const bSel=sel?.kind==='box'&&selKey(sel)===selKey(boxSel)
          return (
            <BoxRow key={bi} box={box} bi={bi} indent={indent} bSel={bSel} modelPath={modelPath}
              onSel={onSel} onDragStart={onDragStart} onDrop={onDrop} boxSel={boxSel}/>
          )
        })}
        {(model.submodels||[]).map((sub,si)=>(
          <OutlinerNode key={si} model={sub} modelPath={[...modelPath,si]} sel={sel} onSel={onSel}
            onDragStart={onDragStart} onDrop={onDrop} depth={depth+1}
            hiddenModels={hiddenModels} onToggleVisible={onToggleVisible} onRename={onRename} onDelete={onDelete}/>
        ))}
      </>}
      {ctxMenu&&<div
        style={{position:'fixed',left:ctxMenu.x,top:ctxMenu.y,zIndex:9999,
          background:'var(--bg-panel)',border:'1px solid rgba(255,255,255,0.12)',
          borderRadius:4,padding:'2px 0',boxShadow:'2px 4px 16px rgba(0,0,0,0.5)',minWidth:160}}
        onClick={e=>e.stopPropagation()}>
        <div style={{padding:'5px 14px',cursor:'pointer',fontSize:'12px'}}
          onMouseEnter={e=>e.currentTarget.style.background='var(--clr-accent)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          onClick={()=>{setCtxMenu(null);setEditVal(model.id||model.part||'');setEditing(true)}}>
          Rename
        </div>
        <div style={{height:1,background:'rgba(255,255,255,0.1)',margin:'2px 0'}}/>
        <div style={{padding:'5px 14px',cursor:'pointer',fontSize:'12px',color:'#f77'}}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(255,80,80,0.15)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          onClick={()=>{setCtxMenu(null);onDelete&&onDelete(modelPath)}}>
          Delete
        </div>
      </div>}
    </div>
  )
}

function RootDropZone({onDrop}) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e=>{e.preventDefault();setOver(true)}}
      onDragLeave={()=>setOver(false)}
      onDrop={e=>{e.stopPropagation();setOver(false);onDrop()}}
      style={{minHeight:24,borderTop:'1px dashed rgba(255,255,255,0.08)',margin:'2px 4px',borderRadius:2,
        background:over?'rgba(100,160,255,0.12)':'transparent',
        display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:'9px',color:over?'#88aaff':'rgba(255,255,255,0.2)',fontFamily:'Monocraft,sans-serif',
        transition:'background 0.1s'}}>
      {over ? '↑ move to root' : ''}
    </div>
  )
}

function BoxRow({box, bi, indent, bSel, modelPath, onSel, onDragStart, onDrop, boxSel}) {
  const [dropOver, setDropOver]=useState(false)
  return (
    <div draggable
      onDragStart={e=>{e.stopPropagation();onDragStart({kind:'box',modelPath,boxIdx:bi})}}
      onDragOver={e=>{e.preventDefault();e.stopPropagation();setDropOver(true)}}
      onDragLeave={()=>setDropOver(false)}
      onDrop={e=>{e.stopPropagation();setDropOver(false);onDrop({kind:'box',modelPath,boxIdx:bi})}}
      style={{...s.treeRow, paddingLeft:4+indent+18,
        background:bSel?'var(--clr-accent)':dropOver?'rgba(100,160,255,0.18)':'transparent',
        color:bSel?'#fff':'var(--clr-text)',
        outline:dropOver?'1px dashed #4488ff':'none', cursor:'grab'}}
      onClick={()=>onSel(boxSel)}>
      <span style={{color:bSel?'#fff':'#ffaa55'}}>□</span>
      <span>cube {bi}</span>
      {box.coordinates&&<span style={{color:'rgba(160,160,160,0.5)',fontSize:'10px',marginLeft:4}}>
        {box.coordinates.slice(0,3).map(v=>Math.round(v)).join(',')}
      </span>}
    </div>
  )
}

// ── Vec3 input ────────────────────────────────────────────────────────────────

function Vec3Input({label, value=[0,0,0], step=0.5, onChange}) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{...s.label,marginBottom:2}}>{label}</div>
      <div style={{display:'flex',gap:3,width:'100%'}}>
        {['X','Y','Z'].map((ax,i)=>(
          <div key={ax} style={{display:'flex',alignItems:'center',gap:2,flex:1,minWidth:0}}>
            <span style={s.propLabel}>{ax}</span>
            <input type="number" step={step} style={{...s.numInput,width:0}}
              value={Math.round((value[i]??0)*1000)/1000}
              onChange={e=>{const n=[...value];n[i]=Number(e.target.value);onChange(n)}}/>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const Modeler = forwardRef(function Modeler({ partId: initPartId, bodyId: initBodyId, onBack, embedded = false, sharedViewerRef = null, texturePatch = null, showBodyPreview = null, previewParts = null, onBarUpdate = null, showGridProp = null, newPart = false, uvZoom = null, onUvChange = null } = {}, ref) {
  const [searchParams] = useSearchParams()
  const { isDark } = useTheme()
  const bg = isDark ? '#1e1e1e' : '#ece9d8'
  const [editMode, setEditMode] = useState('body') // 'body' | 'part'
  const [bodies,  setBodies]  = useState([])
  const [bodyId,  setBodyId]  = useState(null)
  const [parts,   setParts]   = useState([])
  const [partId,  setPartId]  = useState(null)
  const partObjRef = useRef(null) // full part object for save
  const [sel,     setSel]     = useState(null)
  const [tcMode,  setTcMode]  = useState('translate')
  const [dirty,    setDirty]   = useState(false)
  const [status,   setStatus]  = useState('')
  const [dataVer,  setDataVer] = useState(0) // bumped to force re-render from ref
  const [showGrid, setShowGrid] = useState(false)
  const [hiddenModels, setHiddenModels] = useState(new Set())
  const [saveAsName,   setSaveAsName]   = useState('')
  const [rPanelWidth,  setRPanelWidth]  = useState(270)
  const hiddenModelsRef = useRef(new Set())
  const rPanelDragRef   = useRef(null)

  const dragItemRef = useRef(null)

  // Model data lives in a ref so TC sync doesn't trigger rebuilds
  const dataRef    = useRef(null)
  const origRef    = useRef(null)
  const selRef     = useRef(null)
  const tcModeRef  = useRef('translate')
  const undoStackRef   = useRef([])
  const redoStackRef   = useRef([])
  const modelerUndoRef = useRef(null)
  const modelerRedoRef = useRef(null)
  useEffect(()=>{ selRef.current=sel },[sel])
  useEffect(()=>{ tcModeRef.current=tcMode },[tcMode])
  useEffect(()=>{ if (ctxRef.current) ctxRef.current.scene.background=new THREE.Color(bg) },[bg])
  useEffect(()=>{ if (ctxRef.current?.grid) ctxRef.current.grid.visible=showGrid },[showGrid])
  useEffect(()=>{ if (showGridProp !== null) setShowGrid(showGridProp) },[showGridProp])
  useEffect(()=>{ hiddenModelsRef.current=hiddenModels },[hiddenModels])
  useEffect(()=>{
    onBarUpdate?.({ tcMode, showGrid, hasSel: !!sel, undoCount: undoStackRef.current.length, redoCount: redoStackRef.current.length })
  },[tcMode, showGrid, sel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Three.js
  const mountRef        = useRef(null)
  const ctxRef          = useRef(null)
  const texMapRef       = useRef({})
  const helperRef       = useRef(null) // BoxHelper for selection
  const tcSyncRef       = useRef(false)
const [selFace,  setSelFace]  = useState(null)
  const [showBody, setShowBody] = useState(false)
  const uvCanvasRef  = useRef(null)
  const uvBufRef     = useRef(null)
  const uvZoomRef    = useRef(1)
  const uvDragRef    = useRef(null)
  const [uvCursor,   setUvCursor]   = useState('default')
  const selFaceRef   = useRef(null)
  const bodyGroupRef = useRef(null)
  useEffect(()=>{ selFaceRef.current = selFace },[selFace])

  // ── Load on mount — prefer props, fall back to query params ────────────────
  useEffect(()=>{
    const reqBodyId = initBodyId ?? Number(searchParams.get('bodyId'))
    const reqPartId = initPartId ?? Number(searchParams.get('partId'))

    api.getBodies().then(bs=>{
      setBodies(bs)
      const match = reqBodyId && bs.find(b=>b.id===reqBodyId)
      setBodyId(match ? match.id : bs[0]?.id ?? null)
    })
    api.getParts().then(ps=>{
      setParts(ps)
      if (reqPartId) {
        const match = ps.find(p=>p.id===reqPartId)
        if (match) { setEditMode('part'); setPartId(match.id) }
      }
    })
  },[])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── When embedded, sync editMode/partId/bodyId from parent props ───────────
  useEffect(()=>{
    if (!embedded) return
    if (initPartId) {
      setEditMode('part')
      setPartId(initPartId)
    } else if (newPart) {
      setEditMode('part')
      setPartId(null)
      setShowBody(false)
      partObjRef.current = null
      dataRef.current = { models: [] }
      texMapRef.current = {}
      undoStackRef.current = []; redoStackRef.current = []
      setDataVer(v=>v+1); setDirty(false); setSel(null)
      removeBodyPreview()
      if (ctxRef.current) {
        const ctx = ctxRef.current
        ctx.tc.detach()
        if (ctx.modelGroup) { ctx.scene.remove(ctx.modelGroup); disposeGroup(ctx.modelGroup); ctx.modelGroup = null }
      }
    } else {
      setEditMode('body')
    }
  },[embedded, initPartId, newPart])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if (!embedded || !initBodyId) return
    setBodyId(initBodyId)
  },[embedded, initBodyId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load body data ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if (!bodyId || editMode !== 'body') return
    let cancelled = false
    api.getBody(bodyId).then(b=>{
      if (cancelled) return
      dataRef.current=b.body_data; origRef.current=b.body_data
      undoStackRef.current=[]; redoStackRef.current=[]
      if (ctxRef.current && !embedded) ctxRef.current.firstLoad=true
      setDataVer(v=>v+1); setDirty(false); setSel(null); setStatus('')
      loadTexAndRebuild(b.body_data)
    })
    return () => { cancelled = true }
  },[bodyId, editMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load part data ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if (!partId || editMode !== 'part') return
    api.getPart(partId).then(p=>{
      partObjRef.current = p
      const jem = partToJem(p)
      dataRef.current=jem; origRef.current=jem
      undoStackRef.current=[]; redoStackRef.current=[]
      if (ctxRef.current && !embedded) ctxRef.current.firstLoad=true
      setDataVer(v=>v+1); setDirty(false); setSel(null); setStatus('')
      loadTexAndRebuild(jem)
    })
  },[partId, editMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync texture patches from Studio into this viewer ─────────────────────
  const texturePatchRef = useRef(null)
  useEffect(()=>{
    texturePatchRef.current = texturePatch
    if (!texturePatch) return
    const { path, canvas } = texturePatch
    const tex = texMapRef.current[path]
    if (tex) { tex.image = canvas; tex.needsUpdate = true }
  },[texturePatch])

  // ── Shared viewer init (when sharedViewerRef is provided) ─────────────────
  useEffect(()=>{
    if (!sharedViewerRef) return
    const extCtx = sharedViewerRef.current?.getCtx()
    if (!extCtx) return

    const tc = new TransformControls(extCtx.camera, extCtx.renderer.domElement)
    tc.setMode('translate')
    extCtx.scene.add(tc)

    tc.addEventListener('dragging-changed', e => { extCtx.controls.enabled = !e.value })
    tc.addEventListener('change', () => { if (helperRef.current) helperRef.current.update() })
    tc.addEventListener('mouseUp', () => { syncTCToData(tc) })

    ctxRef.current = {
      scene: extCtx.scene,
      camera: extCtx.camera,
      renderer: extCtx.renderer,
      orbit: extCtx.controls,
      tc,
      grid: extCtx.grid,
      modelGroup: null,
      firstLoad: newPart,
    }
    if (newPart) rebuildScene()

    sharedViewerRef.current.setClickHandler(onViewportClick)
    sharedViewerRef.current.setDblClickHandler(() => {
      setTcMode(m => {
        const next = m === 'translate' ? 'scale' : 'translate'
        ctxRef.current?.tc?.setMode(next)
        return next
      })
    })

    return () => {
      tc.detach()
      if (helperRef.current) {
        extCtx.scene.remove(helperRef.current)
        helperRef.current = null
      }
      extCtx.scene.remove(tc)
      tc.dispose()
      // Remove the model group the Modeler added to the shared scene
      if (ctxRef.current?.modelGroup) {
        extCtx.scene.remove(ctxRef.current.modelGroup)
        disposeGroup(ctxRef.current.modelGroup)
      }
      // Remove body preview if present
      if (bodyGroupRef.current) {
        extCtx.scene.remove(bodyGroupRef.current)
        disposeGroup(bodyGroupRef.current)
        bodyGroupRef.current = null
      }
      ctxRef.current = null
      sharedViewerRef.current?.clearClickHandler()
      sharedViewerRef.current?.clearDblClickHandler()
      sharedViewerRef.current?.triggerRebuild()
    }
  }, [sharedViewerRef]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Three.js init ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if (sharedViewerRef) return
    const mount=mountRef.current; if (!mount) return
    const w=mount.clientWidth||800, h=mount.clientHeight||600

    const renderer=new THREE.WebGLRenderer({antialias:true})
    renderer.setSize(w,h); renderer.setPixelRatio(window.devicePixelRatio)
    mount.appendChild(renderer.domElement)

    const scene=new THREE.Scene(); scene.background=new THREE.Color(bg)

    const grid=new THREE.GridHelper(128,32,0x333355,0x222233)
    grid.visible=false
    scene.add(grid)

    const camera=new THREE.PerspectiveCamera(55,w/h,0.1,2000)
    camera.position.set(30,20,40)

    const orbit=new OrbitControls(camera,renderer.domElement)
    orbit.enableDamping=true; orbit.dampingFactor=0.08; orbit.minDistance=5; orbit.maxDistance=400
    orbit.mouseButtons={ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }

    const tc=new TransformControls(camera,renderer.domElement)
    tc.setMode('translate')
    scene.add(tc)

    // Pause orbit while dragging gizmo
    tc.addEventListener('dragging-changed',e=>{ orbit.enabled=!e.value })

    // Update BoxHelper live while dragging
    tc.addEventListener('change',()=>{ if (helperRef.current) helperRef.current.update() })

    // Sync gizmo result → data on release
    tc.addEventListener('mouseUp',()=>{ syncTCToData(tc) })

    let animId
    function animate(){ animId=requestAnimationFrame(animate); orbit.update(); renderer.render(scene,camera) }
    animate()

    const ro=new ResizeObserver(()=>{
      const nw=mount.clientWidth, nh=mount.clientHeight
      camera.aspect=nw/nh; camera.updateProjectionMatrix(); renderer.setSize(nw,nh)
    })
    ro.observe(mount)

    ctxRef.current={scene,camera,renderer,orbit,tc,grid,modelGroup:null,firstLoad:true}

    return ()=>{
      cancelAnimationFrame(animId); ro.disconnect()
      orbit.dispose(); tc.dispose(); renderer.dispose()
      if (bodyGroupRef.current) { disposeGroup(bodyGroupRef.current); bodyGroupRef.current=null }
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      ctxRef.current=null
    }
  },[])

  // ── Rebuild on data change (not from TC sync) ──────────────────────────────
  useEffect(()=>{
    if (tcSyncRef.current) return
    rebuildScene()
  },[dataVer])  // eslint-disable-line react-hooks/exhaustive-deps

  // Load texture for UV canvas
  useEffect(()=>{
    if (!dataRef.current) { uvBufRef.current = null; return }
    const paths = collectTexturePaths(dataRef.current)
    if (!paths.length) { uvBufRef.current = null; redrawUV(); return }
    const img = new Image()
    img.onload = () => {
      const buf = document.createElement('canvas')
      buf.width = img.naturalWidth; buf.height = img.naturalHeight
      buf.getContext('2d').drawImage(img, 0, 0)
      uvBufRef.current = buf; redrawUV()
    }
    img.onerror = () => { uvBufRef.current = null; redrawUV() }
    img.src = `${import.meta.env.BASE_URL}api/asset/?path=${encodeURIComponent(normTexPath(paths[0]))}`
  },[dataVer]) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ redrawUV() },[sel, selFace, dataVer])

  // ── TC mode changes ────────────────────────────────────────────────────────
  useEffect(()=>{
    const tc=ctxRef.current?.tc; if (!tc) return
    const internalMode = tcMode === 'pivot' ? 'translate' : tcMode
    if (selRef.current?.kind==='model') tc.setMode(internalMode)
  },[tcMode])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(()=>{
    function onKey(e){
      if (e.ctrlKey||e.metaKey) {
        if (!e.shiftKey && e.key==='z') { e.preventDefault(); modelerUndoRef.current?.() }
        if (e.shiftKey && (e.key==='z'||e.key==='Z')) { e.preventDefault(); modelerRedoRef.current?.() }
        return
      }
      if (e.target.tagName==='INPUT') return
      if (e.key==='w'||e.key==='W') setTcMode('translate')
      if (e.key==='e'||e.key==='E') setTcMode('rotate')
      if (e.key==='Escape') clearSel()
      if ((e.key==='Delete'||e.key==='Backspace')&&!e.target.isContentEditable) deleteSelected()
    }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scene management ───────────────────────────────────────────────────────

  function loadTexAndRebuild(data) {
    const loader=new THREE.TextureLoader()
    Promise.all(
      collectTexturePaths(data).map(raw=>new Promise(res=>{
        loader.load(`${import.meta.env.BASE_URL}api/asset/?path=${encodeURIComponent(normTexPath(raw))}`,
          tex=>res([raw,tex]), undefined, ()=>res([raw,null]))
      }))
    ).then(entries=>{
      if (!ctxRef.current) return
      texMapRef.current=Object.fromEntries(entries.filter(([,t])=>t))
      // Apply any pending texture patch (e.g. unsaved paint from Studio)
      const patch = texturePatchRef.current
      if (patch) {
        const tex = texMapRef.current[patch.path]
        if (tex) { tex.image = patch.canvas; tex.needsUpdate = true }
      }
      rebuildScene()
    })
  }

  function rebuildScene() {
    const ctx=ctxRef.current, data=dataRef.current
    if (!ctx||!data) return
    ctx.tc.detach()
    clearHelper()
    if (ctx.modelGroup) { ctx.scene.remove(ctx.modelGroup); disposeGroup(ctx.modelGroup); ctx.modelGroup=null }

    const group=buildSceneRoot(data,texMapRef.current)
    const box=new THREE.Box3().setFromObject(group)
    if (!box.isEmpty()) {
      const center=box.getCenter(new THREE.Vector3())
      group.position.x -= center.x
      group.position.z -= center.z
      group.position.y -= box.min.y
      const modelHeight=box.max.y-box.min.y
      ctx.orbit.target.set(0, modelHeight/2, 0)
      if (ctx.firstLoad) {
        const size=box.getSize(new THREE.Vector3()).length()
        ctx.camera.position.set(size*.8,size*.6,size*1.2); ctx.orbit.update(); ctx.firstLoad=false
      }
    } else if (ctx.firstLoad) {
      ctx.orbit.target.set(0, 8, 0)
      ctx.camera.position.set(20, 15, 25); ctx.orbit.update(); ctx.firstLoad=false
    }
    ctx.scene.add(group); ctx.modelGroup=group

    // Re-apply visibility for hidden models
    hiddenModelsRef.current.forEach(key => {
      group.traverse(obj => {
        if (obj.userData.cemSel?.kind === 'model') {
          const k = obj.userData.cemSel.modelPath.join('_')
          if (k === key) obj.visible = false
        }
      })
    })

    // Re-attach gizmo to current selection
    const cur=selRef.current
    if (cur) {
      const obj=findThreeObj(group,cur)
      if (obj) { ctx.tc.attach(obj); ctx.tc.setMode(cur.kind==='box'?'translate':(tcModeRef.current==='pivot'?'translate':tcModeRef.current)); attachHelper(obj) }
    }
  }

  function toggleModelVisible(modelPath) {
    const key = modelPath.join('_')
    setHiddenModels(prev => {
      const next = new Set(prev)
      const nowHidden = !next.has(key)
      if (nowHidden) next.add(key); else next.delete(key)
      hiddenModelsRef.current = next
      const obj = findThreeObj(ctxRef.current?.modelGroup, { kind: 'model', modelPath })
      if (obj) obj.visible = !nowHidden
      return next
    })
  }

  function attachHelper(obj) {
    const ctx=ctxRef.current; if (!ctx) return
    clearHelper()
    const h=new THREE.BoxHelper(obj,0x00ccff)
    ctx.scene.add(h); helperRef.current=h
  }

  function clearHelper() {
    if (helperRef.current&&ctxRef.current) { ctxRef.current.scene.remove(helperRef.current); helperRef.current=null }
  }

  // ── TC → data sync ─────────────────────────────────────────────────────────

  function syncTCToData(tc) {
    const obj=tc.object, sel=selRef.current, data=dataRef.current
    if (!obj||!sel||!data) return
    const model=getNode(data.models,sel.modelPath); if (!model) return
    const inv=model.invertAxis||''
    const sx=inv.includes('x')?-1:1, sy=inv.includes('y')?-1:1, sz=inv.includes('z')?-1:1
    const r=v=>Math.round(v*1000)/1000

    let newModels
    if (sel.kind==='model' && tcModeRef.current==='pivot') {
      // Move pivot only — shift translate, inversely offset boxes and submodels so geometry stays put
      const oldT = model.translate || [0,0,0]
      const newT = [r(obj.position.x*sx), r(obj.position.y*sy), r(obj.position.z*sz)]
      const d = [newT[0]-oldT[0], newT[1]-oldT[1], newT[2]-oldT[2]]
      newModels = updateNode(data.models, sel.modelPath, n => ({
        ...n,
        translate: newT,
        boxes: (n.boxes||[]).map(box => {
          const [bx=0,by=0,bz=0,...rest] = box.coordinates||[]
          return {...box, coordinates:[r(bx-d[0]), r(by-d[1]), r(bz-d[2]), ...rest]}
        }),
        submodels: (n.submodels||[]).map(sub => {
          const [stx=0,sty=0,stz=0] = sub.translate||[]
          return {...sub, translate:[r(stx-d[0]), r(sty-d[1]), r(stz-d[2])]}
        }),
      }))
    } else if (sel.kind==='model') {
      newModels=updateNode(data.models,sel.modelPath,n=>({...n,
        translate:[r(obj.position.x*sx), r(obj.position.y*sy), r(obj.position.z*sz)],
        rotate:   [r(obj.rotation.x/DEG*sx), r(obj.rotation.y/DEG*sy), r(obj.rotation.z/DEG*sz)],
      }))
    } else if (sel.kind==='box') {
      const box=model.boxes[sel.boxIdx]
      const [,,, bw=1,bh=1,bd=1]=box.coordinates||[]
      newModels=updateNode(data.models,sel.modelPath,n=>{
        const boxes=[...n.boxes]
        boxes[sel.boxIdx]={...box,coordinates:[
          r(obj.position.x/sx-bw/2), r(obj.position.y/sy-bh/2), r(obj.position.z/sz-bd/2),
          bw, bh, bd,
        ]}
        return {...n,boxes}
      })
    } else return

    pushUndo()
    tcSyncRef.current=true
    dataRef.current={...data,models:newModels}
    setDataVer(v=>v+1); setDirty(true)
    setTimeout(()=>{ tcSyncRef.current=false },0)
  }

  // ── Raycasting click-to-select ──────────────────────────────────────────────

  function onViewportClick(e) {
    const ctx=ctxRef.current; if (!ctx?.modelGroup) return
    if (ctx.tc.dragging) return
    const rect=(sharedViewerRef ? ctx.renderer.domElement : mountRef.current).getBoundingClientRect()
    const ray=new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(
      ((e.clientX-rect.left)/rect.width)*2-1,
      -((e.clientY-rect.top)/rect.height)*2+1
    ),ctx.camera)
    const hits=ray.intersectObjects([ctx.modelGroup],true)
    for (const hit of hits) {
      const d=hit.object.userData.cemSel
      if (d) { selectAndAttach(d); return }
    }
    clearSel()
  }

  function selectAndAttach(newSel) {
    setSel(newSel)
    const ctx=ctxRef.current; if (!ctx?.modelGroup) return
    const obj=findThreeObj(ctx.modelGroup,newSel)
    if (obj) {
      ctx.tc.attach(obj)
      const internalMode = tcModeRef.current === 'pivot' ? 'translate' : tcModeRef.current
      ctx.tc.setMode(newSel.kind==='box'?'translate':internalMode)
      attachHelper(obj)
    }
  }

  function clearSel() {
    setSel(null)
    onUvChange?.(null)
    const ctx=ctxRef.current; if (!ctx) return
    ctx.tc.detach(); clearHelper()
  }

  const redrawUV = useCallback(() => {
    const canvas = uvCanvasRef.current
    const buf = uvBufRef.current
    if (!canvas) return
    if (!buf) { canvas.width = 0; canvas.height = 0; return }
    const { width: tw, height: th } = buf
    const zoom = (uvZoom && uvZoom > 0) ? uvZoom : Math.max(1, Math.floor(250 / Math.max(tw, 1)))
    uvZoomRef.current = zoom
    canvas.width = tw * zoom; canvas.height = th * zoom
    const ctx = canvas.getContext('2d')
    // checkerboard
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      ctx.fillStyle = (x+y)%2===0 ? '#1a1a1a' : '#222'
      ctx.fillRect(x*zoom, y*zoom, zoom, zoom)
    }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(buf, 0, 0, tw*zoom, th*zoom)
    // pixel grid
    if (zoom >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5
      for (let x = 0; x <= tw; x++) { ctx.beginPath(); ctx.moveTo(x*zoom,0); ctx.lineTo(x*zoom,th*zoom); ctx.stroke() }
      for (let y = 0; y <= th; y++) { ctx.beginPath(); ctx.moveTo(0,y*zoom); ctx.lineTo(tw*zoom,y*zoom); ctx.stroke() }
    }
    // UV overlay for selected element(s)
    const cur = selRef.current
    let boxList = []
    let singleBox = false
    if (cur?.kind === 'box') {
      const b = getNode(dataRef.current?.models, cur.modelPath)?.boxes?.[cur.boxIdx]
      if (b) { boxList = [b]; singleBox = true }
    } else if (cur?.kind === 'model') {
      const node = getNode(dataRef.current?.models, cur.modelPath)
      if (node) boxList = collectBoxes(node)
    }

    const rectSets = []
    for (const box of boxList) {
      const rects = getFaceRects(box)
      rectSets.push(rects)
      for (const face of FACES) {
        const r = rects[face]; if (!r) continue
        const [x1,y1,x2,y2] = r
        const color = FACE_COLORS[face]
        const isSel = singleBox && face === selFaceRef.current
        const sx = Math.min(x1,x2)*zoom, sy = Math.min(y1,y2)*zoom
        const sw = Math.abs(x2-x1)*zoom, sh = Math.abs(y2-y1)*zoom
        ctx.globalAlpha = 1
        ctx.fillStyle = color + (isSel ? '55' : '28')
        ctx.fillRect(sx, sy, sw, sh)
        ctx.strokeStyle = color; ctx.lineWidth = isSel ? 2 : 1
        ctx.strokeRect(sx+0.5, sy+0.5, sw-1, sh-1)
        const ls = Math.max(6, zoom-1)
        ctx.font = `bold ${ls}px monospace`; ctx.fillStyle = color
        ctx.fillText(face[0].toUpperCase(), sx+2, sy+ls+1)
      }
    }

    if (rectSets.length) {
      onUvChange?.({ rectSets, selFace: singleBox ? selFaceRef.current : null })
    } else {
      onUvChange?.(null)
    }
  }, [uvZoom, onUvChange]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── UV canvas interaction ─────────────────────────────────────────────────

  function getUVHit(px, py, box) {
    const rects = getFaceRects(box)
    for (const face of FACES) {
      const r = rects[face]; if (!r) continue
      const [x1,y1,x2,y2] = r
      const sx = Math.min(x1,x2), sy = Math.min(y1,y2)
      const sw = Math.abs(x2-x1), sh = Math.abs(y2-y1)
      if (px >= sx && px < sx+sw && py >= sy && py < sy+sh) return face
    }
    return null
  }

  function patchBoxLive(updater) {
    if (!selRef.current || selRef.current.kind !== 'box' || !dataRef.current) return
    const { modelPath, boxIdx } = selRef.current
    dataRef.current = {
      ...dataRef.current,
      models: updateNode(dataRef.current.models, modelPath, n => {
        const boxes = [...(n.boxes||[])]
        boxes[boxIdx] = updater(boxes[boxIdx])
        return {...n, boxes}
      })
    }
    redrawUV()
  }

  function onUVMouseDown(e) {
    if (e.button !== 0) return
    const buf = uvBufRef.current; if (!buf) return
    const cur = selRef.current
    const box = cur?.kind === 'box'
      ? getNode(dataRef.current?.models, cur.modelPath)?.boxes?.[cur.boxIdx]
      : null
    if (!box) return

    const zoom = uvZoomRef.current
    const rect = uvCanvasRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / zoom
    const py = (e.clientY - rect.top)  / zoom

    const hitFace = getUVHit(px, py, box)
    if (!hitFace) return

    const origData = JSON.stringify(dataRef.current)

    if (box.textureOffset) {
      uvDragRef.current = { startPx: px, startPy: py, startVal: [...box.textureOffset], mode: 'offset', origData }
    } else {
      const key = 'uv' + hitFace[0].toUpperCase() + hitFace.slice(1)
      setSelFace(hitFace)
      uvDragRef.current = { startPx: px, startPy: py, startVal: [...(box[key]||[0,0,0,0])], face: hitFace, mode: 'face', origData }
    }
    setUvCursor('grabbing')
  }

  function onUVMouseMove(e) {
    const buf = uvBufRef.current; if (!buf) return
    const zoom = uvZoomRef.current
    const rect = uvCanvasRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / zoom
    const py = (e.clientY - rect.top)  / zoom

    const drag = uvDragRef.current
    if (!drag) {
      // Update hover cursor
      const cur = selRef.current
      const box = cur?.kind === 'box'
        ? getNode(dataRef.current?.models, cur.modelPath)?.boxes?.[cur.boxIdx]
        : null
      setUvCursor(box && getUVHit(px, py, box) ? 'grab' : 'default')
      return
    }

    const dx = Math.round(px - drag.startPx)
    const dy = Math.round(py - drag.startPy)

    if (drag.mode === 'offset') {
      patchBoxLive(b => ({...b, textureOffset: [drag.startVal[0]+dx, drag.startVal[1]+dy]}))
    } else {
      const [x1,y1,x2,y2] = drag.startVal
      const key = 'uv' + drag.face[0].toUpperCase() + drag.face.slice(1)
      patchBoxLive(b => ({...b, [key]: [x1+dx, y1+dy, x2+dx, y2+dy]}))
    }
  }

  function onUVCommit() {
    const drag = uvDragRef.current; if (!drag) return
    uvDragRef.current = null
    setUvCursor('default')
    // Push the pre-drag snapshot onto the undo stack
    undoStackRef.current.push(drag.origData)
    if (undoStackRef.current.length > 100) undoStackRef.current.shift()
    redoStackRef.current = []
    setDataVer(v => v+1)
    setDirty(true)
    notifyBar()
  }

  // ── Body preview ───────────────────────────────────────────────────────────

  function removeBodyPreview() {
    const ctx = ctxRef.current
    if (bodyGroupRef.current) {
      if (ctx) ctx.scene.remove(bodyGroupRef.current)
      disposeGroup(bodyGroupRef.current)
      bodyGroupRef.current = null
    }
  }

  async function loadBodyPreview() {
    const ctx = ctxRef.current
    if (!ctx || !bodyId) return
    removeBodyPreview()
    const b = await api.getBody(bodyId)
    if (!ctxRef.current) return
    const loader = new THREE.TextureLoader()
    const paths = collectTexturePaths(b.body_data)
    const entries = await Promise.all(
      paths.map(raw => new Promise(res => {
        loader.load(`${import.meta.env.BASE_URL}api/asset/?path=${encodeURIComponent(normTexPath(raw))}`,
          tex => res([raw, tex]), undefined, () => res([raw, null]))
      }))
    )
    const texMap = Object.fromEntries(entries.filter(([,t]) => t))
    const group = jemToScene(b.body_data, texMap)
    group.traverse(obj => {
      if (obj.isMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => { m.transparent = true; m.opacity = 0.2; m.depthWrite = false })
      }
    })
    if (!ctxRef.current) { disposeGroup(group); return }
    ctxRef.current.scene.add(group)
    bodyGroupRef.current = group
  }

  useEffect(()=>{
    if (showBody && editMode === 'part' && bodyId) loadBodyPreview()
    else removeBodyPreview()
  },[showBody, editMode, bodyId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data mutations ─────────────────────────────────────────────────────────

  function pushUndo() {
    if (!dataRef.current) return
    undoStackRef.current.push(JSON.stringify(dataRef.current))
    if (undoStackRef.current.length > 100) undoStackRef.current.shift()
    redoStackRef.current = []
  }

  function notifyBar() {
    onBarUpdate?.({ tcMode: tcModeRef.current, showGrid: ctxRef.current?.grid?.visible ?? false, hasSel: !!selRef.current, undoCount: undoStackRef.current.length, redoCount: redoStackRef.current.length })
  }

  function modelerUndo() {
    if (!undoStackRef.current.length) return
    redoStackRef.current.push(JSON.stringify(dataRef.current))
    dataRef.current = JSON.parse(undoStackRef.current.pop())
    setDataVer(v=>v+1); setDirty(true)
    rebuildScene(); notifyBar()
  }

  function modelerRedo() {
    if (!redoStackRef.current.length) return
    undoStackRef.current.push(JSON.stringify(dataRef.current))
    dataRef.current = JSON.parse(redoStackRef.current.pop())
    setDataVer(v=>v+1); setDirty(true)
    rebuildScene(); notifyBar()
  }

  modelerUndoRef.current = modelerUndo
  modelerRedoRef.current = modelerRedo

  function bump(newModels) {
    pushUndo()
    dataRef.current={...dataRef.current,models:newModels}
    setDataVer(v=>v+1); setDirty(true)
  }

  function patchModel(updater) {
    if (!sel||sel.kind!=='model'||!dataRef.current) return
    bump(updateNode(dataRef.current.models,sel.modelPath,updater))
  }

  function patchBox(updater) {
    if (!sel||sel.kind!=='box'||!dataRef.current) return
    bump(updateNode(dataRef.current.models,sel.modelPath,n=>{
      const boxes=[...(n.boxes||[])]; boxes[sel.boxIdx]=updater(boxes[sel.boxIdx]); return {...n,boxes}
    }))
  }

  function addCube() {
    if (!dataRef.current) return
    if (!dataRef.current.models?.length) {
      bump([{ id: 'root', boxes: [{coordinates:[0,0,0,4,4,4],textureOffset:[0,0]}], submodels: [] }])
      return
    }
    const path=sel?.kind==='model' ? sel.modelPath : [0]
    bump(updateNode(dataRef.current.models,path,n=>({
      ...n, boxes:[...(n.boxes||[]),{coordinates:[0,0,0,4,4,4],textureOffset:[0,0]}]
    })))
  }

  function deleteModel(path) {
    if (!path||!dataRef.current) return
    pushUndo()
    const clone=JSON.parse(JSON.stringify(dataRef.current.models))
    if (path.length===1) {
      clone.splice(path[0],1)
    } else {
      let parent=clone[path[0]]
      for (let i=1;i<path.length-1;i++) parent=parent.submodels[path[i]]
      parent.submodels.splice(path[path.length-1],1)
    }
    dataRef.current={...dataRef.current,models:clone}
    setDataVer(v=>v+1); setDirty(true)
    clearSel()
  }

  function deleteSelected() {
    if (!sel||!dataRef.current) return
    if (sel.kind==='box') {
      bump(updateNode(dataRef.current.models,sel.modelPath,n=>{
        const boxes=[...(n.boxes||[])]; boxes.splice(sel.boxIdx,1); return {...n,boxes}
      }))
      clearSel()
    } else if (sel.kind==='model') {
      deleteModel(sel.modelPath)
    }
  }

  function handleRename(modelPath, newName) {
    bump(updateNode(dataRef.current.models,modelPath,n=>({...n,id:newName})))
  }

  async function save() {
    setStatus('')
    try {
      if (editMode === 'part' && partId && partObjRef.current) {
        const p = partObjRef.current
        const partData = dataRef.current.models[0]?.submodels?.[0] ?? dataRef.current.models[0]
        await api.updatePart(partId, { ...p, part_data: partData })
      } else {
        await api.patchBody(bodyId, {body_data: dataRef.current})
      }
      origRef.current=dataRef.current; setDirty(false); setStatus('ok')
    } catch(e) { setStatus(e.message) }
  }

  async function saveAs(newName) {
    if (!partObjRef.current || !newName?.trim()) { setStatus('Enter a name'); return }
    setStatus('')
    try {
      const p = partObjRef.current
      const partData = dataRef.current.models[0]?.submodels?.[0] ?? dataRef.current.models[0]
      // Derive new jpm_path by replacing the filename portion
      const newPath = p.jpm_path.replace(/[^/]+\.jpm$/, `${newName.trim()}.jpm`)
      const created = await api.createPart({ ...p, id: undefined, name: newName.trim(), jpm_path: newPath, part_data: partData })
      partObjRef.current = created
      origRef.current = dataRef.current; setDirty(false); setStatus('ok'); return true
    } catch(e) { setStatus(e.message) }
  }

  useImperativeHandle(ref, () => ({
    getPartData: () => {
      const partData = dataRef.current?.models[0]?.submodels?.[0] ?? dataRef.current?.models[0]
      return { partObj: partObjRef.current, partData }
    },
    setTcMode: m => setTcMode(m),
    setShowGrid: v => setShowGrid(v),
    addCube,
    deleteSelected,
    undo: modelerUndo,
    redo: modelerRedo,
    save,
    saveAs,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  function startRPanelResize(e) {
    if (e.button !== 0) return
    e.preventDefault()
    rPanelDragRef.current = e.clientX
    const startW = rPanelWidth
    const onMove = ev => setRPanelWidth(Math.max(200, Math.min(520, startW + (rPanelDragRef.current - ev.clientX))))
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function revert() {
    dataRef.current=origRef.current
    setDataVer(v=>v+1); setDirty(false); clearSel(); setStatus('')
  }

  function handleDragStart(item) {
    dragItemRef.current = item
  }

  function handleDrop(target) {
    const src = dragItemRef.current
    dragItemRef.current = null
    if (!src || !dataRef.current) return
    const data = dataRef.current

    // Reorder cubes within the same model
    if (src.kind==='box' && target.kind==='box' &&
        JSON.stringify(src.modelPath)===JSON.stringify(target.modelPath) &&
        src.boxIdx !== target.boxIdx) {
      bump(updateNode(data.models, src.modelPath, n => {
        const boxes = [...(n.boxes||[])]
        const [moved] = boxes.splice(src.boxIdx, 1)
        boxes.splice(target.boxIdx, 0, moved)
        return {...n, boxes}
      }))
      return
    }

    if (src.kind==='model' && target.kind==='model') {
      const sp = src.modelPath, tp = target.modelPath
      if (JSON.stringify(sp) === JSON.stringify(tp)) return
      // Can't nest into own descendant
      if (tp.length > sp.length && sp.every((v,i) => tp[i]===v)) return

      const spParent = JSON.stringify(sp.slice(0,-1))
      const tpParent = JSON.stringify(tp.slice(0,-1))

      pushUndo()
      if (spParent === tpParent) {
        // Same parent → reorder within that parent
        const parentPath = sp.slice(0,-1)
        const srcIdx = sp[sp.length-1], tgtIdx = tp[tp.length-1]
        if (parentPath.length === 0) {
          const models = [...data.models]
          const [moved] = models.splice(srcIdx, 1)
          models.splice(tgtIdx, 0, moved)
          dataRef.current = {...data, models}
        } else {
          dataRef.current = {...data, models: updateNode(data.models, parentPath, n => {
            const subs = [...(n.submodels||[])]
            const [moved] = subs.splice(srcIdx, 1)
            subs.splice(tgtIdx, 0, moved)
            return {...n, submodels: subs}
          })}
        }
      } else {
        // Different parent → nest src into target
        const [m1, node] = extractModel(data.models, sp)
        const adjTp = adjustPath(sp, tp)
        dataRef.current = {...data, models: nestModel(m1, adjTp, node)}
      }
      setDataVer(v=>v+1); setDirty(true)
    }
  }

  function handleDropRoot() {
    const src = dragItemRef.current
    dragItemRef.current = null
    if (!src || src.kind !== 'model' || !dataRef.current) return
    const data = dataRef.current
    if (src.modelPath.length === 1) return // already at root
    pushUndo()
    const [newModels, node] = extractModel(data.models, src.modelPath)
    dataRef.current = {...data, models: [...newModels, node]}
    setDataVer(v=>v+1); setDirty(true)
  }

  function addFolder() {
    if (!dataRef.current) return
    pushUndo()
    const existing = (dataRef.current.models||[]).filter(m => (m.id||'').startsWith('folder'))
    const name = `folder_${existing.length + 1}`
    const newFolder = { id: name, boxes: [], submodels: [] }
    dataRef.current = {...dataRef.current, models: [...(dataRef.current.models||[]), newFolder]}
    setDataVer(v=>v+1); setDirty(true)
  }

  // ── Derived for render ─────────────────────────────────────────────────────
  const data=dataRef.current
  const selModel=sel?.kind==='model' ? getNode(data?.models,sel.modelPath) : null
  const selBox  =sel?.kind==='box'   ? getNode(data?.models,sel.modelPath)?.boxes?.[sel.boxIdx] : null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={embedded ? { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' } : s.page}>

      {/* Toolbar — hidden when embedded (tools live in Studio's center top bar) */}
      {!embedded && (
        <div style={s.topBar}>
          {onBack && <div style={s.divider}/>}
          <button style={editMode==='body'?s.btnAct:s.btnSm} onClick={()=>setEditMode('body')}>Body</button>
          <button style={editMode==='part'?s.btnAct:s.btnSm} onClick={()=>setEditMode('part')}>Part</button>
          {editMode==='body'
            ? <select style={{...s.select,width:'auto'}} value={bodyId??''} onChange={e=>setBodyId(Number(e.target.value))}>
                {bodies.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            : <select style={{...s.select,width:'auto'}} value={partId??''} onChange={e=>setPartId(Number(e.target.value))}>
                {parts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
          }
          {editMode==='part'&&bodyId&&<>
            <div style={s.divider}/>
            <button style={showBody?s.btnAct:s.btnSm} onClick={()=>setShowBody(v=>!v)} title="Toggle body preview">◉ Body</button>
          </>}
          <div style={s.divider}/>
          <button style={tcMode==='translate'?s.btnAct:s.btnSm} onClick={()=>setTcMode('translate')} title="Move (W)">⤢ Move</button>
          <button style={tcMode==='rotate'   ?s.btnAct:s.btnSm} onClick={()=>setTcMode('rotate')}    title="Rotate (E)">↻ Rotate</button>
          <button style={tcMode==='pivot'    ?s.btnAct:s.btnSm} onClick={()=>setTcMode('pivot')}     title="Move pivot (keeps geometry in place)">⊙ Pivot</button>
          <div style={s.divider}/>
          <button style={showGrid?s.btnAct:s.btnSm} onClick={()=>setShowGrid(v=>!v)}>⊞ Grid</button>
          <div style={s.divider}/>
          <button style={s.btnSm} onClick={addCube}>+ Cube</button>
          <button style={{...s.btnSm,opacity:sel?1:0.4}} onClick={deleteSelected} disabled={!sel} title="Delete (Del)">✕ Delete</button>
          <div style={{marginLeft:'auto',display:'flex',gap:'6px',alignItems:'center'}}>
            {status==='ok'&&<span style={s.ok}>Saved!</span>}
            {status&&status!=='ok'&&<span style={s.err}>{status}</span>}
            <button style={{...s.btnSm,opacity:dirty?1:0.4}} onClick={revert} disabled={!dirty}>Revert</button>
            <button style={s.btn} onClick={save}>Save</button>
          </div>
        </div>
      )}

      <div style={s.content}>

        {/* Left — Outliner */}
        <div style={s.outliner}>
          <div style={{...XP_TITLE, display:'flex', alignItems:'center'}}>
            <span style={{flex:1}}>Outliner</span>
            <button title="Add Folder" onClick={addFolder}
              style={{background:'none',border:'none',color:'var(--clr-text)',cursor:'pointer',fontSize:'13px',padding:'0 4px',lineHeight:1}}>📁+</button>
          </div>
          <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
            <div style={{flex:1}}>
              {(data?.models||[]).map((model,mi)=>(
                <OutlinerNode key={mi} model={model} modelPath={[mi]} sel={sel} onSel={selectAndAttach} onDragStart={handleDragStart} onDrop={handleDrop} depth={0} hiddenModels={hiddenModels} onToggleVisible={toggleModelVisible} onRename={handleRename} onDelete={deleteModel}/>
              ))}
            </div>
            {/* Root drop zone — drag here to move a model back to top level */}
            <RootDropZone onDrop={handleDropRoot}/>
          </div>
        </div>

        {/* Center — 3D Viewport (hidden in shared mode; CemViewer is the canvas) */}
        {!sharedViewerRef && <div ref={mountRef} style={s.viewport} onClick={onViewportClick}/>}

        {/* Right — Properties */}
        <div style={{...s.rPanel, width:rPanelWidth}}>
          {/* Resize handle */}
          <div onMouseDown={startRPanelResize} style={{position:'absolute',left:0,top:0,bottom:0,width:4,cursor:'col-resize',zIndex:10,background:'transparent'}} />
          <div style={XP_TITLE}>Properties</div>

          {/* ── UV / Texture canvas ── */}
          <div style={{flexShrink:0, borderBottom:'2px solid var(--bdr-dk)', background:'#111', lineHeight:0, position:'relative', overflow:'auto', maxHeight:220}}>
            <canvas ref={uvCanvasRef}
              style={{display:'block', imageRendering:'pixelated', cursor:uvCursor}}
              onMouseDown={onUVMouseDown}
              onMouseMove={onUVMouseMove}
              onMouseUp={onUVCommit}
              onMouseLeave={onUVCommit}
            />
            {!uvBufRef.current && (
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
                color:'rgba(255,255,255,0.2)',fontSize:'10px',fontFamily:'Monocraft,sans-serif',pointerEvents:'none'}}>
                no texture
              </div>
            )}
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'8px',minHeight:0}}>

            {!sel&&(
              <div style={{...s.label,lineHeight:'1.8'}}>
                Click an element to select it.<br/>
                <span style={{color:'var(--clr-text-dim)'}}>W</span> Move &nbsp;
                <span style={{color:'var(--clr-text-dim)'}}>E</span> Rotate &nbsp;
                <span style={{color:'var(--clr-text-dim)'}}>Del</span> Delete
              </div>
            )}

            {selModel&&(
              <>
                <div style={{...s.label,fontWeight:'bold',marginBottom:8,fontSize:'12px'}}>
                  Bone: {selModel.id||selModel.part}
                </div>
                <Vec3Input label="Translate" value={selModel.translate||[0,0,0]}
                  onChange={v=>patchModel(n=>({...n,translate:v}))}/>
                <Vec3Input label="Rotate (°)" value={selModel.rotate||[0,0,0]}
                  onChange={v=>patchModel(n=>({...n,rotate:v}))}/>
              </>
            )}

            {selBox&&(
              <>
                <div style={{...s.label,fontWeight:'bold',marginBottom:8,fontSize:'12px'}}>
                  Cube {sel.boxIdx}
                </div>
                <Vec3Input label="Position" value={selBox.coordinates?.slice(0,3)||[0,0,0]}
                  onChange={v=>patchBox(b=>({...b,coordinates:[...v,...(b.coordinates?.slice(3)||[1,1,1])]}))}/>
                <Vec3Input label="Size" value={selBox.coordinates?.slice(3,6)||[1,1,1]} step={1}
                  onChange={v=>patchBox(b=>({...b,coordinates:[...(b.coordinates?.slice(0,3)||[0,0,0]),...v]}))}/>

                {/* Face selector */}
                <div style={{marginBottom:8}}>
                  <div style={{...s.label,marginBottom:4}}>UV Faces</div>
                  {FACES.map(face=>(
                    <div key={face} style={{display:'flex',alignItems:'center',gap:6,padding:'2px 0',cursor:'pointer',
                      background:selFace===face?'var(--clr-accent)':'transparent',borderRadius:2,paddingLeft:4}}
                      onClick={()=>setSelFace(f=>f===face?null:face)}>
                      <div style={{width:10,height:10,background:FACE_COLORS[face],flexShrink:0}}/>
                      <span style={{fontSize:'11px',fontFamily:'Monocraft, sans-serif',
                        color:selFace===face?'#fff':'var(--clr-text-dim)'}}>{face.toUpperCase()}</span>
                    </div>
                  ))}
                </div>

                {/* UV coordinates */}
                {selBox.textureOffset ? (
                  <div style={{marginBottom:8}}>
                    <div style={{...s.label,marginBottom:2}}>Texture Offset</div>
                    <div style={{display:'flex',gap:3}}>
                      {['U','V'].map((ax,i)=>(
                        <div key={ax} style={{display:'flex',alignItems:'center',gap:2}}>
                          <span style={s.propLabel}>{ax}</span>
                          <input type="number" style={s.numInput}
                            value={selBox.textureOffset?.[i]??0}
                            onChange={e=>{
                              const t=[...(selBox.textureOffset||[0,0])]; t[i]=Number(e.target.value)
                              patchBox(b=>({...b,textureOffset:t}))
                            }}/>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selFace ? (()=>{
                  const key='uv'+selFace[0].toUpperCase()+selFace.slice(1)
                  const coords = selBox[key]||[0,0,0,0]
                  return (
                    <div style={{marginBottom:8}}>
                      <div style={{...s.label,marginBottom:2,color:FACE_COLORS[selFace]}}>{selFace.toUpperCase()} UV</div>
                      <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                        {['x1','y1','x2','y2'].map((lbl,ci)=>(
                          <div key={lbl} style={{display:'flex',alignItems:'center',gap:2}}>
                            <span style={s.propLabel}>{lbl}</span>
                            <input type="number" style={s.numInput} value={coords[ci]}
                              onChange={e=>{
                                const n=[...coords]; n[ci]=Number(e.target.value)
                                patchBox(b=>({...b,[key]:n}))
                              }}/>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })() : (
                  <div style={{...s.label,marginBottom:8,fontSize:'10px'}}>Select a face to edit its UV</div>
                )}

                <div style={{marginBottom:8}}>
                  <div style={{...s.label,marginBottom:2}}>Inflate</div>
                  <input type="number" step={0.5} style={s.numInput}
                    value={selBox.inflate??0}
                    onChange={e=>patchBox(b=>({...b,inflate:Number(e.target.value)}))}/>
                </div>
              </>
            )}
          </div>
          {/* Model preview */}
          <div style={{flexShrink:0,borderTop:'2px solid var(--bdr-dk)',height:180}}>
            <CemViewer key={dataVer} jem={dataRef.current} texturePatch={texturePatch} showGrid={false} showAxes={false} autoRotate />
          </div>

          {/* Save section — only when embedded in Studio */}
          {embedded && (
            <div style={{flexShrink:0,borderTop:'2px solid var(--bdr-dk)',padding:'8px',display:'flex',flexDirection:'column',gap:'6px'}}>
              <div style={XP_TITLE}>Save</div>
              <div style={{display:'flex',alignItems:'center',gap:'6px',paddingTop:'4px'}}>
                <button style={s.btn} onClick={save}>Update Part</button>
                {status==='ok'&&<span style={s.ok}>Saved!</span>}
                {status&&status!=='ok'&&<span style={s.err}>{status}</span>}
              </div>
              <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
                <input
                  style={{...XP_INPUT,flex:1,minWidth:0}}
                  placeholder="new part name…"
                  value={saveAsName}
                  onChange={e=>setSaveAsName(e.target.value)}
                />
                <button style={s.btnSm} onClick={async ()=>{ const ok=await saveAs(saveAsName); if(ok) setSaveAsName('') }}>Save As</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
})

export default Modeler
