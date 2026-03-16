# CEM → Three.js UV Mapping Reference

Documents every coordinate-system quirk solved in `cem.js` so they don't need to be re-derived from scratch.

---

## Coordinate systems

| System | Y direction | Z direction |
|--------|------------|-------------|
| Minecraft / CEM | +Y = up | +Z = south |
| Three.js (default) | +Y = up | +Z = toward viewer |

### The global Y flip (`root.scale.y = -1`)

Minecraft CEM models export with Y pointing **down** relative to Three.js world space.
The root group is created with `root.scale.y = -1` to invert the entire scene and make the model upright.

This single transform is the source of most UV correction work.

---

## Face name conventions (CEM)

| Name | Points toward | Local geometry axis |
|------|--------------|---------------------|
| north | −Z | −hd |
| south | +Z | +hd |
| east  | +X | +hw |
| west  | −X | −hw |
| up    | +Y | +hh |
| down  | −Y | −hh |

---

## UV coordinate normalisation

CEM stores face UVs as pixel rectangles `[x1, y1, x2, y2]` where `y=0` is the **top** of the texture (Minecraft convention).

Three.js textures have `v=0` at the **bottom**.

```
normUV([x1, y1, x2, y2], tw, th) = [x1/tw, 1-y2/th, x2/tw, 1-y1/th]
```

Result `[u0, v0, u1, v1]` in Three.js UV space:
- `u0` = left edge, `u1` = right edge
- `v0` = bottom of UV region (was `y2` in pixel space)
- `v1` = top of UV region (was `y1` in pixel space)

---

## Side faces (N/S/E/W) — `flipV: true`

Because `root.scale.y = -1`, the vertex that is at local `−hh` (bottom of the box geometry) ends up at the **visual top** after the Y flip.

Without correction, the texture would appear upside-down on all four side faces.

**Fix:** `flipV: true` swaps `v0` and `v1` when assigning UVs to the quad vertices, so the UV top (`v1`) is applied to the local `−hh` vertices (visual top) and `v0` to `+hh` (visual bottom).

```
const [va, vb] = face.flipV ? [v1, v0] : [v0, v1]
uvs.push(u0, va,  u1, va,   // top two vertices  → top of UV
         u1, vb,  u0, vb)   // bottom two vertices → bottom of UV
```

---

## Horizontal faces (up/down) — geometry swap

`root.scale.y = -1` physically moves the `+hh` geometry to the **visual bottom** and `−hh` to the **visual top** — the opposite of CEM's naming.

If the geometry at `+hh` were naively labeled `'up'`, the `uvUp` texture would appear at the bottom of the model.

**Fix:** swap which geometry carries which UV name:

| Geometry | Local Y | Visual position after `scale.y=-1` | UV assigned |
|----------|---------|--------------------------------------|-------------|
| `+hh` verts | top | visual **bottom** | `'down'` (`flipV: false`) |
| `−hh` verts | bottom | visual **top** | `'up'` (`flipV: true`) |

The `−hh` geometry also needs `flipV: true` because its Z vertex order (south→north) maps the north edge to `v0` without the flip, which is incorrect.

---

## `invertAxis` — axis inversion per model

`invertAxis: "xy"` (or any combination of `x`, `y`, `z`) negates the **translate** and **rotate** components of that model group along the specified axes.

```
position.x = tx * (inv.includes('x') ? -1 : 1)
rotation.y = ry * DEG * (inv.includes('y') ? -1 : 1)
// etc.
```

This is also applied to the **box centre position** inside each model.

### The east/west UV swap problem

When `invertAxis` includes `'x'`, the box centre is negated in X.
The geometry itself is **not** mirrored — its `'east'` face still sits at `+hw` in local space.
After the position negation, that `+hw` face now points **inward** (toward the model origin), not outward.

Without correction, the visible outer face of the box (at `−hw`) shows `'west'` UV, which is typically a different (wrong) colour.

**Fix:** swap `uvFaces.east ↔ uvFaces.west` when **both** `inv.includes('x')` AND `mirrorU` are true.
Similarly swap `uvFaces.north ↔ uvFaces.south` when `inv.includes('z')` AND `mirrorU`.

```js
if (mirrorU && inv.includes('x')) {
  ;[uvFaces.east, uvFaces.west] = [uvFaces.west, uvFaces.east]
}
if (mirrorU && inv.includes('z')) {
  ;[uvFaces.north, uvFaces.south] = [uvFaces.south, uvFaces.north]
}
```

**Why the `mirrorU` guard?**
Blockbench pre-swaps the east/west UV atlas assignments *only* when `mirrorTexture: "u"` and `invertAxis: "x"` are combined — because the visual mirror in 3D corresponds to a left–right texture flip that Blockbench compensates for at export time. Without `mirrorTexture`, Blockbench assigns face UVs straight (no pre-swap), so no correction is needed here.

- Parts with `mirrorTexture: "u"` + `invertAxis: "x"` (e.g. car body panels) → swap applied → correct exterior colour ✓
- Parts with `invertAxis: "x"` but **no** `mirrorTexture` (e.g. wheel discs) → no swap → uvEast stays on the east face ✓

This runs **before** `mirrorU` so that U-flipping is applied to the already-swapped faces.

---

## `mirrorTexture: "u"` — U flip for symmetric models

When a model or its ancestor has `mirrorTexture: "u"`, the flag `mirrorU` is set and propagated to all descendant submodels.

All faces have their U coordinates flipped (`u0 ↔ u1`) so the texture mirrors horizontally. Used with `invertAxis: "x"` models to produce a correct mirrored copy of a texture that was only painted for one side.

```js
if (mirrorU) {
  for (const k of Object.keys(uvFaces)) {
    const [u0, v0, u1, v1] = uvFaces[k]
    uvFaces[k] = [u1, v0, u0, v1]
  }
}
```

`mirrorTexture` cascades: if an attachment entry in the JEM has `mirrorTexture: "u"`, it must propagate into any inlined JPM submodels (which carry the actual geometry). This is why `parentMirror` is passed through the `parseModel` recursion.

---

## `textureOffset` — standard Minecraft cube UV layout

When a box uses `textureOffset: [u, v]` instead of per-face UVs, the six faces are laid out in the standard Minecraft cross pattern:

```
      [ up  ]
[ W ][ S ][ E ][ N ]
      [ dn  ]
```

Pixel coordinates:

| Face  | x1           | y1    | x2               | y2      |
|-------|-------------|-------|-----------------|---------|
| up    | u+d          | v     | u+d+w            | v+d     |
| down  | u+d+w        | v     | u+2d+w           | v+d     |
| west  | u            | v+d   | u+d              | v+d+h   |
| south | u+d          | v+d   | u+d+w            | v+d+h   |
| east  | u+d+w        | v+d   | u+2d+w           | v+d+h   |
| north | u+2d+w       | v+d   | u+2d+2w          | v+d+h   |

Where `w=bw`, `h=bh`, `d=bd` (box dimensions).
All the same corrections (invertAxis swap, mirrorU, flipV) apply after this layout is computed.

---

## Summary — order of UV operations in `parseBox`

1. Build `uvFaces` from `textureOffset` (mcCubeUVs) or explicit `uvNorth/…` properties → normalise pixels to Three.js UV via `normUV`
2. **`invertAxis` swap:** if `inv` includes `'x'`, swap east↔west; if `'z'`, swap north↔south
3. **`mirrorU` flip:** if `mirrorTexture: "u"` is active, flip `u0↔u1` for every face
4. Pass `uvFaces` to `buildBoxGeo` which assigns UVs to quad vertices with per-face `flipV`
