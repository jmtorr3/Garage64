/**
 * Modeler — Blockbench-style CEM geometry editor.
 * Outliner | 3D viewport with TransformControls gizmos | Properties panel.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { ModelerProvider, useModeler } from './context/ModelerContext'
import { useSearchParams } from 'react-router-dom'
import { useTheme } from '../../ThemeContext'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { api } from '../../api'
import { collectTexturePaths, normTexPath, jemToScene } from '../../cem'
import CemViewer from '../../components/CemViewer'
import { buildSceneRoot, disposeGroup } from './utils/threeHelpers';
import { getNode, updateNode, extractModel, nestModel } from './utils/cemData';
import { getFaceRects, FACES } from './utils/uvMath';
import { DEG, XP_TITLE, XP_INPUT, s } from './styles'
import { selKey, getFlatVisible } from './utils/outlinerUtils'
import OutlinerPanel from './components/Outliner'
import TopBar from './components/TopBar'
import UVEditor from './components/Properties/UVEditor'
import Vec3Input from './components/Properties/Vec3Input'

const FACE_COLORS = { north: '#ff4455', south: '#44dd66', east: '#4499ff', west: '#ffcc00', up: '#44ffdd', down: '#ff44cc' }

function findThreeObj(root, sel) {
  if (!root || !sel) return null
  let found = null
  root.traverse(obj => { if (!found && selKey(obj.userData.cemSel) === selKey(sel)) found = obj })
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


function collectBoxes(model) {
  const result = []
  for (const box of (model.boxes || [])) result.push(box)
  for (const sub of (model.submodels || [])) result.push(...collectBoxes(sub))
  return result
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

// ── Component ─────────────────────────────────────────────────────────────────

const ModelerBase = forwardRef(function Modeler({
  partId: initPartId,
  bodyId: initBodyId,
  showGridProp,
  embedded = false,
  newPart,
  onBarUpdate,
  texturePatch,
  sharedViewerRef,
  uvZoom,
  onUvChange,
  onBack,
}, ref) {
  // 1. Grab EVERYTHING from context
  const {
    dataRef,
    origRef,
    undoStackRef,
    redoStackRef,
    sel, setSel,
    dataVer, setDataVer,
    isDirty, setIsDirty,
    pushUndo,
    bump,
    patchModel,
    patchBox,
    undoCount,
    redoCount,
  } = useModeler();

  const patchSelModel = (updater) => { if (sel?.modelPath) patchModel(sel.modelPath, updater) }
  const patchSelBox = (updater) => { if (sel?.modelPath != null && sel?.boxIdx != null) patchBox(sel.modelPath, sel.boxIdx, updater) }

  const [searchParams] = useSearchParams()
  const { isDark } = useTheme()
  const bg = isDark ? '#1e1e1e' : '#ece9d8'
  const [editMode, setEditMode] = useState('body') // 'body' | 'part'
  const [bodies, setBodies] = useState([])
  const [bodyId, setBodyId] = useState(null)
  const [parts, setParts] = useState([])
  const [partId, setPartId] = useState(null)
  const partObjRef = useRef(null) // full part object for save
  const [multiSel, setMultiSel] = useState([]) // all selected items (including primary)
  const [tcMode, setTcMode] = useState('translate')
  const [status, setStatus] = useState('')
  const [showGrid, setShowGrid] = useState(false)
  const [hiddenModels, setHiddenModels] = useState(new Set())
  const [openNodes, setOpenNodes] = useState(new Set()) // set of modelPath keys that are expanded
  const anchorSelRef = useRef(null) // last non-shift click — range selection anchor
  const [saveAsName, setSaveAsName] = useState('')
  const [rPanelWidth, setRPanelWidth] = useState(270)
  const hiddenModelsRef = useRef(new Set())
  const rPanelDragRef = useRef(null)

  const dragItemRef = useRef(null)
  const selRef = useRef(null)
  const multiSelRef = useRef([])
  const modelerUndoRef = useRef(null)
  const modelerRedoRef = useRef(null)

  // Model data lives in a ref so TC sync doesn't trigger rebuilds
  const tcModeRef = useRef('translate')
  useEffect(() => { selRef.current = sel }, [sel])
  useEffect(() => { multiSelRef.current = multiSel }, [multiSel])
  useEffect(() => { tcModeRef.current = tcMode }, [tcMode])
  useEffect(() => { if (ctxRef.current) ctxRef.current.scene.background = new THREE.Color(bg) }, [bg])
  useEffect(() => { if (ctxRef.current?.grid) ctxRef.current.grid.visible = showGrid }, [showGrid])
  useEffect(() => { if (showGridProp !== null) setShowGrid(showGridProp) }, [showGridProp])
  useEffect(() => { hiddenModelsRef.current = hiddenModels }, [hiddenModels])
  useEffect(() => {
    onBarUpdate?.({ tcMode, showGrid, hasSel: !!sel, undoCount, redoCount })
  }, [tcMode, showGrid, sel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Three.js
  const mountRef = useRef(null)
  const ctxRef = useRef(null)
  const texMapRef = useRef({})
  const helperRef = useRef(null) // BoxHelper for selection
  const tcSyncRef = useRef(false)
  const [selFace, setSelFace] = useState(null)
  const [showBody, setShowBody] = useState(false)
  const uvCanvasRef = useRef(null)
  const uvBufRef = useRef(null)
  const uvZoomRef = useRef(1)
  const uvDragRef = useRef(null)
  const [uvCursor, setUvCursor] = useState('default')
  const selFaceRef = useRef(null)
  const bodyGroupRef = useRef(null)
  useEffect(() => { selFaceRef.current = selFace }, [selFace])
  const redrawUVRef = useRef(null)

  // ── Load on mount — prefer props, fall back to query params ────────────────
  useEffect(() => {
    const reqBodyId = initBodyId ?? Number(searchParams.get('bodyId'))
    const reqPartId = initPartId ?? Number(searchParams.get('partId'))

    api.getBodies().then(bs => {
      setBodies(bs)
      const match = reqBodyId && bs.find(b => b.id === reqBodyId)
      setBodyId(match ? match.id : bs[0]?.id ?? null)
    })
    api.getParts().then(ps => {
      setParts(ps)
      if (reqPartId) {
        const match = ps.find(p => p.id === reqPartId)
        if (match) { setEditMode('part'); setPartId(match.id) }
      }
    })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── When embedded, sync editMode/partId/bodyId from parent props ───────────
  useEffect(() => {
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
      setDataVer(v => v + 1); setIsDirty(false); setSel(null)
      removeBodyPreview()
      if (ctxRef.current) {
        const ctx = ctxRef.current
        ctx.tc.detach()
        if (ctx.modelGroup) { ctx.scene.remove(ctx.modelGroup); disposeGroup(ctx.modelGroup); ctx.modelGroup = null }
      }
    } else {
      setEditMode('body')
    }
  }, [embedded, initPartId, newPart])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!embedded || !initBodyId) return
    setBodyId(initBodyId)
  }, [embedded, initBodyId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load body data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!bodyId || editMode !== 'body') return
    let cancelled = false
    api.getBody(bodyId).then(b => {
      if (cancelled) return
      dataRef.current = b.body_data; origRef.current = b.body_data
      undoStackRef.current = []; redoStackRef.current = []
      if (ctxRef.current && !embedded) ctxRef.current.firstLoad = true
      setDataVer(v => v + 1); setIsDirty(false); setSel(null); setStatus('')
      loadTexAndRebuild(b.body_data)
    })
    return () => { cancelled = true }
  }, [bodyId, editMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load part data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!partId || editMode !== 'part') return
    api.getPart(partId).then(p => {
      partObjRef.current = p
      const jem = partToJem(p)
      dataRef.current = jem; origRef.current = jem
      undoStackRef.current = []; redoStackRef.current = []
      if (ctxRef.current && !embedded) ctxRef.current.firstLoad = true
      setDataVer(v => v + 1); setIsDirty(false); setSel(null); setStatus('')
      loadTexAndRebuild(jem)
    })
  }, [partId, editMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync texture patches from Studio into this viewer ─────────────────────
  const texturePatchRef = useRef(null)
  useEffect(() => {
    texturePatchRef.current = texturePatch
    if (!texturePatch) return
    const { path, canvas } = texturePatch
    const tex = texMapRef.current[path]
    if (tex) { tex.image = canvas; tex.needsUpdate = true }
  }, [texturePatch])

  // ── Shared viewer init (when sharedViewerRef is provided) ─────────────────
  useEffect(() => {
    if (!sharedViewerRef) return
    const extCtx = sharedViewerRef.current?.getCtx()
    if (!extCtx) return

    const tc = new TransformControls(extCtx.camera, extCtx.renderer.domElement)
    tc.setMode('translate')
    tc.setTranslationSnap(1)
    tc.setRotationSnap(Math.PI / 12)  // 15°
    tc.setScaleSnap(0.5)
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
  useEffect(() => {
    if (sharedViewerRef) return
    const mount = mountRef.current; if (!mount) return
    const w = mount.clientWidth || 800, h = mount.clientHeight || 600

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h); renderer.setPixelRatio(window.devicePixelRatio)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene(); scene.background = new THREE.Color(bg)

    const grid = new THREE.GridHelper(128, 32, 0x333355, 0x222233)
    grid.visible = false
    scene.add(grid)

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000)
    camera.position.set(30, 20, 40)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true; orbit.dampingFactor = 0.08; orbit.minDistance = 5; orbit.maxDistance = 400
    orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }

    const tc = new TransformControls(camera, renderer.domElement)
    tc.setMode('translate')
    tc.setTranslationSnap(1)
    tc.setRotationSnap(Math.PI / 12)  // 15°
    tc.setScaleSnap(0.5)
    scene.add(tc)

    // Pause orbit while dragging gizmo
    tc.addEventListener('dragging-changed', e => { orbit.enabled = !e.value })

    // Update BoxHelper live while dragging
    tc.addEventListener('change', () => { if (helperRef.current) helperRef.current.update() })

    // Sync gizmo result → data on release
    tc.addEventListener('mouseUp', () => { syncTCToData(tc) })

    let animId
    function animate() { animId = requestAnimationFrame(animate); orbit.update(); renderer.render(scene, camera) }
    animate()

    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth, nh = mount.clientHeight
      camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh)
    })
    ro.observe(mount)

    ctxRef.current = { scene, camera, renderer, orbit, tc, grid, modelGroup: null, firstLoad: true }

    return () => {
      cancelAnimationFrame(animId); ro.disconnect()
      orbit.dispose(); tc.dispose(); renderer.dispose()
      if (bodyGroupRef.current) { disposeGroup(bodyGroupRef.current); bodyGroupRef.current = null }
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      ctxRef.current = null
    }
  }, [])

  // ── Rebuild on data change (not from TC sync) ──────────────────────────────
  useEffect(() => {
    if (tcSyncRef.current) return
    rebuildScene()
  }, [dataVer])  // eslint-disable-line react-hooks/exhaustive-deps

  // Load texture for UV canvas
  useEffect(() => {
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
  }, [dataVer]) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { redrawUV() }, [sel, selFace, dataVer])

  // ── TC mode changes ────────────────────────────────────────────────────────
  useEffect(() => {
    const tc = ctxRef.current?.tc; if (!tc) return
    const internalMode = tcMode === 'pivot' ? 'translate' : tcMode
    const cur = selRef.current
    if (!cur) return
    if (cur.kind === 'model') tc.setMode(internalMode)
    else if (cur.kind === 'box') tc.setMode(internalMode === 'scale' ? 'scale' : 'translate')
  }, [tcMode])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey) {
        if (!e.shiftKey && e.key === 'z') { e.preventDefault(); modelerUndoRef.current?.() }
        if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); modelerRedoRef.current?.() }
        return
      }
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'w' || e.key === 'W') setTcMode('translate')
      if (e.key === 'e' || e.key === 'E') setTcMode('rotate')
      if (e.key === 'Escape') clearSel()
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.isContentEditable) deleteSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scene management ───────────────────────────────────────────────────────

  function loadTexAndRebuild(data) {
    const loader = new THREE.TextureLoader()
    Promise.all(
      collectTexturePaths(data).map(raw => new Promise(res => {
        loader.load(`${import.meta.env.BASE_URL}api/asset/?path=${encodeURIComponent(normTexPath(raw))}`,
          tex => res([raw, tex]), undefined, () => res([raw, null]))
      }))
    ).then(entries => {
      if (!ctxRef.current) return
      texMapRef.current = Object.fromEntries(entries.filter(([, t]) => t))
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
    const ctx = ctxRef.current, data = dataRef.current
    if (!ctx || !data) return
    ctx.tc.detach()
    clearHelper()
    if (ctx.modelGroup) { ctx.scene.remove(ctx.modelGroup); disposeGroup(ctx.modelGroup); ctx.modelGroup = null }

    const group = buildSceneRoot(data, texMapRef.current)
    const box = new THREE.Box3().setFromObject(group)
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      group.position.x -= center.x
      group.position.z -= center.z
      group.position.y -= box.min.y
      const modelHeight = box.max.y - box.min.y
      ctx.orbit.target.set(0, modelHeight / 2, 0)
      if (ctx.firstLoad) {
        const size = box.getSize(new THREE.Vector3()).length()
        ctx.camera.position.set(size * .8, size * .6, size * 1.2); ctx.orbit.update(); ctx.firstLoad = false
      }
    } else if (ctx.firstLoad) {
      ctx.orbit.target.set(0, 8, 0)
      ctx.camera.position.set(20, 15, 25); ctx.orbit.update(); ctx.firstLoad = false
    }
    ctx.scene.add(group); ctx.modelGroup = group

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
    const cur = selRef.current
    if (cur) {
      const obj = findThreeObj(group, cur)
      if (obj) { ctx.tc.attach(obj); ctx.tc.setMode(cur.kind === 'box' ? 'translate' : (tcModeRef.current === 'pivot' ? 'translate' : tcModeRef.current)); attachHelper(obj) }
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
    const ctx = ctxRef.current; if (!ctx) return
    clearHelper()
    const h = new THREE.BoxHelper(obj, 0x00ccff)
    ctx.scene.add(h); helperRef.current = h
  }

  function clearHelper() {
    if (helperRef.current && ctxRef.current) { ctxRef.current.scene.remove(helperRef.current); helperRef.current = null }
  }

  // ── TC → data sync ─────────────────────────────────────────────────────────

  function syncTCToData(tc) {
    const obj = tc.object, sel = selRef.current, data = dataRef.current
    if (!obj || !sel || !data) return
    const model = getNode(data.models, sel.modelPath); if (!model) return
    const inv = model.invertAxis || ''
    const sx = inv.includes('x') ? -1 : 1, sy = inv.includes('y') ? -1 : 1, sz = inv.includes('z') ? -1 : 1
    const r = v => Math.round(v * 1000) / 1000

    let newModels
    if (sel.kind === 'model' && tcModeRef.current === 'pivot') {
      // Move pivot only — shift translate, inversely offset boxes and submodels so geometry stays put
      const oldT = model.translate || [0, 0, 0]
      const newT = [Math.round(obj.position.x * sx), Math.round(obj.position.y * sy), Math.round(obj.position.z * sz)]
      const d = [newT[0] - oldT[0], newT[1] - oldT[1], newT[2] - oldT[2]]
      newModels = updateNode(data.models, sel.modelPath, n => ({
        ...n,
        translate: newT,
        boxes: (n.boxes || []).map(box => {
          const [bx = 0, by = 0, bz = 0, ...rest] = box.coordinates || []
          return { ...box, coordinates: [Math.round(bx - d[0]), Math.round(by - d[1]), Math.round(bz - d[2]), ...rest] }
        }),
        submodels: (n.submodels || []).map(sub => {
          const [stx = 0, sty = 0, stz = 0] = sub.translate || []
          return { ...sub, translate: [Math.round(stx - d[0]), Math.round(sty - d[1]), Math.round(stz - d[2])] }
        }),
      }))
    } else if (sel.kind === 'model') {
      newModels = updateNode(data.models, sel.modelPath, n => ({
        ...n,
        translate: [Math.round(obj.position.x * sx), Math.round(obj.position.y * sy), Math.round(obj.position.z * sz)],
        rotate: [r(obj.rotation.x / DEG * sx), r(obj.rotation.y / DEG * sy), r(obj.rotation.z / DEG * sz)],
      }))
    } else if (sel.kind === 'box' && tcModeRef.current === 'scale') {
      const box = model.boxes[sel.boxIdx]
      const [bx = 0, by = 0, bz = 0, bw = 1, bh = 1, bd = 1] = box.coordinates || []
      // scaleSnap=0.5 so obj.scale goes in 0.5 steps; clamp to min 1 to avoid zero/negative dims
      const newW = Math.max(1, Math.round(bw * Math.abs(obj.scale.x)))
      const newH = Math.max(1, Math.round(bh * Math.abs(obj.scale.y)))
      const newD = Math.max(1, Math.round(bd * Math.abs(obj.scale.z)))
      newModels = updateNode(data.models, sel.modelPath, n => {
        const boxes = [...n.boxes]
        boxes[sel.boxIdx] = { ...box, coordinates: [bx, by, bz, newW, newH, newD] }
        return { ...n, boxes }
      })
    } else if (sel.kind === 'box') {
      const box = model.boxes[sel.boxIdx]
      const [, , , bw = 1, bh = 1, bd = 1] = box.coordinates || []
      newModels = updateNode(data.models, sel.modelPath, n => {
        const boxes = [...n.boxes]
        boxes[sel.boxIdx] = {
          ...box, coordinates: [
            Math.round(obj.position.x / sx - bw / 2), Math.round(obj.position.y / sy - bh / 2), Math.round(obj.position.z / sz - bd / 2),
            bw, bh, bd,
          ]
        }
        return { ...n, boxes }
      })
    } else return

    pushUndo()
    tcSyncRef.current = true
    dataRef.current = { ...data, models: newModels }
    setDataVer(v => v + 1); setIsDirty(true)
    setTimeout(() => { tcSyncRef.current = false }, 0)
  }

  // ── Raycasting click-to-select ──────────────────────────────────────────────

  function onViewportClick(e) {
    const ctx = ctxRef.current; if (!ctx?.modelGroup) return
    if (ctx.tc.dragging) return
    const rect = (sharedViewerRef ? ctx.renderer.domElement : mountRef.current).getBoundingClientRect()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    ), ctx.camera)
    const hits = ray.intersectObjects([ctx.modelGroup], true)
    for (const hit of hits) {
      const d = hit.object.userData.cemSel
      if (d) { selectAndAttach(d); return }
    }
    clearSel()
  }

  function toggleOpen(modelPath) {
    const key = modelPath.join('_')
    setOpenNodes(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function openNode(modelPath) {
    const key = modelPath.join('_')
    setOpenNodes(prev => prev.has(key) ? prev : new Set([...prev, key]))
  }

  function selectAndAttach(newSel, shiftKey = false, ctrlKey = false) {
    if (shiftKey) {
      // Range: select everything from anchor to newSel in visible order
      const flat = getFlatVisible(dataRef.current?.models, openNodes)
      const anchor = anchorSelRef.current ?? newSel
      const ai = flat.findIndex(s => selKey(s) === selKey(anchor))
      const ti = flat.findIndex(s => selKey(s) === selKey(newSel))
      const range = (ai === -1 || ti === -1)
        ? [newSel]
        : flat.slice(Math.min(ai, ti), Math.max(ai, ti) + 1)
      setMultiSel(range)
      setSel(newSel)
      // anchor stays unchanged for continued shift-clicks
    } else if (ctrlKey) {
      // Toggle individual item
      const key = selKey(newSel)
      setMultiSel(prev => prev.some(s => selKey(s) === key) ? prev.filter(s => selKey(s) !== key) : [...prev, newSel])
      setSel(newSel)
      anchorSelRef.current = newSel
    } else {
      setMultiSel([newSel])
      setSel(newSel)
      anchorSelRef.current = newSel
    }
    const ctx = ctxRef.current; if (!ctx?.modelGroup) return
    const obj = findThreeObj(ctx.modelGroup, newSel)
    if (obj) {
      ctx.tc.attach(obj)
      const internalMode = tcModeRef.current === 'pivot' ? 'translate' : tcModeRef.current
      // Boxes support translate and scale (resize); pivot/rotate only apply to models
      const boxMode = (internalMode === 'scale') ? 'scale' : 'translate'
      ctx.tc.setMode(newSel.kind === 'box' ? boxMode : internalMode)
      attachHelper(obj)
    }
  }

  function clearSel() {
    setSel(null)
    setMultiSel([])
    onUvChange?.(null)
    const ctx = ctxRef.current; if (!ctx) return
    ctx.tc.detach(); clearHelper()
  }

  const redrawUV = useCallback(() => {
    const canvas = uvCanvasRef.current
    const buf = uvBufRef.current
    if (!canvas) return
    const confSize = dataRef.current?.textureSize || [64, 32]
    const tw = buf ? buf.width : confSize[0]
    const th = buf ? buf.height : confSize[1]
    if (!tw || !th) { canvas.width = 0; canvas.height = 0; return }
    const zoom = (uvZoom && uvZoom > 0) ? uvZoom : Math.max(1, Math.floor(250 / Math.max(tw, 1)))
    uvZoomRef.current = zoom
    canvas.width = tw * zoom; canvas.height = th * zoom
    const ctx = canvas.getContext('2d')
    // checkerboard
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#1a1a1a' : '#222'
      ctx.fillRect(x * zoom, y * zoom, zoom, zoom)
    }
    ctx.imageSmoothingEnabled = false
    if (buf) ctx.drawImage(buf, 0, 0, tw * zoom, th * zoom)
    // pixel grid
    if (zoom >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5
      for (let x = 0; x <= tw; x++) { ctx.beginPath(); ctx.moveTo(x * zoom, 0); ctx.lineTo(x * zoom, th * zoom); ctx.stroke() }
      for (let y = 0; y <= th; y++) { ctx.beginPath(); ctx.moveTo(0, y * zoom); ctx.lineTo(tw * zoom, y * zoom); ctx.stroke() }
    }
    // UV overlay for selected element(s)
    const cur = selRef.current
    const allSel = multiSelRef.current.length ? multiSelRef.current : (cur ? [cur] : [])
    let boxList = []
    let singleBox = false
    if (allSel.length === 1 && allSel[0].kind === 'box') {
      const b = getNode(dataRef.current?.models, allSel[0].modelPath)?.boxes?.[allSel[0].boxIdx]
      if (b) { boxList = [b]; singleBox = true }
    } else {
      for (const s of allSel) {
        if (s.kind === 'box') {
          const b = getNode(dataRef.current?.models, s.modelPath)?.boxes?.[s.boxIdx]
          if (b) boxList.push(b)
        } else if (s.kind === 'model') {
          const node = getNode(dataRef.current?.models, s.modelPath)
          if (node) boxList.push(...collectBoxes(node))
        }
      }
    }

    const rectSets = []
    for (const box of boxList) {
      const rects = getFaceRects(box)
      rectSets.push(rects)
      for (const face of FACES) {
        const r = rects[face]; if (!r) continue
        const [x1, y1, x2, y2] = r
        const color = FACE_COLORS[face]
        const isSel = singleBox && face === selFaceRef.current
        const sx = Math.min(x1, x2) * zoom, sy = Math.min(y1, y2) * zoom
        const sw = Math.abs(x2 - x1) * zoom, sh = Math.abs(y2 - y1) * zoom
        ctx.globalAlpha = 1
        ctx.fillStyle = color + (isSel ? '55' : '28')
        ctx.fillRect(sx, sy, sw, sh)
        ctx.strokeStyle = color; ctx.lineWidth = isSel ? 2 : 1
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1)
        const ls = Math.max(6, zoom - 1)
        ctx.font = `bold ${ls}px monospace`; ctx.fillStyle = color
        ctx.fillText(face[0].toUpperCase(), sx + 2, sy + ls + 1)
      }
    }

    if (rectSets.length) {
      onUvChange?.({ rectSets, selFace: singleBox ? selFaceRef.current : null })
    } else {
      onUvChange?.(null)
    }
  }, [uvZoom, onUvChange]) // eslint-disable-line react-hooks/exhaustive-deps

  redrawUVRef.current = redrawUV

  // ── UV canvas interaction ─────────────────────────────────────────────────

  function getUVHit(px, py, box) {
    const rects = getFaceRects(box)
    for (const face of FACES) {
      const r = rects[face]; if (!r) continue
      const [x1, y1, x2, y2] = r
      const sx = Math.min(x1, x2), sy = Math.min(y1, y2)
      const sw = Math.abs(x2 - x1), sh = Math.abs(y2 - y1)
      if (px >= sx && px < sx + sw && py >= sy && py < sy + sh) return face
    }
    return null
  }

  // Collect all { modelPath, boxIdx, box } from a selection item (box or model/folder)
  function collectSelBoxes(s) {
    if (!dataRef.current) return []
    if (s.kind === 'box') {
      const box = getNode(dataRef.current.models, s.modelPath)?.boxes?.[s.boxIdx]
      return box ? [{ modelPath: s.modelPath, boxIdx: s.boxIdx, box }] : []
    }
    if (s.kind === 'model') {
      const node = getNode(dataRef.current.models, s.modelPath)
      if (!node) return []
      function walk(model, path) {
        const out = []
          ; (model.boxes || []).forEach((b, i) => out.push({ modelPath: path, boxIdx: i, box: b }))
          ; (model.submodels || []).forEach((sub, i) => out.push(...walk(sub, [...path, i])))
        return out
      }
      return walk(node, s.modelPath)
    }
    return []
  }

  function onUVMouseDown(e) {
    if (e.button !== 0) return
    const buf = uvBufRef.current; if (!buf) return
    const zoom = uvZoomRef.current
    const rect = uvCanvasRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / zoom
    const py = (e.clientY - rect.top) / zoom

    const allSel = multiSelRef.current.length ? multiSelRef.current : (selRef.current ? [selRef.current] : [])
    // Deduplicate boxes
    const seen = new Set()
    const allBoxes = []
    for (const s of allSel) {
      for (const it of collectSelBoxes(s)) {
        const k = `${it.modelPath.join('_')}_${it.boxIdx}`
        if (!seen.has(k)) { seen.add(k); allBoxes.push(it) }
      }
    }
    if (!allBoxes.length) return

    const origData = JSON.stringify(dataRef.current)

    if (allBoxes.length === 1) {
      // Single box: face-level drag (click must land on a rect)
      const { box, modelPath, boxIdx } = allBoxes[0]
      const hitFace = getUVHit(px, py, box)
      if (!hitFace) return
      if (box.textureOffset) {
        uvDragRef.current = { startPx: px, startPy: py, origData, items: [{ modelPath, boxIdx, mode: 'offset', startVal: [...box.textureOffset] }] }
      } else {
        const key = 'uv' + hitFace[0].toUpperCase() + hitFace.slice(1)
        setSelFace(hitFace)
        uvDragRef.current = { startPx: px, startPy: py, origData, items: [{ modelPath, boxIdx, mode: 'face', face: hitFace, startVal: [...(box[key] || [0, 0, 0, 0])] }] }
      }
    } else {
      // Multi: move all boxes together (both offset-mode and per-face)
      if (!allBoxes.length) return
      uvDragRef.current = {
        startPx: px, startPy: py, origData,
        items: allBoxes.map(it => {
          if (it.box.textureOffset) {
            return { modelPath: it.modelPath, boxIdx: it.boxIdx, mode: 'offset', startVal: [...it.box.textureOffset] }
          }
          // Per-face: snapshot all 6 face coords so we can shift them uniformly
          const faceCoords = {}
          for (const f of FACES) {
            const k = 'uv' + f[0].toUpperCase() + f.slice(1)
            if (it.box[k]) faceCoords[f] = [...it.box[k]]
          }
          return { modelPath: it.modelPath, boxIdx: it.boxIdx, mode: 'allfaces', faceCoords }
        })
      }
    }
    setUvCursor('grabbing')
  }

  function onUVMouseMove(e) {
    const buf = uvBufRef.current; if (!buf) return
    const zoom = uvZoomRef.current
    const rect = uvCanvasRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / zoom
    const py = (e.clientY - rect.top) / zoom

    const drag = uvDragRef.current
    if (!drag) {
      // Hover cursor — single primary box only
      const cur = selRef.current
      const box = cur?.kind === 'box'
        ? getNode(dataRef.current?.models, cur.modelPath)?.boxes?.[cur.boxIdx]
        : null
      setUvCursor(box && getUVHit(px, py, box) ? 'grab' : 'default')
      return
    }

    const dx = Math.round(px - drag.startPx)
    const dy = Math.round(py - drag.startPy)
    let models = dataRef.current.models
    for (const it of drag.items) {
      models = updateNode(models, it.modelPath, n => {
        const boxes = [...(n.boxes || [])]
        if (it.mode === 'offset') {
          boxes[it.boxIdx] = { ...boxes[it.boxIdx], textureOffset: [it.startVal[0] + dx, it.startVal[1] + dy] }
        } else if (it.mode === 'face' && it.face && it.startVal) {
          const key = 'uv' + it.face[0].toUpperCase() + it.face.slice(1)
          const [x1, y1, x2, y2] = it.startVal
          boxes[it.boxIdx] = { ...boxes[it.boxIdx], [key]: [x1 + dx, y1 + dy, x2 + dx, y2 + dy] }
        } else if (it.mode === 'allfaces') {
          const updated = { ...boxes[it.boxIdx] }
          for (const [f, coords] of Object.entries(it.faceCoords)) {
            const key = 'uv' + f[0].toUpperCase() + f.slice(1)
            const [x1, y1, x2, y2] = coords
            updated[key] = [x1 + dx, y1 + dy, x2 + dx, y2 + dy]
          }
          boxes[it.boxIdx] = updated
        }
        return { ...n, boxes }
      })
    }
    dataRef.current = { ...dataRef.current, models }
    redrawUVRef.current?.()
  }

  function onUVCommit() {
    const drag = uvDragRef.current; if (!drag) return
    uvDragRef.current = null
    setUvCursor('default')
    // Push the pre-drag snapshot onto the undo stack
    undoStackRef.current.push(drag.origData)
    if (undoStackRef.current.length > 100) undoStackRef.current.shift()
    redoStackRef.current = []
    setDataVer(v => v + 1)
    setIsDirty(true)
    notifyBar()
  }

  // ── UV auto-pack ─────────────────────────────────────────────────────────

  function autoPackUVs() {
    const cur = selRef.current
    if (!cur || !dataRef.current) return
    const texW = dataRef.current.textureSize?.[0] ?? uvBufRef.current?.width ?? 64

    // Collect all {modelPath, boxIdx, box} for the selected node
    function collectBoxPaths(model, fullPath) {
      const out = []
        ; (model.boxes || []).forEach((box, i) => out.push({ modelPath: fullPath, boxIdx: i, box }))
        ; (model.submodels || []).forEach((sub, i) => out.push(...collectBoxPaths(sub, [...fullPath, i])))
      return out
    }

    let items = []
    if (cur.kind === 'box') {
      const node = getNode(dataRef.current.models, cur.modelPath)
      const box = node?.boxes?.[cur.boxIdx]
      if (box) items = [{ modelPath: cur.modelPath, boxIdx: cur.boxIdx, box }]
    } else if (cur.kind === 'model') {
      const node = getNode(dataRef.current.models, cur.modelPath)
      if (node) items = collectBoxPaths(node, cur.modelPath)
    }
    if (!items.length) return

    const packable = items
    if (!packable.length) return

    // Compute cross-pattern pixel size for each box
    const sized = packable.map(item => {
      const [, , , w = 1, h = 1, d = 1] = item.box.coordinates || []
      return { ...item, pw: 2 * (d + w), ph: d + h }
    }).sort((a, b) => b.ph - a.ph || b.pw - a.pw) // tallest first

    // Shelf packing — greedy left-to-right, new row when full
    const shelves = [] // { y, h, usedW }
    const placements = []
    for (const item of sized) {
      const { pw, ph } = item
      let shelf = shelves.find(s => texW - s.usedW >= pw)
      if (!shelf) {
        const y = shelves.reduce((acc, s) => acc + s.h, 0)
        shelf = { y, h: ph, usedW: 0 }
        shelves.push(shelf)
      }
      placements.push({ item, u: shelf.usedW, v: shelf.y })
      shelf.usedW += pw
    }

    // Apply — strip per-face UV keys, set textureOffset
    const PER_FACE = ['uvNorth', 'uvSouth', 'uvEast', 'uvWest', 'uvUp', 'uvDown']
    pushUndo()
    let newModels = dataRef.current.models
    for (const { item, u, v } of placements) {
      newModels = updateNode(newModels, item.modelPath, n => {
        const boxes = [...(n.boxes || [])]
        const cleaned = { ...boxes[item.boxIdx] }
        PER_FACE.forEach(k => delete cleaned[k])
        cleaned.textureOffset = [u, v]
        boxes[item.boxIdx] = cleaned
        return { ...n, boxes }
      })
    }
    dataRef.current = { ...dataRef.current, models: newModels }
    setDataVer(v => v + 1)
    setIsDirty(true)
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
    const texMap = Object.fromEntries(entries.filter(([, t]) => t))
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

  useEffect(() => {
    if (showBody && editMode === 'part' && bodyId) loadBodyPreview()
    else removeBodyPreview()
  }, [showBody, editMode, bodyId])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data mutations ─────────────────────────────────────────────────────────

  function notifyBar() {
    onBarUpdate?.({ tcMode: tcModeRef.current, showGrid: ctxRef.current?.grid?.visible ?? false, hasSel: !!selRef.current, undoCount: undoStackRef.current.length, redoCount: redoStackRef.current.length })
  }

  function modelerUndo() {
    if (!undoStackRef.current.length) return
    redoStackRef.current.push(JSON.stringify(dataRef.current))
    dataRef.current = JSON.parse(undoStackRef.current.pop())
    setDataVer(v => v + 1); setIsDirty(true)
    rebuildScene(); notifyBar()
  }

  function modelerRedo() {
    if (!redoStackRef.current.length) return
    undoStackRef.current.push(JSON.stringify(dataRef.current))
    dataRef.current = JSON.parse(redoStackRef.current.pop())
    setDataVer(v => v + 1); setIsDirty(true)
    rebuildScene(); notifyBar()
  }

  modelerUndoRef.current = modelerUndo
  modelerRedoRef.current = modelerRedo

  function addCube() {
    if (!dataRef.current) return
    if (!dataRef.current.models?.length) {
      bump([{ id: 'root', boxes: [{ coordinates: [0, 0, 0, 4, 4, 4], textureOffset: [0, 0] }], submodels: [] }])
      return
    }
    const path = sel?.kind === 'model' ? sel.modelPath : [0]
    bump(updateNode(dataRef.current.models, path, n => ({
      ...n, boxes: [...(n.boxes || []), { coordinates: [0, 0, 0, 4, 4, 4], textureOffset: [0, 0] }]
    })))
  }

  function deleteModel(path) {
    if (!path || !dataRef.current) return
    pushUndo()
    const clone = JSON.parse(JSON.stringify(dataRef.current.models))
    if (path.length === 1) {
      clone.splice(path[0], 1)
    } else {
      let parent = clone[path[0]]
      for (let i = 1; i < path.length - 1; i++) parent = parent.submodels[path[i]]
      parent.submodels.splice(path[path.length - 1], 1)
    }
    dataRef.current = { ...dataRef.current, models: clone }
    setDataVer(v => v + 1); setIsDirty(true)
    clearSel()
  }

  function deleteSelected() {
    if (!dataRef.current) return
    const targets = multiSelRef.current.length ? multiSelRef.current : (sel ? [sel] : [])
    if (!targets.length) return
    // Delete boxes first (sort by descending boxIdx to avoid index shift), then models
    const boxes = targets.filter(s => s.kind === 'box')
      .sort((a, b) => b.boxIdx - a.boxIdx)
    // Sort model paths descending by last index to avoid index shifts during removal
    const models = targets.filter(s => s.kind === 'model')
      .sort((a, b) => b.modelPath[b.modelPath.length - 1] - a.modelPath[a.modelPath.length - 1])
    let newModels = dataRef.current.models
    for (const s of boxes) {
      newModels = updateNode(newModels, s.modelPath, n => {
        const bxs = [...(n.boxes || [])]; bxs.splice(s.boxIdx, 1); return { ...n, boxes: bxs }
      })
    }
    for (const s of models) {
      ;[newModels] = extractModel(newModels, s.modelPath)
    }
    bump(newModels)
    clearSel()
  }

  function handleRename(modelPath, newName) {
    bump(updateNode(dataRef.current.models, modelPath, n => ({ ...n, id: newName })))
  }

  function handleRenameBox(modelPath, boxIdx, newName) {
    bump(updateNode(dataRef.current.models, modelPath, n => {
      const boxes = [...(n.boxes || [])]; boxes[boxIdx] = { ...boxes[boxIdx], name: newName }; return { ...n, boxes }
    }))
  }

  function handleDeleteBox(modelPath, boxIdx) {
    bump(updateNode(dataRef.current.models, modelPath, n => {
      const boxes = [...(n.boxes || [])]; boxes.splice(boxIdx, 1); return { ...n, boxes }
    }))
    clearSel()
  }

  async function save() {
    setStatus('')
    try {
      if (editMode === 'part' && partId && partObjRef.current) {
        const p = partObjRef.current
        const partData = dataRef.current.models[0]?.submodels?.[0] ?? dataRef.current.models[0]
        await api.updatePart(partId, { ...p, part_data: partData })
      } else {
        await api.patchBody(bodyId, { body_data: dataRef.current })
      }
      origRef.current = dataRef.current; setIsDirty(false); setStatus('ok')
    } catch (e) { setStatus(e.message) }
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
      origRef.current = dataRef.current; setIsDirty(false); setStatus('ok'); return true
    } catch (e) { setStatus(e.message) }
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
    // ── UV editing from Studio texture grid ──────────────────────────────────
    // Returns { origData, items: [{modelPath,boxIdx,mode,startVal,face?}] }
    // items = all selected offset-mode boxes (multi or single)
    // For a single box with face UVs, also returns rects+face for Studio hit test
    getBoxUVInfo: () => {
      if (!dataRef.current) return null
      const allSel = multiSelRef.current.length ? multiSelRef.current : (selRef.current ? [selRef.current] : [])
      const seen = new Set()
      const allBoxes = []
      for (const s of allSel) {
        for (const it of collectSelBoxes(s)) {
          const k = `${it.modelPath.join('_')}_${it.boxIdx}`
          if (!seen.has(k)) { seen.add(k); allBoxes.push(it) }
        }
      }
      if (!allBoxes.length) return null
      const origData = JSON.stringify(dataRef.current)
      if (allBoxes.length === 1) {
        const { box, modelPath, boxIdx } = allBoxes[0]
        const rects = getFaceRects(box)
        // For face-mode boxes, item.face is filled in by Studio after hit test
        return {
          origData, modelPath, boxIdx,
          singleFaceMode: !box.textureOffset,
          rects,
          items: box.textureOffset
            ? [{ modelPath, boxIdx, mode: 'offset', startVal: [...box.textureOffset] }]
            : [{ modelPath, boxIdx, mode: 'face', startFaceRects: rects }], // face filled in by caller
        }
      }
      // Multi: move all boxes (offset and per-face)
      if (!allBoxes.length) return null
      return {
        origData,
        singleFaceMode: false,
        rects: null,
        items: allBoxes.map(it => {
          if (it.box.textureOffset)
            return { modelPath: it.modelPath, boxIdx: it.boxIdx, mode: 'offset', startVal: [...it.box.textureOffset] }
          const faceCoords = {}
          for (const f of FACES) {
            const k = 'uv' + f[0].toUpperCase() + f.slice(1)
            if (it.box[k]) faceCoords[f] = [...it.box[k]]
          }
          return { modelPath: it.modelPath, boxIdx: it.boxIdx, mode: 'allfaces', faceCoords }
        }),
      }
    },
    // items = array from getBoxUVInfo; du/dv = pixel delta
    // For face-mode items, item.face and item.startVal must be set before calling
    applyUVMove: (du, dv, items) => {
      if (!dataRef.current || !items?.length) return
      const rdu = Math.round(du), rdv = Math.round(dv)
      let models = dataRef.current.models
      for (const it of items) {
        models = updateNode(models, it.modelPath, n => {
          const boxes = [...(n.boxes || [])]
          if (it.mode === 'offset') {
            boxes[it.boxIdx] = { ...boxes[it.boxIdx], textureOffset: [it.startVal[0] + rdu, it.startVal[1] + rdv] }
          } else if (it.mode === 'face' && it.face && it.startVal) {
            const key = 'uv' + it.face[0].toUpperCase() + it.face.slice(1)
            const [x1, y1, x2, y2] = it.startVal
            boxes[it.boxIdx] = { ...boxes[it.boxIdx], [key]: [x1 + rdu, y1 + rdv, x2 + rdu, y2 + rdv] }
          } else if (it.mode === 'allfaces') {
            const updated = { ...boxes[it.boxIdx] }
            for (const [f, coords] of Object.entries(it.faceCoords)) {
              const key = 'uv' + f[0].toUpperCase() + f.slice(1)
              const [x1, y1, x2, y2] = coords
              updated[key] = [x1 + rdu, y1 + rdv, x2 + rdu, y2 + rdv]
            }
            boxes[it.boxIdx] = updated
          }
          return { ...n, boxes }
        })
      }
      dataRef.current = { ...dataRef.current, models }
      redrawUVRef.current?.()
    },
    commitUV: origData => {
      if (!origData) return
      undoStackRef.current.push(origData)
      if (undoStackRef.current.length > 100) undoStackRef.current.shift()
      redoStackRef.current = []
      setDataVer(v => v + 1); setIsDirty(true); notifyBar()
    },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  function startRPanelResize(e) {
    if (e.button !== 0) return
    e.preventDefault()
    rPanelDragRef.current = e.clientX
    const startW = rPanelWidth
    const onMove = ev => setRPanelWidth(Math.max(200, Math.min(520, startW + (rPanelDragRef.current - ev.clientX))))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function revert() {
    dataRef.current = origRef.current
    setDataVer(v => v + 1); setIsDirty(false); clearSel(); setStatus('')
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
    if (src.kind === 'box' && target.kind === 'box' &&
      JSON.stringify(src.modelPath) === JSON.stringify(target.modelPath) &&
      src.boxIdx !== target.boxIdx) {
      bump(updateNode(data.models, src.modelPath, n => {
        const boxes = [...(n.boxes || [])]
        const [moved] = boxes.splice(src.boxIdx, 1)
        boxes.splice(target.boxIdx, 0, moved)
        return { ...n, boxes }
      }))
      return
    }

    // Move cube into/between models (box → model row, or box → box in different model)
    if (src.kind === 'box' && (target.kind === 'model' || (target.kind === 'box' && JSON.stringify(src.modelPath) !== JSON.stringify(target.modelPath)))) {
      const srcNode = getNode(data.models, src.modelPath)
      const box = srcNode?.boxes?.[src.boxIdx]
      if (!box) return
      const targetModelPath = target.kind === 'model' ? target.modelPath : target.modelPath
      const targetBoxIdx = target.kind === 'box' ? target.boxIdx : null
      pushUndo()
      // Remove from source model
      let models = updateNode(data.models, src.modelPath, n => {
        const boxes = [...(n.boxes || [])]; boxes.splice(src.boxIdx, 1); return { ...n, boxes }
      })
      // Insert into target model
      models = updateNode(models, targetModelPath, n => {
        const boxes = [...(n.boxes || [])]
        targetBoxIdx !== null ? boxes.splice(targetBoxIdx, 0, box) : boxes.push(box)
        return { ...n, boxes }
      })
      dataRef.current = { ...data, models }
      setDataVer(v => v + 1); setIsDirty(true); clearSel()
      return
    }

    if (src.kind === 'model' && target.kind === 'model') {
      const sp = src.modelPath, tp = target.modelPath
      if (JSON.stringify(sp) === JSON.stringify(tp)) return
      // Can't nest into own descendant
      if (tp.length > sp.length && sp.every((v, i) => tp[i] === v)) return

      const spParent = JSON.stringify(sp.slice(0, -1))
      const tpParent = JSON.stringify(tp.slice(0, -1))

      pushUndo()
      if (spParent === tpParent) {
        // Same parent → reorder within that parent
        const parentPath = sp.slice(0, -1)
        const srcIdx = sp[sp.length - 1], tgtIdx = tp[tp.length - 1]
        if (parentPath.length === 0) {
          const models = [...data.models]
          const [moved] = models.splice(srcIdx, 1)
          models.splice(tgtIdx, 0, moved)
          dataRef.current = { ...data, models }
        } else {
          dataRef.current = {
            ...data, models: updateNode(data.models, parentPath, n => {
              const subs = [...(n.submodels || [])]
              const [moved] = subs.splice(srcIdx, 1)
              subs.splice(tgtIdx, 0, moved)
              return { ...n, submodels: subs }
            })
          }
        }
      } else {
        // Different parent → nest src into target
        const [m1, node] = extractModel(data.models, sp)
        const adjTp = adjustPath(sp, tp)
        dataRef.current = { ...data, models: nestModel(m1, adjTp, node) }
      }
      setDataVer(v => v + 1); setIsDirty(true)
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
    dataRef.current = { ...data, models: [...newModels, node] }
    setDataVer(v => v + 1); setIsDirty(true)
  }

  function addFolder() {
    if (!dataRef.current) return
    pushUndo()
    const existing = (dataRef.current.models || []).filter(m => (m.id || '').startsWith('folder'))
    const name = `folder_${existing.length + 1}`
    const newFolder = { id: name, boxes: [], submodels: [] }
    dataRef.current = { ...dataRef.current, models: [...(dataRef.current.models || []), newFolder] }
    setDataVer(v => v + 1); setIsDirty(true)
  }

  // ── Derived for render ─────────────────────────────────────────────────────
  const data = dataRef.current
  const selModel = sel?.kind === 'model' ? getNode(data?.models, sel.modelPath) : null
  const selBox = sel?.kind === 'box' ? getNode(data?.models, sel.modelPath)?.boxes?.[sel.boxIdx] : null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={embedded ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : s.page}>

      {/* Toolbar — hidden when embedded (tools live in Studio's center top bar) */}
      {!embedded && (
        <TopBar
          editMode={editMode} setEditMode={setEditMode}
          bodies={bodies} bodyId={bodyId} setBodyId={setBodyId}
          parts={parts} partId={partId} setPartId={setPartId}
          showBody={showBody} setShowBody={setShowBody}
          tcMode={tcMode} setTcMode={setTcMode}
          showGrid={showGrid} setShowGrid={setShowGrid}
          sel={sel} status={status} isDirty={isDirty}
          addCube={addCube} deleteSelected={deleteSelected}
          save={save} revert={revert} onBack={onBack}
        />
      )}

      <div style={s.content}>

        {/* Left — Outliner */}
        <OutlinerPanel
          models={data?.models} sel={sel} multiSel={multiSel}
          onSel={selectAndAttach} onDragStart={handleDragStart} onDrop={handleDrop} onDropRoot={handleDropRoot}
          hiddenModels={hiddenModels} onToggleVisible={toggleModelVisible}
          onRename={handleRename} onDelete={deleteModel}
          onRenameBox={handleRenameBox} onDeleteBox={handleDeleteBox}
          openNodes={openNodes} onToggleOpen={toggleOpen} onOpenNode={openNode}
          onAddFolder={addFolder}
        />

        {/* Center — 3D Viewport (hidden in shared mode; CemViewer is the canvas) */}
        {!sharedViewerRef && <div ref={mountRef} style={s.viewport} onClick={onViewportClick} />}

        {/* Right — Properties */}
        <div style={{ ...s.rPanel, width: rPanelWidth }}>
          {/* Resize handle */}
          <div onMouseDown={startRPanelResize} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', zIndex: 10, background: 'transparent' }} />
          <div style={XP_TITLE}>Properties</div>

          {/* ── Texture size ── */}
          {data && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderBottom: '1px solid var(--bdr-dk)', flexShrink: 0 }}>
              <span style={{ ...s.label, marginBottom: 0, whiteSpace: 'nowrap' }}>Texture</span>
              {[0, 1].map(i => (
                <input key={i} type="number" min={1} step={1}
                  style={{ ...s.numInput, width: 42 }}
                  value={data.textureSize?.[i] ?? (i === 0 ? 64 : 32)}
                  onChange={e => {
                    const v = Math.max(1, parseInt(e.target.value) || 1)
                    const cur = data.textureSize || [64, 32]
                    const next = i === 0 ? [v, cur[1]] : [cur[0], v]
                    pushUndo()
                    dataRef.current = { ...dataRef.current, textureSize: next }
                    setDataVer(v => v + 1); setIsDirty(true)
                    redrawUVRef.current?.()
                  }}
                />
              ))}
              <span style={{ ...s.label, marginBottom: 0, color: 'var(--clr-text-dim)' }}>W × H</span>
            </div>
          )}

          {/* ── UV / Texture canvas ── */}
          <UVEditor
            uvCanvasRef={uvCanvasRef} uvCursor={uvCursor} uvBufRef={uvBufRef}
            onMouseDown={onUVMouseDown} onMouseMove={onUVMouseMove}
            onMouseUp={onUVCommit} onMouseLeave={onUVCommit}
          />

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: 0 }}>

            {!sel && (
              <div style={{ ...s.label, lineHeight: '1.8' }}>
                Click an element to select it.<br />
                <span style={{ color: 'var(--clr-text-dim)' }}>W</span> Move &nbsp;
                <span style={{ color: 'var(--clr-text-dim)' }}>E</span> Rotate &nbsp;
                <span style={{ color: 'var(--clr-text-dim)' }}>Del</span> Delete
              </div>
            )}

            {selModel && (
              <>
                <div style={{ ...s.label, fontWeight: 'bold', marginBottom: 8, fontSize: '12px' }}>
                  Bone: {selModel.id || selModel.part}
                </div>
                <Vec3Input label="Translate" value={selModel.translate || [0, 0, 0]}
                  onChange={v => patchSelModel(n => ({ ...n, translate: v }))} />
                <Vec3Input label="Rotate (°)" value={selModel.rotate || [0, 0, 0]}
                  onChange={v => patchSelModel(n => ({ ...n, rotate: v }))} />
                <button style={{ ...s.btnSm, marginTop: 4 }} onClick={autoPackUVs}
                  title="Re-pack all UV offsets in this folder with no overlap">
                  ⬡ Auto-Pack UVs
                </button>
              </>
            )}

            {selBox && (
              <>
                <div style={{ ...s.label, fontWeight: 'bold', marginBottom: 8, fontSize: '12px' }}>
                  Cube {sel.boxIdx}
                </div>
                <Vec3Input label="Position" value={selBox.coordinates?.slice(0, 3) || [0, 0, 0]}
                  onChange={v => patchSelBox(b => ({ ...b, coordinates: [...v, ...(b.coordinates?.slice(3) || [1, 1, 1])] }))} />
                <Vec3Input label="Size" value={selBox.coordinates?.slice(3, 6) || [1, 1, 1]} step={1}
                  onChange={v => patchSelBox(b => ({ ...b, coordinates: [...(b.coordinates?.slice(0, 3) || [0, 0, 0]), ...v] }))} />
                <button style={{ ...s.btnSm, marginBottom: 8 }} onClick={autoPackUVs}
                  title="Re-pack UV offsets for all cubes in the parent folder">
                  ⬡ Auto-Pack UVs
                </button>

                {/* Face selector */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ ...s.label, marginBottom: 4 }}>UV Faces</div>
                  {FACES.map(face => (
                    <div key={face} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', cursor: 'pointer',
                      background: selFace === face ? 'var(--clr-accent)' : 'transparent', borderRadius: 2, paddingLeft: 4
                    }}
                      onClick={() => setSelFace(f => f === face ? null : face)}>
                      <div style={{ width: 10, height: 10, background: FACE_COLORS[face], flexShrink: 0 }} />
                      <span style={{
                        fontSize: '11px', fontFamily: 'Monocraft, sans-serif',
                        color: selFace === face ? '#fff' : 'var(--clr-text-dim)'
                      }}>{face.toUpperCase()}</span>
                    </div>
                  ))}
                </div>

                {/* UV coordinates */}
                {selBox.textureOffset ? (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ ...s.label, marginBottom: 2 }}>Texture Offset</div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {['U', 'V'].map((ax, i) => (
                        <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span style={s.propLabel}>{ax}</span>
                          <input type="number" style={s.numInput}
                            value={selBox.textureOffset?.[i] ?? 0}
                            onChange={e => {
                              const t = [...(selBox.textureOffset || [0, 0])]; t[i] = Number(e.target.value)
                              patchSelBox(b => ({ ...b, textureOffset: t }))
                            }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selFace ? (() => {
                  const key = 'uv' + selFace[0].toUpperCase() + selFace.slice(1)
                  const coords = selBox[key] || [0, 0, 0, 0]
                  return (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...s.label, marginBottom: 2, color: FACE_COLORS[selFace] }}>{selFace.toUpperCase()} UV</div>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {['x1', 'y1', 'x2', 'y2'].map((lbl, ci) => (
                          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <span style={s.propLabel}>{lbl}</span>
                            <input type="number" style={s.numInput} value={coords[ci]}
                              onChange={e => {
                                const n = [...coords]; n[ci] = Number(e.target.value)
                                patchSelBox(b => ({ ...b, [key]: n }))
                              }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })() : (
                  <div style={{ ...s.label, marginBottom: 8, fontSize: '10px' }}>Select a face to edit its UV</div>
                )}

                <div style={{ marginBottom: 8 }}>
                  <div style={{ ...s.label, marginBottom: 2 }}>Inflate</div>
                  <input type="number" step={0.5} style={s.numInput}
                    value={selBox.inflate ?? 0}
                    onChange={e => patchSelBox(b => ({ ...b, inflate: Number(e.target.value) }))} />
                </div>
              </>
            )}
          </div>
          {/* Model preview */}
          <div style={{ flexShrink: 0, borderTop: '2px solid var(--bdr-dk)', height: 180 }}>
            <CemViewer key={dataVer} jem={dataRef.current} texturePatch={texturePatch} showGrid={false} showAxes={false} autoRotate />
          </div>

          {/* Save section — only when embedded in Studio */}
          {embedded && (
            <div style={{ flexShrink: 0, borderTop: '2px solid var(--bdr-dk)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={XP_TITLE}>Save</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '4px' }}>
                <button style={s.btn} onClick={save}>Update Part</button>
                {status === 'ok' && <span style={s.ok}>Saved!</span>}
                {status && status !== 'ok' && <span style={s.err}>{status}</span>}
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <input
                  style={{ ...XP_INPUT, flex: 1, minWidth: 0 }}
                  placeholder="new part name…"
                  value={saveAsName}
                  onChange={e => setSaveAsName(e.target.value)}
                />
                <button style={s.btnSm} onClick={async () => { const ok = await saveAs(saveAsName); if (ok) setSaveAsName('') }}>Save As</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
})

const Modeler = forwardRef((props, ref) => (
  <ModelerProvider>
    <ModelerBase {...props} ref={ref} />
  </ModelerProvider>
));

export default Modeler;
