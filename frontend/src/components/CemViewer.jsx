import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { jemToScene, collectTexturePaths, normTexPath } from '../cem'

function disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose() })
    }
  })
}

const CemViewer = forwardRef(function CemViewer({
  jem, onError,
  autoRotate = false, sidebarOffset = 0,
  showGrid = true, showAxes = true,
  fitScale = 1.0, enableZoom = true, bgColor = null,
  // 3D painting
  enablePaint = false, onPaintUV = null, texturePatch = null, paintTexPath = null,
  // restore camera from a prior session
  initialCamera = null,
  // view cube gizmo
  showNavCube = false,
}, ref) {
  const mountRef       = useRef(null)
  const ctxRef         = useRef(null)
  const sidebarOffsetRef = useRef(sidebarOffset)
  const fitScaleRef    = useRef(fitScale)
  const texMapRef      = useRef({})       // path → THREE.Texture
  const enablePaintRef  = useRef(enablePaint)
  const onPaintUVRef    = useRef(onPaintUV)
  const paintTexPathRef = useRef(paintTexPath)
  const paintingRef    = useRef(false)
  const externalClickHandlerRef    = useRef(null)
  const externalDblClickHandlerRef = useRef(null)
  const rebuildVerRef  = useRef(0)

  const [rebuildTrigger, setRebuildTrigger] = useState(0)

  useEffect(() => { sidebarOffsetRef.current  = sidebarOffset }, [sidebarOffset])
  useEffect(() => { enablePaintRef.current    = enablePaint  }, [enablePaint])
  useEffect(() => { onPaintUVRef.current      = onPaintUV    }, [onPaintUV])
  useEffect(() => { paintTexPathRef.current   = paintTexPath }, [paintTexPath])

  const texturePatchRef = useRef(null)

  // ── Live texture patch — update material map without reloading model ──────
  useEffect(() => {
    texturePatchRef.current = texturePatch
    if (!texturePatch) return
    const { path, canvas } = texturePatch
    const tex = texMapRef.current[path]
    if (tex) { tex.image = canvas; tex.needsUpdate = true }
  }, [texturePatch])

  // ── Background / grid ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!ctxRef.current) return
    ctxRef.current.scene.background = new THREE.Color(bgColor ?? 0x1a1a2e)
  }, [bgColor])

  useEffect(() => {
    if (!ctxRef.current?.grid) return
    ctxRef.current.grid.visible = showGrid
  }, [showGrid])

  // ── One-time scene / camera / controls setup ──────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    const w = mount.clientWidth || 600
    const h = mount.clientHeight || 500

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bgColor ?? 0x1a1a2e)
    const grid = new THREE.GridHelper(128, 32, 0x333355, 0x222233)
    grid.visible = showGrid
    scene.add(grid)
    if (showAxes) scene.add(new THREE.AxesHelper(8))

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000)
    camera.position.set(30, 20, 40)
    if (sidebarOffsetRef.current) {
      camera.setViewOffset(w, h, -sidebarOffsetRef.current / 2, 0, w, h)
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping   = true
    controls.dampingFactor   = 0.08
    controls.minDistance     = 5
    controls.maxDistance     = 400
    controls.autoRotate      = autoRotate
    controls.autoRotateSpeed = 1.5
    controls.enableZoom      = enableZoom
    controls.mouseButtons    = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }

    // ── Paint raycasting ──────────────────────────────────────────────────
    const ray = new THREE.Raycaster()
    function doPaint(e, isFirst) {
      const ctx = ctxRef.current
      if (!ctx?.modelGroup || !onPaintUVRef.current) return
      const rect = mount.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ), camera)
      const hits = ray.intersectObjects([ctx.modelGroup], true)
      const filterPath = paintTexPathRef.current
      for (const hit of hits) {
        if (!hit.uv) continue
        if (filterPath) {
          const mats = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material]
          const matchesTex = mats.some(m => m.map?.userData?.paintPath === filterPath)
          if (!matchesTex) continue
        }
        onPaintUVRef.current(hit.uv.x, hit.uv.y, isFirst)
        return
      }
    }

    // Track mousedown position for drag detection
    let mouseDownPos = null

    function onDown(e) {
      mouseDownPos = { x: e.clientX, y: e.clientY }
      if (e.button !== 0 || !enablePaintRef.current) return
      paintingRef.current = true
      controls.enabled = false
      doPaint(e, true)
    }
    function onMove(e) {
      if (!paintingRef.current || !enablePaintRef.current) return
      doPaint(e, false)
    }
    function onUp(e) {
      const wasPainting = paintingRef.current
      if (paintingRef.current) {
        paintingRef.current = false
        controls.enabled = true
      }
      // Fire external click handler if no drag (<4px) and not painting
      if (mouseDownPos && !wasPainting && externalClickHandlerRef.current) {
        const dx = Math.abs(e.clientX - mouseDownPos.x)
        const dy = Math.abs(e.clientY - mouseDownPos.y)
        if (dx < 4 && dy < 4) {
          externalClickHandlerRef.current(e)
        }
      }
      mouseDownPos = null
    }
    const el = renderer.domElement
    function onDblClick(e) { externalDblClickHandlerRef.current?.(e) }
    el.addEventListener('mousedown',  onDown)
    el.addEventListener('mousemove',  onMove)
    el.addEventListener('mouseup',    onUp)
    el.addEventListener('dblclick',   onDblClick)
    el.addEventListener('mouseleave', () => {
      if (paintingRef.current) {
        paintingRef.current = false
        controls.enabled = true
      }
      mouseDownPos = null
    })

    // ── Nav cube gizmo ────────────────────────────────────────────────────
    let gizmoRenderer = null, gizmoScene = null, gizmoCamera = null, gizmoCube = null, gizmoFaceDefs = null
    const GIZMO_SIZE = 100
    if (showNavCube) {
      gizmoRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      gizmoRenderer.setSize(GIZMO_SIZE, GIZMO_SIZE)
      gizmoRenderer.setPixelRatio(window.devicePixelRatio)
      Object.assign(gizmoRenderer.domElement.style, {
        position: 'absolute', bottom: '10px', right: '10px',
        cursor: 'pointer', borderRadius: '4px', pointerEvents: 'auto',
      })
      mount.appendChild(gizmoRenderer.domElement)

      gizmoScene = new THREE.Scene()
      gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
      gizmoCamera.position.set(0, 0, 2.5)

      function makeFaceTex(label, bg) {
        const c = document.createElement('canvas')
        c.width = 128; c.height = 128
        const cx = c.getContext('2d')
        cx.fillStyle = bg
        cx.fillRect(0, 0, 128, 128)
        cx.strokeStyle = 'rgba(0,0,0,0.55)'
        cx.lineWidth = 6
        cx.strokeRect(3, 3, 122, 122)
        cx.fillStyle = '#fff'
        cx.font = 'bold 26px monospace'
        cx.textAlign = 'center'
        cx.textBaseline = 'middle'
        cx.fillText(label, 64, 64)
        return new THREE.CanvasTexture(c)
      }

      // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
      gizmoFaceDefs = [
        { label: 'Right', bg: '#c44', dir: new THREE.Vector3( 1,  0,  0) },
        { label: 'Left',  bg: '#833', dir: new THREE.Vector3(-1,  0,  0) },
        { label: 'Top',   bg: '#4a4', dir: new THREE.Vector3( 0,  1,  0) },
        { label: 'Bot',   bg: '#273', dir: new THREE.Vector3( 0, -1,  0) },
        { label: 'Front', bg: '#48c', dir: new THREE.Vector3( 0,  0,  1) },
        { label: 'Back',  bg: '#357', dir: new THREE.Vector3( 0,  0, -1) },
      ]

      const cubeMats = gizmoFaceDefs.map(f => new THREE.MeshBasicMaterial({ map: makeFaceTex(f.label, f.bg) }))
      gizmoCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMats)
      gizmoScene.add(gizmoCube)

      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01))
      gizmoCube.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x000000 })))

      const gizmoRay = new THREE.Raycaster()
      gizmoRenderer.domElement.addEventListener('click', e => {
        const rect = gizmoRenderer.domElement.getBoundingClientRect()
        const mx = ((e.clientX - rect.left) / GIZMO_SIZE) * 2 - 1
        const my = -((e.clientY - rect.top)  / GIZMO_SIZE) * 2 + 1
        gizmoRay.setFromCamera(new THREE.Vector2(mx, my), gizmoCamera)
        const hits = gizmoRay.intersectObject(gizmoCube)
        if (!hits.length) return
        const fi = Math.floor(hits[0].faceIndex / 2)
        const dir = gizmoFaceDefs[fi].dir
        const dist = camera.position.distanceTo(controls.target)
        camera.position.copy(controls.target).addScaledVector(dir, dist)
        camera.lookAt(controls.target)
        controls.update()
      })
    }

    let animId
    function animate() {
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      if (gizmoRenderer && gizmoCamera && gizmoCube) {
        const dir = camera.position.clone().sub(controls.target).normalize()
        gizmoCamera.position.copy(dir.multiplyScalar(2.5))
        gizmoCamera.up.copy(camera.up)
        gizmoCamera.lookAt(0, 0, 0)
        gizmoRenderer.render(gizmoScene, gizmoCamera)
      }
    }
    animate()

    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth
      const nh = mount.clientHeight
      if (sidebarOffsetRef.current) {
        camera.setViewOffset(nw, nh, -sidebarOffsetRef.current / 2, 0, nw, nh)
      } else {
        camera.clearViewOffset()
        camera.aspect = nw / nh
        camera.updateProjectionMatrix()
      }
      renderer.setSize(nw, nh)
    })
    ro.observe(mount)

    const firstLoad = !initialCamera
    if (initialCamera) {
      const [px, py, pz] = initialCamera.position
      const [tx, ty, tz] = initialCamera.target
      camera.position.set(px, py, pz)
      controls.target.set(tx, ty, tz)
      controls.update()
    }
    ctxRef.current = { scene, camera, controls, renderer, grid, modelGroup: null, firstLoad }

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      el.removeEventListener('mousedown',  onDown)
      el.removeEventListener('mousemove',  onMove)
      el.removeEventListener('mouseup',    onUp)
      el.removeEventListener('dblclick',   onDblClick)
      el.removeEventListener('mouseleave', onUp)
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      if (gizmoRenderer) {
        gizmoRenderer.dispose()
        if (mount.contains(gizmoRenderer.domElement)) mount.removeChild(gizmoRenderer.domElement)
      }
      ctxRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap model whenever jem changes — camera stays put ────────────────────
  useEffect(() => {
    if (!ctxRef.current) return
    const ctx = ctxRef.current
    const { scene, camera, controls, grid } = ctx

    if (ctx.modelGroup) {
      scene.remove(ctx.modelGroup)
      disposeGroup(ctx.modelGroup)
      ctx.modelGroup = null
    }

    if (!jem) return

    let cancelled = false
    const loader   = new THREE.TextureLoader()
    loader.manager.setURLModifier(url => `${url}&_t=${Date.now()}`)
    const rawPaths = collectTexturePaths(jem)

    Promise.all(
      rawPaths.map(raw =>
        new Promise(resolve => {
          loader.load(
            `/api/asset/?path=${encodeURIComponent(normTexPath(raw))}`,
            tex => { tex.userData = { paintPath: normTexPath(raw) }; resolve([raw, tex]) },
            undefined,
            ()  => resolve([raw, null]),
          )
        })
      )
    ).then(entries => {
      if (cancelled || !ctxRef.current) return
      const textureMap = {}
      for (const [raw, tex] of entries.filter(([, t]) => t !== null)) {
        textureMap[raw] = tex                   // raw key for jemToScene lookups
        textureMap[normTexPath(raw)] = tex      // normalized key for patch lookups
      }
      texMapRef.current = textureMap          // save for paint patches
      // Apply any pending texture patch (e.g. painted canvas from Block Editor)
      const patch = texturePatchRef.current
      if (patch && textureMap[patch.path]) {
        textureMap[patch.path].image = patch.canvas
        textureMap[patch.path].needsUpdate = true
      }
      const modelGroup  = jemToScene(jem, textureMap)

      // Remove any model that may have been added by a concurrent load
      if (ctx.modelGroup) {
        scene.remove(ctx.modelGroup)
        disposeGroup(ctx.modelGroup)
      }

      const box    = new THREE.Box3().setFromObject(modelGroup)
      const center = box.getCenter(new THREE.Vector3())
      modelGroup.position.x -= center.x
      modelGroup.position.z -= center.z
      modelGroup.position.y -= box.min.y
      if (grid) grid.position.y = 0

      const modelHeight = box.max.y - box.min.y
      controls.target.set(0, modelHeight / 2, 0)

      if (ctx.firstLoad) {
        const size = box.getSize(new THREE.Vector3()).length()
        camera.position.set(
          size * 0.8 * fitScaleRef.current,
          size * 0.6 * fitScaleRef.current,
          size * 1.2 * fitScaleRef.current,
        )
        controls.update()
        ctx.firstLoad = false
      }

      scene.add(modelGroup)
      ctx.modelGroup = modelGroup
    }).catch(e => onError?.(e.message))

    return () => { cancelled = true }
  }, [jem, rebuildTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Imperative handle ─────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getCtx: () => ctxRef.current,
    getTexMap: () => texMapRef.current,
    setClickHandler: fn => { externalClickHandlerRef.current = fn },
    clearClickHandler: () => { externalClickHandlerRef.current = null },
    setDblClickHandler: fn => { externalDblClickHandlerRef.current = fn },
    clearDblClickHandler: () => { externalDblClickHandlerRef.current = null },
    triggerRebuild: () => { rebuildVerRef.current++; setRebuildTrigger(v => v + 1) },
  }), [])

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', display: 'block', position: 'relative', cursor: enablePaint ? 'crosshair' : 'grab' }}
    />
  )
})

export default CemViewer
