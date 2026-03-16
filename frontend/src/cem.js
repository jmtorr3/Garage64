/**
 * cem.js — Convert OptiFine CEM JEM/JPM JSON to a Three.js scene graph.
 *
 * Handles:
 *   - Recursive submodel hierarchy → THREE.Group tree
 *   - invertAxis: "xy" / "xyz" etc. — inverts translate/rotate components
 *   - mirrorTexture: "u" — flips U coords on all boxes in that model
 *   - boxes with explicit uvNorth/South/East/West/Up/Down [x1,y1,x2,y2] (pixel)
 *   - boxes with textureOffset [u, v] — Minecraft standard cube UV layout
 *   - inflate property on boxes
 *   - Per-model texture/textureSize overrides (used by inlined JPM parts)
 */

import * as THREE from 'three'

const DEG = Math.PI / 180

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Build a Three.js Group from a compiled JEM JSON object.
 *
 * @param {object} jem          - parsed JEM JSON
 * @param {object} textureMap   - { "textures/entity/boat/oak.png": THREE.Texture, ... }
 *                                Keys are the raw texture paths found in the JEM.
 * @returns {THREE.Group}
 */
export function jemToScene(jem, textureMap) {
  const [tw, th] = jem.textureSize || [64, 32]
  const defaultMat = makeMat(textureMap[jem.texture])

  const root = new THREE.Group()
  // Minecraft CEM exports with Y inverted relative to Three.js world space
  root.scale.y = -1

  for (const entry of jem.models || []) {
    if ('model' in entry) continue  // skip any unresolved .jpm refs
    root.add(parseModel(entry, defaultMat, textureMap, tw, th))
  }

  return root
}

/**
 * Collect every unique texture path referenced anywhere in a JEM object.
 * Returns an array of raw path strings (may include "minecraft:" prefix).
 */
export function collectTexturePaths(jem) {
  const paths = new Set()
  if (jem.texture) paths.add(jem.texture)

  function walk(models) {
    for (const m of models || []) {
      if (m.texture) paths.add(m.texture)
      walk(m.submodels)
    }
  }
  walk(jem.models)
  return [...paths]
}

/**
 * Normalise a raw texture path to the form expected by the Django asset API
 * (i.e. relative to assets/minecraft/).
 *   "minecraft:optifine/cem/miata/parts/foo.png" → "optifine/cem/miata/parts/foo.png"
 *   "textures/entity/boat/oak.png"               → "textures/entity/boat/oak.png"
 */
export function normTexPath(raw) {
  return raw.replace(/^minecraft:/, '')
}

// ── Material factory ──────────────────────────────────────────────────────────

function makeMat(texture) {
  if (texture) {
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace
  }
  return new THREE.MeshBasicMaterial({
    map: texture || null,
    transparent: true,
    alphaTest: 0.05,
    side: THREE.DoubleSide,
  })
}

// ── Model / submodel parsing ──────────────────────────────────────────────────

function parseModel(model, parentMat, textureMap, parentTw, parentTh, parentMirror = false) {
  const group = new THREE.Group()
  group.name = model.id || model.part || ''

  const inv = model.invertAxis || ''
  const mirror = parentMirror || (model.mirrorTexture || '').includes('u')

  // If this model declares its own texture + textureSize, switch material
  const [tw, th] = model.textureSize ? model.textureSize : [parentTw, parentTh]
  let mat = parentMat
  if (model.texture && model.textureSize) {
    const tex = textureMap[model.texture]
    if (tex) mat = makeMat(tex)
  }

  applyTransform(group, model, inv)

  for (const box of model.boxes || []) {
    const mesh = parseBox(box, mat, tw, th, inv, mirror)
    if (mesh) group.add(mesh)
  }

  for (const sub of model.submodels || []) {
    group.add(parseModel(sub, mat, textureMap, tw, th, mirror))
  }

  return group
}

function applyTransform(obj, model, inv) {
  const [tx = 0, ty = 0, tz = 0] = model.translate || []
  const [rx = 0, ry = 0, rz = 0] = model.rotate || []

  const sx = inv.includes('x') ? -1 : 1
  const sy = inv.includes('y') ? -1 : 1
  const sz = inv.includes('z') ? -1 : 1

  obj.position.set(tx * sx, ty * sy, tz * sz)
  obj.rotation.order = 'ZYX'
  obj.rotation.x = rx * DEG * sx
  obj.rotation.y = ry * DEG * sy
  obj.rotation.z = rz * DEG * sz
}

// ── Box parsing ───────────────────────────────────────────────────────────────

function parseBox(box, mat, tw, th, inv, mirrorU) {
  const [bx, by, bz, bw, bh, bd] = box.coordinates
  const inflate = box.inflate || 0
  const w = bw + inflate * 2
  const h = bh + inflate * 2
  const d = bd + inflate * 2

  let uvFaces
  if (box.textureOffset) {
    const [u, v] = box.textureOffset
    uvFaces = mcCubeUVs(u, v, bw, bh, bd, tw, th)
  } else if (box.uvNorth !== undefined) {
    uvFaces = {
      north: normUV(box.uvNorth, tw, th),
      south: normUV(box.uvSouth, tw, th),
      east:  normUV(box.uvEast,  tw, th),
      west:  normUV(box.uvWest,  tw, th),
      up:    normUV(box.uvUp,    tw, th),
      down:  normUV(box.uvDown,  tw, th),
    }
  } else {
    const geo = new THREE.BoxGeometry(w, h, d)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x555555, wireframe: true, transparent: true, opacity: 0.4,
    }))
    mesh.position.set(bx + bw / 2, by + bh / 2, bz + bd / 2)
    return mesh
  }

  // When an axis is inverted the box centre moves to the opposite side, so the
  // face that was pointing outward now points inward — swap the UV pair.
  if (inv.includes('x')) {
    ;[uvFaces.east, uvFaces.west] = [uvFaces.west, uvFaces.east]
  }
  if (inv.includes('z')) {
    ;[uvFaces.north, uvFaces.south] = [uvFaces.south, uvFaces.north]
  }

  if (mirrorU) {
    for (const k of Object.keys(uvFaces)) {
      const [u0, v0, u1, v1] = uvFaces[k]
      uvFaces[k] = [u1, v0, u0, v1]
    }
  }

  const geo = buildBoxGeo(w, h, d, uvFaces)
  const mesh = new THREE.Mesh(geo, mat)

  const sx = inv.includes('x') ? -1 : 1
  const sy = inv.includes('y') ? -1 : 1
  const sz = inv.includes('z') ? -1 : 1

  mesh.position.set(
    (bx + bw / 2) * sx,
    (by + bh / 2) * sy,
    (bz + bd / 2) * sz,
  )

  return mesh
}

// ── UV helpers ────────────────────────────────────────────────────────────────

function normUV([x1, y1, x2, y2], tw, th) {
  return [x1 / tw, 1 - y2 / th, x2 / tw, 1 - y1 / th]
}

function mcCubeUVs(u, v, w, h, d, tw, th) {
  const f = (x1, y1, x2, y2) => normUV([x1, y1, x2, y2], tw, th)
  return {
    up:    f(u + d,           v,       u + d + w,           v + d    ),
    down:  f(u + d + w,       v,       u + 2 * d + w,       v + d    ),
    west:  f(u,               v + d,   u + d,               v + d + h),
    south: f(u + d,           v + d,   u + d + w,           v + d + h),
    east:  f(u + d + w,       v + d,   u + 2 * d + w,       v + d + h),
    north: f(u + 2 * d + w,   v + d,   u + 2 * d + 2 * w,  v + d + h),
  }
}

// ── Custom box geometry with per-face UVs ─────────────────────────────────────

function buildBoxGeo(w, h, d, uvFaces) {
  const hw = w / 2, hh = h / 2, hd = d / 2

  // root.scale.y = -1 flips the scene's Y axis, which has two consequences:
  //
  //  1. Side faces (N/S/E/W): local -hh (bottom) ends up visually at the top,
  //     so V must be flipped so the UV top still maps to the visual top.
  //
  //  2. Horizontal faces: local +hh ends up at the visual BOTTOM and -hh at
  //     the visual TOP — the opposite of the CEM convention. To fix this:
  //     - assign 'down' to the +hh geometry (visual bottom → correct)
  //     - assign 'up'   to the -hh geometry (visual top  → correct)
  //     The -hh geometry also has its Z vertex order reversed relative to the
  //     expected north=v1/south=v0 convention, so it needs flipV: true as well.
  const FACES = [
    { name: 'south', flipV: true,  verts: [[-hw,-hh, hd],[ hw,-hh, hd],[ hw, hh, hd],[-hw, hh, hd]] },
    { name: 'north', flipV: true,  verts: [[ hw,-hh,-hd],[-hw,-hh,-hd],[-hw, hh,-hd],[ hw, hh,-hd]] },
    { name: 'east',  flipV: true,  verts: [[ hw,-hh, hd],[ hw,-hh,-hd],[ hw, hh,-hd],[ hw, hh, hd]] },
    { name: 'west',  flipV: true,  verts: [[-hw,-hh,-hd],[-hw,-hh, hd],[-hw, hh, hd],[-hw, hh,-hd]] },
    { name: 'down',  flipV: false, verts: [[-hw, hh, hd],[ hw, hh, hd],[ hw, hh,-hd],[-hw, hh,-hd]] },
    { name: 'up',    flipV: true,  verts: [[-hw,-hh,-hd],[ hw,-hh,-hd],[ hw,-hh, hd],[-hw,-hh, hd]] },
  ]

  const positions = [], uvs = [], indices = []
  let vi = 0

  for (const face of FACES) {
    const uv = uvFaces[face.name]
    if (!uv) continue
    const [u0, v0, u1, v1] = uv
    for (const [px, py, pz] of face.verts) positions.push(px, py, pz)
    const [va, vb] = face.flipV ? [v1, v0] : [v0, v1]
    uvs.push(u0, va, u1, va, u1, vb, u0, vb)
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
    vi += 4
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}
