import { useEffect, useRef } from 'react'
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

export default function CemViewer({ jem, onError, autoRotate = false, sidebarOffset = 0, showGrid = true, showAxes = true, fitScale = 1.0, enableZoom = true, bgColor = null }) {
  const mountRef = useRef(null)
  const ctxRef  = useRef(null)   // { scene, camera, controls, renderer, grid, modelGroup, firstLoad }
  const sidebarOffsetRef = useRef(sidebarOffset)
  useEffect(() => { sidebarOffsetRef.current = sidebarOffset }, [sidebarOffset])
  const fitScaleRef = useRef(fitScale)

  // Update background when theme changes
  useEffect(() => {
    if (!ctxRef.current) return
    ctxRef.current.scene.background = new THREE.Color(bgColor ?? 0x1a1a2e)
  }, [bgColor])

  // Toggle grid visibility
  useEffect(() => {
    if (!ctxRef.current?.grid) return
    ctxRef.current.grid.visible = showGrid
  }, [showGrid])

  // ── One-time scene / camera setup ────────────────────────────────────────
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
    controls.enableDamping    = true
    controls.dampingFactor    = 0.08
    controls.minDistance      = 5
    controls.maxDistance      = 400
    controls.autoRotate       = autoRotate
    controls.autoRotateSpeed  = 1.5
    controls.enableZoom       = enableZoom

    let animId
    function animate() {
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
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

    ctxRef.current = { scene, camera, controls, renderer, grid, modelGroup: null, firstLoad: true }

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      ctxRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap model whenever jem changes — camera stays put ────────────────────
  useEffect(() => {
    if (!jem || !ctxRef.current) return
    const ctx = ctxRef.current
    const { scene, camera, controls, grid } = ctx

    // Remove previous model and free GPU memory
    if (ctx.modelGroup) {
      scene.remove(ctx.modelGroup)
      disposeGroup(ctx.modelGroup)
      ctx.modelGroup = null
    }

    const loader = new THREE.TextureLoader()
    const rawPaths = collectTexturePaths(jem)

    Promise.all(
      rawPaths.map(raw =>
        new Promise(resolve => {
          loader.load(
            `/api/asset/?path=${encodeURIComponent(normTexPath(raw))}`,
            tex => resolve([raw, tex]),
            undefined,
            ()  => resolve([raw, null]),
          )
        })
      )
    ).then(entries => {
      if (!ctxRef.current) return  // unmounted while loading
      const textureMap = Object.fromEntries(entries.filter(([, t]) => t !== null))
      const modelGroup = jemToScene(jem, textureMap)

      const box    = new THREE.Box3().setFromObject(modelGroup)
      const center = box.getCenter(new THREE.Vector3())
      modelGroup.position.x -= center.x
      modelGroup.position.z -= center.z
      modelGroup.position.y -= box.min.y   // sit on grid
      if (grid) grid.position.y = 0

      // Aim orbit at the vertical centre of the model so nothing gets clipped
      const modelHeight = box.max.y - box.min.y
      controls.target.set(0, modelHeight / 2, 0)

      // Fit camera only on the very first model load; leave it alone after that
      if (ctx.firstLoad) {
        const size = box.getSize(new THREE.Vector3()).length()
        camera.position.set(size * 0.8 * fitScaleRef.current, size * 0.6 * fitScaleRef.current, size * 1.2 * fitScaleRef.current)
        controls.update()
        ctx.firstLoad = false
      }

      scene.add(modelGroup)
      ctx.modelGroup = modelGroup
    }).catch(e => onError?.(e.message))
  }, [jem]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
    />
  )
}
