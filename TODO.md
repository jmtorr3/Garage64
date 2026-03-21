TODO:
### Phase 1: Pure Logic & Math Extraction
- [x] Create `utils/` directory.
- [ ] Extract Three.js specific helpers (`buildSceneRoot`, `annotateGroup`, `disposeGroup`) to `utils/threeHelpers.js`.
- [ ] Extract CEM data tree mutators (`getNode`, `updateNode`, `extractModel`, `nestModel`) to `utils/cemData.js`.
- [ ] Extract UV math and packing logic (`textureOffsetRects`, `getFaceRects`, `autoPackUVs`) to `utils/uvMath.js`.
- [ ] Verify 3D viewport and UV canvas still function perfectly using the imported utilities.

### Phase 2: State Decoupling
- [ ] Create `context/ModelerContext.jsx`.
- [ ] Migrate all core `useRef` data stores (`dataRef`, `origRef`, `undoStackRef`, `redoStackRef`) into the Provider.
- [ ] Migrate core mutator functions (`pushUndo`, `patchModel`, `syncTCToData`) into the Provider.
- [ ] Wrap the main `Modeler` component in the `<ModelerProvider>`.

### Phase 3: UI Component Isolation
- [ ] Create `components/Outliner/` and extract `<OutlinerPanel>`, `<OutlinerNode>`, `<BoxRow>`, and `<RootDropZone>`.
- [ ] Create `components/Viewport/` and extract the Three.js canvas and `TransformControls` initialization into `<Viewport3D>`.
- [ ] Create `components/Properties/` and extract the right-hand panel, including `<Vec3Input>`.
- [ ] Extract the custom 2D canvas logic into `components/Properties/UVEditor.jsx`.
- [ ] Extract the top toolbar into `components/TopBar.jsx`.

### Phase 4: Final Cleanup
- [ ] Strip the original `Modeler.jsx` down to a pure layout orchestrator.
- [ ] Clean up unused imports and verify no unnecessary re-renders are being triggered by the new context.


### EntityBody

```
name           CharField(100, unique)  e.g. "miata_base"
jem_file_name  CharField(100)          e.g. "oak_boat" (no extension)
entity_type    CharField(50)           e.g. "boat"
body_data      JSONField               full JEM JSON (no jpm-referencing entries)
```
- saves entire jem to the backend here, may make it into a template, but there's a bug that only updates the database, but not the actual .jem saved in the folder

### ModelPart
```
name             CharField(100, unique)  e.g. "miata_duce_wheels"
jpm_path         CharField(300)          e.g. "minecraft:optifine/cem/miata/parts/miata_duce_wheels.jpm"
part_data        JSONField               raw JPM file content
slot             CharField(50, blank)    groups mutually-exclusive parts; blank = standalone toggle
attachment_meta  JSONField               wrapper object inserted into JEM models array (excludes "model" key)
```
- also here, might just save templates in database so no one can reset them, and have the updated part be saved in the folder, or actually I may just save all parts in the database and just paste them into the folder

- [ ] SO now thinking about, the only thing that would need to be fixed is the block editor since it's not saving the UVs in the right position when in studio vs garage. I'll have to save every model i make into the database and then will export when i hit the export pack button.

