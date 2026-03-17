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
  rPanel:    { width:270, flexShrink:0, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg-panel)', borderLeft:'2px solid var(--bdr-dk)' },
  label:     { color:'var(--clr-text-dim)', fontSize:'11px', fontFamily:'Monocraft, sans-serif' },
  btnSm:     XP_BTN_SM,
  btnAct:    { ...XP_BTN_SM, background:'var(--bg-btn-active)', borderTop:'1px solid var(--bdr-dk)', borderLeft:'1px solid var(--bdr-dk)', borderRight:'1px solid var(--bdr-input-lt)', borderBottom:'1px solid var(--bdr-input-lt)' },
  btn:       { padding:'4px 16px', background:'var(--bg-btn-primary)', borderTop:'2px solid var(--bdr-btn-primary-lt)', borderLeft:'2px solid var(--bdr-btn-primary-lt)', borderRight:'2px solid var(--bdr-btn-primary-dk)', borderBottom:'2px solid var(--bdr-btn-primary-dk)', color:'#fff', fontFamily:'Monocraft, sans-serif', fontSize:'11px', fontWeight:'bold', cursor:'pointer' },
  divider:   { width:1, height:22, background:'var(--bdr-dk)', margin:'0 2px', flexShrink:0 },
  select:    { ...XP_INPUT },
  numInput:  { ...XP_INPUT, width:'56px' },
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

// ── Outliner ──────────────────────────────────────────────────────────────────

function OutlinerNode({model, modelPath, sel, onSel, onDragStart, onDrop, depth=0, hiddenModels, onToggleVisible}) {
  const [open,setOpen]=useState(false)
  const [dropOver, setDropOver]=useState(false)
  const indent=depth*14
  const isSel=sel?.kind==='model'&&selKey(sel)===selKey({kind:'model',modelPath})

  // Auto-open when selection is inside this node
  useEffect(()=>{
    if (!sel?.modelPath) return
    const sp=sel.modelPath
    // This node is an ancestor of the selected path
    const isAnc = sp.length > modelPath.length && modelPath.every((v,i)=>sp[i]===v)
    // A box inside this exact model is selected
    const isParent = sel.kind==='box' && sp.length===modelPath.length && modelPath.every((v,i)=>sp[i]===v)
    if (isAnc || isParent) setOpen(true)
  },[sel]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasChildren=(model.boxes?.length||0)+(model.submodels?.length||0)>0
  const isHidden = hiddenModels?.has(modelPath.join('_'))
  return (
    <div>
      <div draggable
        onDragStart={e=>{e.stopPropagation();onDragStart({kind:'model',modelPath})}}
        onDragOver={e=>{e.preventDefault();e.stopPropagation();setDropOver(true)}}
        onDragLeave={()=>setDropOver(false)}
        onDrop={e=>{e.stopPropagation();setDropOver(false);onDrop({kind:'model',modelPath})}}
        style={{...s.treeRow, paddingLeft:4+indent,
          background:isSel?'var(--clr-accent)':dropOver?'rgba(100,160,255,0.18)':'transparent',
          color:isSel?'#fff':'var(--clr-text)',
          outline:dropOver?'1px dashed #4488ff':'none', cursor:'grab'}}
        onClick={()=>onSel({kind:'model',modelPath})}>
        <span style={{fontSize:'9px',width:'10px',color:isSel?'#fff':'var(--clr-text-dim)',flexShrink:0}}
          onClick={e=>{e.stopPropagation();setOpen(v=>!v)}}>
          {hasChildren?(open?'▼':'▶'):' '}
        </span>
        <span style={{color:isSel?'#fff':'#88aaff'}}>⬡</span>
        <span style={{flex:1,opacity:isHidden?0.4:1}}>{model.id||model.part||`bone ${modelPath[modelPath.length-1]}`}</span>
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
            hiddenModels={hiddenModels} onToggleVisible={onToggleVisible}/>
        ))}
      </>}
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
      <div style={{display:'flex',gap:3}}>
        {['X','Y','Z'].map((ax,i)=>(
          <div key={ax} style={{display:'flex',alignItems:'center',gap:2}}>
            <span style={s.propLabel}>{ax}</span>
            <input type="number" step={step} style={s.numInput}
              value={Math.round((value[i]??0)*1000)/1000}
              onChange={e=>{const n=[...value];n[i]=Number(e.target.value);onChange(n)}}/>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const Modeler = forwardRef(function Modeler({ partId: initPartId, bodyId: initBodyId, onBack, embedded = false, sharedViewerRef = null, texturePatch = null, showBodyPreview = null, previewParts = null, onBarUpdate = null, showGridProp = null } = {}, ref) {
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
  const hiddenModelsRef = useRef(new Set())

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
    } else {
      setEditMode('body')
    }
  },[embedded, initPartId])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if (!embedded || !initBodyId) return
    setBodyId(initBodyId)
  },[embedded, initBodyId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load body data ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if (!bodyId || editMode !== 'body') return
    api.getBody(bodyId).then(b=>{
      dataRef.current=b.body_data; origRef.current=b.body_data
      undoStackRef.current=[]; redoStackRef.current=[]
      if (ctxRef.current && !embedded) ctxRef.current.firstLoad=true
      setDataVer(v=>v+1); setDirty(false); setSel(null); setStatus('')
      loadTexAndRebuild(b.body_data)
    })
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
      firstLoad: false,
    }

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
    img.src = `/api/asset/?path=${encodeURIComponent(normTexPath(paths[0]))}`
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
        loader.load(`/api/asset/?path=${encodeURIComponent(normTexPath(raw))}`,
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
    const ctx=ctxRef.current; if (!ctx) return
    ctx.tc.detach(); clearHelper()
  }

  const redrawUV = useCallback(() => {
    const canvas = uvCanvasRef.current
    const buf = uvBufRef.current
    if (!canvas || !buf) return
    const { width: tw, height: th } = buf
    const zoom = Math.max(1, Math.floor(250 / Math.max(tw, 1)))
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
    // UV overlay for selected box
    const box = selRef.current?.kind === 'box'
      ? getNode(dataRef.current?.models, selRef.current.modelPath)?.boxes?.[selRef.current.boxIdx]
      : null
    if (box) {
      const rects = getFaceRects(box)
      for (const face of FACES) {
        const r = rects[face]; if (!r) continue
        const [x1,y1,x2,y2] = r
        const color = FACE_COLORS[face]
        const isSel = face === selFaceRef.current
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        loader.load(`/api/asset/?path=${encodeURIComponent(normTexPath(raw))}`,
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
    const path=sel?.kind==='model' ? sel.modelPath : (dataRef.current?.models?.length ? [0] : null)
    if (!path||!dataRef.current) return
    bump(updateNode(dataRef.current.models,path,n=>({
      ...n, boxes:[...(n.boxes||[]),{coordinates:[0,0,0,4,4,4],textureOffset:[0,0]}]
    })))
  }

  function deleteSelected() {
    if (!sel||!dataRef.current) return
    if (sel.kind==='box') {
      bump(updateNode(dataRef.current.models,sel.modelPath,n=>{
        const boxes=[...(n.boxes||[])]; boxes.splice(sel.boxIdx,1); return {...n,boxes}
      }))
      clearSel()
    }
  }

  async function save() {
    setStatus('')
    try {
      if (editMode === 'part' && partId && partObjRef.current) {
        const p = partObjRef.current
        // part_data is wrapped as a submodel of the outer attachment entry; unwrap it
        const partData = dataRef.current.models[0]?.submodels?.[0] ?? dataRef.current.models[0]
        await api.updatePart(partId, { ...p, part_data: partData })
      } else {
        await api.patchBody(bodyId, {body_data: dataRef.current})
      }
      origRef.current=dataRef.current; setDirty(false); setStatus('ok')
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
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

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

    // Reorder top-level bones
    if (src.kind==='model' && target.kind==='model' &&
        src.modelPath.length===1 && target.modelPath.length===1 &&
        src.modelPath[0] !== target.modelPath[0]) {
      const models = [...data.models]
      const [moved] = models.splice(src.modelPath[0], 1)
      models.splice(target.modelPath[0], 0, moved)
      dataRef.current = {...data, models}
      setDataVer(v=>v+1); setDirty(true)
    }
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
          <div style={XP_TITLE}>Outliner</div>
          <div style={{flex:1,overflowY:'auto'}}>
            {(data?.models||[]).map((model,mi)=>(
              <OutlinerNode key={mi} model={model} modelPath={[mi]} sel={sel} onSel={selectAndAttach} onDragStart={handleDragStart} onDrop={handleDrop} depth={0} hiddenModels={hiddenModels} onToggleVisible={toggleModelVisible}/>
            ))}
          </div>
        </div>

        {/* Center — 3D Viewport (hidden in shared mode; CemViewer is the canvas) */}
        {!sharedViewerRef && <div ref={mountRef} style={s.viewport} onClick={onViewportClick}/>}

        {/* Right — Properties */}
        <div style={s.rPanel}>
          <div style={XP_TITLE}>Properties</div>
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
          {/* UV canvas */}
          <div style={{flexShrink:0,borderTop:'2px solid var(--bdr-dk)',background:'#111',overflow:'auto',maxHeight:180}}>
            <canvas ref={uvCanvasRef} style={{display:'block',imageRendering:'pixelated'}}/>
          </div>
        </div>

      </div>
    </div>
  )
})

export default Modeler
