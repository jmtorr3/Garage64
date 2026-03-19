# Garage64 Frontend Documentation

React + Vite SPA for editing OptiFine CEM model packs. Uses Three.js for 3D rendering.

---

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| React Router | v6 | Client-side routing |
| Three.js | 0.165 | 3D rendering / WebGL |
| Vite | 5 | Dev server + bundler |

---

## Routes

| Path | Page | Description |
|---|---|---|
| `/` | → `/viewer` | Redirect |
| `/viewer` | Viewer | Animated home page with auto-rotating 3D model |
| `/gallery` | Gallery | Main variant management hub |
| `/studio` | Studio | Unified editor (compose, UV, texture, modeler) |
| `/parts-library` | PartsLibrary | Browse and create parts by body |
| `/parts` | Parts | CRUD management for all model parts |
| `/export` | Export | One-click pack export |
| `/uv` | UVEditor | UV coordinate editor |
| `/texture` | TextureEditor | Pixel-level PNG painter |
| `/modeler` | Modeler | 3D block geometry editor (standalone) |

---

## Pages

### Viewer (`/viewer`)
Splash page. Loads the last saved variant (or `oak_boat3` by default) and displays it with `autoRotate`. Shows a "Open Garage" button to navigate to Gallery.

### Gallery (`/gallery`)
Main variant browser. Left sidebar lists all variants; clicking one shows the compiled 3D model in the center viewer. Supports create, edit, and delete variants. Variant form fields: `file_name`, `trigger_name`, `body`, `order`, `part_ids`.

**URL params:**
- `?new=1` — opens with no parts pre-selected

### Studio (`/studio`)
Complex multi-panel editor. Four areas:
- **Left sidebar** — Compose view: body selector (dropdown + create new), slot sections (each with mini viewer, part navigator, Edit button, Create New Part), Extras list
- **Center** — `CemViewer` 3D viewport; switches between full-car JEM and selected part/body
- **Right panel (Texture tab)** — UV editor, save/variant controls, texture path display
- **Right panel (Block Editor tab)** — Embedded `Modeler` component

**Modes:**
- Normal compose mode — browse and assemble variants
- Part edit mode — editing an existing part (`composeSelItem.kind === 'part'`)
- Create new part mode (`createPartMode`) — blank canvas, body/category selectors, new texture init

**URL params:**
- `?variantId=N` — load specific variant
- `?bodyId=N` — pre-select body
- `?newPart=1` — enter create-new-part mode
- `?new=1` — new variant with no parts pre-selected
- `?presetPartId=N` — pre-select a part as template

### Modeler (`/modeler`)
Blockbench-style 3D geometry editor. Can be used standalone or embedded inside Studio via `embedded` prop and `sharedViewerRef`.

**Features:**
- Outliner panel — hierarchical bone/model tree with drag, rename (double-click), right-click context menu (Rename / Delete)
- 3D viewport with TransformControls (translate / rotate / pivot gizmos)
- Properties panel — coordinates, pivot, inflation, UV offset
- Undo / redo history
- Add cube, delete selection
- Auto-creates root bone when adding first cube on blank canvas
- Saves to `part_data` (JPM) or `body_data` (JEM)

**Props (when embedded):**
| Prop | Type | Description |
|---|---|---|
| `partId` | number | Load this part for editing |
| `bodyId` | number | Load this body for context |
| `newPart` | boolean | Blank canvas / new part mode |
| `embedded` | boolean | Embedded inside Studio (uses sharedViewerRef) |
| `sharedViewerRef` | ref | Ref to the Studio's CemViewer for shared scene |
| `onBack` | function | Called when back button clicked |
| `onBarUpdate` | function | Called with toolbar state updates |
| `texturePatch` | object | Live texture updates from painter |
| `showGridProp` | boolean | Grid visibility |

### PartsLibrary (`/parts-library`)
Browses all parts grouped by body name. Shows a mini 3D viewer per part. "Create Part" button per body opens a type picker (Wheels / Headlights / Custom) and navigates to Studio with the preset loaded.

### Parts (`/parts`)
Full CRUD for `ModelPart` records. Shows cards grouped by body name. Each card has name, `jpm_path`, slot, `part_data` JSON, and `attachment_meta` JSON fields. Includes a mini `CemViewer` per part.

### Export (`/export`)
Single button calls `POST /api/variants/export/`. Shows `ok`, `partial` (with error list), or error state.

### UVEditor (`/uv`)
UV coordinate editor. Displays a texture with colored overlays per face. Faces are draggable to reposition UVs. Supports both `textureOffset` (Minecraft standard) and explicit per-face UV modes.

### TextureEditor (`/texture`)
Pixel-level PNG painter with pencil, fill (flood), and eyedropper tools. Supports zoom (2×–32×), color history, alpha control, hex input, and the Lospec500 palette. Saves directly to the backend as PNG.

---

## Components

### `CemViewer` (forwardRef)
Three.js WebGL viewer for JEM/CEM models. Handles texture loading, OrbitControls, paint raycasting, and resize.

**Key props:**
| Prop | Type | Description |
|---|---|---|
| `jem` | object | JEM JSON to render |
| `autoRotate` | boolean | Spin the model |
| `showGrid` | boolean | Floor grid |
| `showAxes` | boolean | XYZ axis arrows |
| `enableZoom` | boolean | Scroll to zoom |
| `enablePaint` | boolean | 3D texture painting mode |
| `onPaintUV` | function | Callback with UV hit on paint |
| `texturePatch` | object | `{ path, imageData }` live texture update |
| `fitScale` | number | Camera distance scale factor |
| `bgColor` | string | Background hex color |
| `initialCamera` | array | `[camX,camY,camZ, tgtX,tgtY,tgtZ]` |
| `sidebarOffset` | number | Horizontal camera offset |

**Exposed via ref:**
- `getCtx()` — canvas 2D context
- `getTexMap()` — loaded texture map
- `setClickHandler(fn)` — register paint click handler
- `triggerRebuild()` — force scene rebuild

### `ModelerToolbox`
Draggable floating toolbar for the Modeler. Buttons: Move / Rotate / Pivot, Undo / Redo, Add Cube, Delete, Grid toggle.

### `TexToolbox`
Draggable floating toolbar for the TextureEditor. Tools: Pencil / Fill / Eyedropper / Drag. Color picker, hex input, alpha slider, color history, Lospec500 palette toggle.

### `UVCanvas`
Canvas component that renders a texture with colored face overlays. Faces are clickable and draggable to edit UV coordinates.

### `NavBar`
Top navigation bar. Contains brand name, nav links (Home / Garage), embedded `MusicPlayer`, and theme toggle.

### `MusicPlayer`
Embedded music player in the NavBar. Streams audio from `/api/music/stream/`. Supports play/pause, next/prev, seek, volume, directory selection. Persists settings to `localStorage`.

---

## API Layer (`src/api.js`)

All requests go to `/api` (proxied to Django in dev, handled by nginx in Docker).

```js
// Variants
api.getVariants()
api.getVariant(id)
api.createVariant(data)
api.updateVariant(id, data)
api.patchVariant(id, data)
api.deleteVariant(id)
api.exportPack()

// Parts
api.getParts()
api.getPart(id)
api.createPart(data)
api.updatePart(id, data)
api.patchPart(id, data)            // e.g. { slot: 'wheels' }
api.deletePart(id)

// Bodies
api.getBodies()
api.getBody(id)
api.createBody(data)
api.updateBody(id, data)
api.patchBody(id, data)

// Slots
api.getSlots()
api.createSlot(data)
api.updateSlot(id, data)
api.deleteSlot(id)

// Assets
api.saveTexture(path, blob)        // PUT raw PNG to pack asset path
api.saveVariantTexture(carSlug, variantId, fileName, blob)
                                   // saves PNG + patches variant.texture_override
```

---

## Utilities

### `src/cem.js`
Converts OptiFine JEM/JPM JSON into a Three.js scene graph.

**Key functions:**
| Function | Description |
|---|---|
| `jemToScene(jem, textureMap)` | Build `THREE.Group` from JEM object |
| `collectTexturePaths(jem)` | Extract all texture path references |
| `normTexPath(raw)` | Strip `minecraft:` prefix, normalize slashes |
| `parseBox(box, mat, tw, th, ...)` | Convert one box to `THREE.Mesh` |
| `mcCubeUVs(u, v, w, h, d, tw, th)` | Compute Minecraft standard cube UV layout |

Supports: `invertAxis`, `mirrorTexture`, per-face explicit UVs, `inflate`, recursive `submodels`.

### `src/ThemeContext.jsx`
`useTheme()` hook — exposes `{ isDark, toggle }`. Persists to `localStorage['g64-theme']`. Applies `dark` class to `document.documentElement`.

---

## Data Structures

**JEM / JPM JSON:**
```json
{
  "texture": "optifine/cem/miata/miata_base.png",
  "textureSize": [64, 32],
  "models": [
    {
      "id": "root",
      "translate": [0, 0, 0],
      "rotate": [0, 0, 0],
      "invertAxis": "xy",
      "mirrorTexture": "u",
      "boxes": [
        {
          "coordinates": [x, y, z, w, h, d],
          "textureOffset": [u, v],
          "inflate": 0
        }
      ],
      "submodels": []
    }
  ]
}
```

**Part object (from API):**
```json
{
  "id": 1,
  "name": "miata_duce_wheels",
  "jpm_path": "minecraft:optifine/cem/miata/parts/miata_duce_wheels.jpm",
  "slot": "wheels",
  "part_data": { },
  "attachment_meta": { }
}
```

---

## Styling

All styles are inline React objects using CSS variables set on `:root`:

| Variable | Description |
|---|---|
| `--bg-window` | Page/window background |
| `--bg-panel` | Sidebar/panel background |
| `--bg-btn` | Button background |
| `--clr-text` | Primary text |
| `--clr-accent` | Accent color (teal) |
| `--bdr-dk` / `--bdr-lt` | Dark/light border |

Font: **Monocraft** (pixel art monospace) throughout.
Two themes: **XP** (light, Windows XP-inspired) and **Dark**.

---

## Environment

| Variable | Description |
|---|---|
| `VITE_BASE_URL` | Base URL path (default `/`, Docker uses `/garage64/`) |

Set at build time in the Dockerfile:
```dockerfile
RUN VITE_BASE_URL=/garage64/ npm run build
```
