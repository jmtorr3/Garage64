import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { jemToScene, collectTexturePaths, normTexPath } from '../cem'

export default function CemViewer({ jem, onError }) {
  const mountRef = useRef(null)

  useEffect(() => {
    if (!jem) return

    const mount = mountRef.current
    const w = mount.clientWidth || 600
    const h = mount.clientHeight || 500

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    mount.appendChild(renderer.domElement)

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    const grid = new THREE.GridHelper(128, 32, 0x333355, 0x222233)
    scene.add(grid)
    scene.add(new THREE.AxesHelper(8))

    // ── Camera + controls ─────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000)
    camera.position.set(30, 20, 40)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 5
    controls.maxDistance = 400

    // ── Animation loop ────────────────────────────────────────────────────────
    let animId
    function animate() {
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // ── Resize observer ───────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    ro.observe(mount)

    // ── Load all textures, then build model ───────────────────────────────────
    const loader = new THREE.TextureLoader()
    const rawPaths = collectTexturePaths(jem)

    Promise.all(
      rawPaths.map(raw =>
        new Promise(resolve => {
          const apiPath = normTexPath(raw)
          loader.load(
            `/api/asset/?path=${encodeURIComponent(apiPath)}`,
            tex => resolve([raw, tex]),
            undefined,
            () => resolve([raw, null]),   // missing texture → null, don't crash
          )
        })
      )
    ).then(entries => {
      const textureMap = Object.fromEntries(entries.filter(([, t]) => t !== null))

      const modelGroup = jemToScene(jem, textureMap)

      // Center the model horizontally, keep bottom at y=0
      const box = new THREE.Box3().setFromObject(modelGroup)
      const center = box.getCenter(new THREE.Vector3())
      modelGroup.position.x -= center.x
      modelGroup.position.z -= center.z
      modelGroup.position.y -= box.min.y   // sit on the grid

      // Drop the grid to just below the model
      grid.position.y = 0

      // Fit camera to model size
      const size = box.getSize(new THREE.Vector3()).length()
      camera.position.set(size * 0.8, size * 0.6, size * 1.2)
      controls.update()

      scene.add(modelGroup)
    }).catch(e => onError?.(e.message))

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [jem])

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
    />
  )
}
