/**
 * UVEditor — pick a part OR body model, pick a box, edit face UVs on the canvas.
 *
 * Mode "part"  → edits a ModelPart (JPM)
 * Mode "body"  → edits a box inside an EntityBody's body_data (JEM)
 */

import { useEffect, useState } from 'react'
import { api } from '../api'
import UVCanvas from '../components/UVCanvas'

const s = {
  page:        { display: 'flex', gap: '1rem', height: 'calc(100vh - 48px)', overflow: 'hidden' },
  panel:       { width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', paddingTop: '0.75rem' },
  canvas:      { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', paddingTop: '0.75rem' },
  section:     { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '6px', overflow: 'hidden' },
  secHead:     { background: '#1e1e1e', borderBottom: '1px solid #2a2a2a', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 'bold', color: '#f90', textTransform: 'uppercase', letterSpacing: '0.05em' },
  secBody:     { padding: '6px 10px' },
  select:      { width: '100%', padding: '5px 8px', background: '#111', color: '#eee', border: '1px solid #444', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.82rem' },
  treeItem:    { padding: '3px 6px', cursor: 'pointer', borderRadius: '3px', fontSize: '0.82rem', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  faceRow:     { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '0.8rem' },
  dot:         { width: '10px', height: '10px', borderRadius: '2px', flexShrink: 0 },
  coordLabel:  { width: '18px', color: '#666', fontSize: '0.72rem', textAlign: 'right', flexShrink: 0 },
  numInput:    { width: '46px', padding: '2px 4px', background: '#111', color: '#eee', border: '1px solid #333', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.8rem' },
  btn:         { padding: '6px 16px', background: '#f90', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'monospace', marginTop: '4px' },
  btnSm:       { padding: '3px 8px', background: '#252525', color: '#888', border: '1px solid #333', borderRadius: '3px', cursor: 'pointer', fontSize: '0.72rem' },
  ok:          { color: '#6f6', fontSize: '0.82rem' },
  err:         { color: '#f66', fontSize: '0.82rem' },
  offsetRow:   { display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0', fontSize: '0.8rem' },
  offsetLabel: { color: '#888', width: '14px', textAlign: 'right', fontSize: '0.72rem' },
  tabBar:      { display: 'flex', gap: '2px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '3px' },
  tab:         { flex: 1, padding: '4px 0', textAlign: 'center', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', border: 'none', fontFamily: 'monospace' },
}

const FACE_COLORS = {
  north: '#ff4455', south: '#44dd66', east: '#4499ff',
  west: '#ffcc00', up: '#44ffdd', down: '#ff44cc',
}
const FACES = ['north', 'south', 'east', 'west', 'up', 'down']

// ── helpers ──────────────────────────────────────────────────────────────────

function collectBoxes(model, prefix = '') {
  const results = []
  const label = prefix || model.id || model.part || 'root'
  if (model.boxes) {
    model.boxes.forEach((box, i) => {
      results.push({ path: `${label}/box${i}`, box, parentModel: model, idx: i })
    })
  }
  if (model.submodels) {
    model.submodels.forEach((sub, i) => {
      results.push(...collectBoxes(sub, `${label}/sub${i}`))
    })
  }
  return results
}

function applyBoxPatch(model, segments, depth, newBox) {
  const seg = segments[depth]
  if (!seg) return
  const boxMatch = seg.match(/^box(\d+)$/)
  const subMatch = seg.match(/^sub(\d+)$/)
  if (boxMatch && depth === segments.length - 1) {
    model.boxes[Number(boxMatch[1])] = newBox
    return
  }
  if (subMatch) {
    applyBoxPatch(model.submodels[Number(subMatch[1])], segments, depth + 1, newBox)
  }
}

function setBoxInData(data, path, newBox) {
  const clone = JSON.parse(JSON.stringify(data))
  applyBoxPatch(clone, path.split('/'), 1, newBox)
  return clone
}

function setBoxInBodyData(bodyData, modelIdx, path, newBox) {
  const clone = JSON.parse(JSON.stringify(bodyData))
  applyBoxPatch(clone.models[modelIdx], path.split('/'), 1, newBox)
  return clone
}

// ── component ─────────────────────────────────────────────────────────────────

export default function UVEditor() {
  const [mode, setMode] = useState('part')  // 'part' | 'body'

  // Part mode
  const [parts,        setParts]        = useState([])
  const [partId,       setPartId]       = useState(null)
  const [partData,     setPartData]     = useState(null)
  const [origPartData, setOrigPartData] = useState(null)
  const [attachMeta,   setAttachMeta]   = useState(null)

  // Body mode
  const [bodies,        setBodies]        = useState([])
  const [bodyId,        setBodyId]        = useState(null)
  const [bodyObj,       setBodyObj]       = useState(null)   // full body object from API
  const [bodyData,      setBodyData]      = useState(null)   // live-edited body_data
  const [origBodyData,  setOrigBodyData]  = useState(null)
  const [bodyModelIdx,  setBodyModelIdx]  = useState(0)

  // Shared
  const [boxes,        setBoxes]        = useState([])
  const [boxIdx,       setBoxIdx]       = useState(0)
  const [selectedFace, setSelectedFace] = useState(null)
  const [img,          setImg]          = useState(null)
  const [textureSize,  setTextureSize]  = useState([64, 32])
  const [status,       setStatus]       = useState('')

  // Load lists on mount
  useEffect(() => {
    api.getParts().then(ps => { setParts(ps); if (ps.length) setPartId(ps[0].id) })
    api.getBodies().then(bs => { setBodies(bs); if (bs.length) setBodyId(bs[0].id) })
  }, [])

  // Load part
  useEffect(() => {
    if (!partId) return
    api.getPart(partId).then(p => {
      setPartData(p.part_data)
      setOrigPartData(p.part_data)
      setAttachMeta(p.attachment_meta)
      setStatus('')
      setSelectedFace(null)
    })
  }, [partId])

  // Load body
  useEffect(() => {
    if (!bodyId) return
    api.getBody(bodyId).then(b => {
      setBodyObj(b)
      setBodyData(b.body_data)
      setOrigBodyData(b.body_data)
      setBodyModelIdx(0)
      setStatus('')
      setSelectedFace(null)
    })
  }, [bodyId])

  // Reset on mode or body model switch
  useEffect(() => { setBoxIdx(0); setSelectedFace(null); setStatus('') }, [mode])
  useEffect(() => { setBoxIdx(0); setSelectedFace(null) }, [bodyModelIdx])

  // Active model node for box collection
  const activeModel = mode === 'part'
    ? partData
    : (bodyData?.models?.[bodyModelIdx] ?? null)

  useEffect(() => {
    if (!activeModel) { setBoxes([]); return }
    const list = collectBoxes(activeModel)
    setBoxes(list)
    setBoxIdx(i => Math.min(i, Math.max(0, list.length - 1)))
  }, [activeModel])

  // Texture loading
  useEffect(() => {
    let texPath, declaredSize
    if (mode === 'part') {
      if (!attachMeta) return
      texPath = attachMeta.textureFile || attachMeta.texture
      if (!texPath) return
    } else {
      if (!bodyData) return
      const m = bodyData.models?.[bodyModelIdx]
      texPath = m?.texture || bodyData.texture
      declaredSize = m?.textureSize || bodyData.textureSize
      if (!texPath) return
    }
    const norm = texPath.replace(/^minecraft:/, '')
    const image = new Image()
    image.onload = () => {
      setImg(image)
      setTextureSize(declaredSize || [image.naturalWidth, image.naturalHeight])
    }
    image.src = `/api/asset/?path=${encodeURIComponent(norm)}`
  }, [mode, attachMeta, bodyData, bodyModelIdx])

  const currentEntry = boxes[boxIdx] || null
  const currentBox   = currentEntry?.box || null

  // ── box change ─────────────────────────────────────────────────────────────

  function handleBoxChange(updatedBox) {
    if (!currentEntry) return
    if (mode === 'part') {
      if (!partData) return
      setPartData(setBoxInData(partData, currentEntry.path, updatedBox))
    } else {
      if (!bodyData) return
      setBodyData(setBoxInBodyData(bodyData, bodyModelIdx, currentEntry.path, updatedBox))
    }
  }

  // ── coord editing ──────────────────────────────────────────────────────────

  function getFaceCoords() {
    if (!currentBox || !selectedFace) return null
    if (currentBox.textureOffset) return null
    const key = 'uv' + selectedFace[0].toUpperCase() + selectedFace.slice(1)
    return currentBox[key] || null
  }

  function setFaceCoord(coordIdx, val) {
    if (!currentBox || !selectedFace || !currentEntry) return
    const key = 'uv' + selectedFace[0].toUpperCase() + selectedFace.slice(1)
    const cur = currentBox[key] || [0, 0, 0, 0]
    const next = [...cur]; next[coordIdx] = Number(val)
    handleBoxChange({ ...currentBox, [key]: next })
  }

  function setOffsetCoord(axis, val) {
    if (!currentBox) return
    const [u, v] = currentBox.textureOffset || [0, 0]
    handleBoxChange({ ...currentBox, textureOffset: axis === 0 ? [Number(val), v] : [u, Number(val)] })
  }

  // ── save / revert ──────────────────────────────────────────────────────────

  async function save() {
    setStatus('')
    try {
      if (mode === 'part') {
        const p = parts.find(x => x.id === partId)
        await api.updatePart(partId, {
          name: p.name, jpm_path: p.jpm_path, slot: p.slot || '',
          part_data: partData, attachment_meta: attachMeta,
        })
        setOrigPartData(partData)
      } else {
        await api.patchBody(bodyId, { body_data: bodyData })
        setOrigBodyData(bodyData)
      }
      setStatus('ok')
    } catch (e) {
      setStatus(e.message)
    }
  }

  function revert() {
    if (mode === 'part') setPartData(origPartData)
    else setBodyData(origBodyData)
    setStatus('')
  }

  const faceCoords = getFaceCoords()
  const bodyModels = bodyData?.models || []

  return (
    <div style={s.page}>

      {/* ── left panel ── */}
      <div style={s.panel}>

        {/* Mode toggle */}
        <div style={s.tabBar}>
          {['part', 'body'].map(m => (
            <button
              key={m}
              style={{
                ...s.tab,
                background: mode === m ? '#f90' : 'transparent',
                color: mode === m ? '#000' : '#666',
              }}
              onClick={() => setMode(m)}
            >
              {m === 'part' ? 'Part (JPM)' : 'Body (JEM)'}
            </button>
          ))}
        </div>

        {/* Source selector */}
        <div style={s.section}>
          <div style={s.secHead}>{mode === 'part' ? 'Part' : 'Body'}</div>
          <div style={s.secBody}>
            {mode === 'part' ? (
              <select
                style={s.select}
                value={partId ?? ''}
                onChange={e => setPartId(Number(e.target.value))}
              >
                {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <>
                <select
                  style={s.select}
                  value={bodyId ?? ''}
                  onChange={e => setBodyId(Number(e.target.value))}
                >
                  {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {bodyModels.length > 0 && (
                  <select
                    style={{ ...s.select, marginTop: '4px' }}
                    value={bodyModelIdx}
                    onChange={e => setBodyModelIdx(Number(e.target.value))}
                  >
                    {bodyModels.map((m, i) => (
                      <option key={i} value={i}>{m.id || m.part || `model ${i}`}</option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
        </div>

        {/* Box tree */}
        <div style={s.section}>
          <div style={s.secHead}>Boxes ({boxes.length})</div>
          <div style={{ ...s.secBody, maxHeight: '220px', overflowY: 'auto' }}>
            {boxes.length === 0
              ? <span style={{ color: '#444', fontSize: '0.8rem' }}>No boxes</span>
              : boxes.map((entry, i) => (
                  <div
                    key={entry.path}
                    style={{
                      ...s.treeItem,
                      background: i === boxIdx ? '#2a3a4a' : 'transparent',
                      color: i === boxIdx ? '#6cf' : '#888',
                    }}
                    onClick={() => { setBoxIdx(i); setSelectedFace(null) }}
                    title={entry.path}
                  >
                    {entry.path}
                  </div>
                ))
            }
          </div>
        </div>

        {/* Face list */}
        <div style={s.section}>
          <div style={s.secHead}>Faces</div>
          <div style={s.secBody}>
            {FACES.map(face => (
              <div
                key={face}
                style={{
                  ...s.faceRow,
                  cursor: 'pointer',
                  opacity: currentBox ? 1 : 0.3,
                  background: selectedFace === face ? '#1a2a3a' : 'transparent',
                  borderRadius: '3px',
                  padding: '3px 4px',
                }}
                onClick={() => currentBox && setSelectedFace(face)}
              >
                <div style={{ ...s.dot, background: FACE_COLORS[face] }} />
                <span style={{ color: selectedFace === face ? '#fff' : '#888', flex: 1, fontSize: '0.8rem' }}>
                  {face.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Coordinate editor */}
        {currentBox && (
          <div style={s.section}>
            <div style={s.secHead}>
              {currentBox.textureOffset ? 'Texture Offset' : `UV — ${selectedFace || 'select face'}`}
            </div>
            <div style={s.secBody}>
              {currentBox.textureOffset ? (
                <>
                  {[['U', 0], ['V', 1]].map(([lbl, axis]) => (
                    <div key={lbl} style={s.offsetRow}>
                      <span style={s.offsetLabel}>{lbl}</span>
                      <input
                        type="number"
                        style={s.numInput}
                        value={currentBox.textureOffset[axis]}
                        onChange={e => setOffsetCoord(axis, e.target.value)}
                      />
                    </div>
                  ))}
                  <div style={{ fontSize: '0.7rem', color: '#555', marginTop: '4px' }}>
                    Dragging any face moves the entire offset.
                  </div>
                </>
              ) : faceCoords ? (
                ['x1', 'y1', 'x2', 'y2'].map((lbl, ci) => (
                  <div key={lbl} style={s.offsetRow}>
                    <span style={s.offsetLabel}>{lbl}</span>
                    <input
                      type="number"
                      style={s.numInput}
                      value={faceCoords[ci]}
                      onChange={e => setFaceCoord(ci, e.target.value)}
                    />
                  </div>
                ))
              ) : (
                <span style={{ color: '#444', fontSize: '0.8rem' }}>Select a face to edit.</span>
              )}
            </div>
          </div>
        )}

        {/* Save / revert */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button style={s.btn} onClick={save}>Save</button>
          <button style={s.btnSm} onClick={revert}>Revert</button>
          {status === 'ok' && <span style={s.ok}>Saved!</span>}
          {status && status !== 'ok' && <span style={s.err}>{status}</span>}
        </div>

      </div>

      {/* ── right: canvas ── */}
      <div style={s.canvas}>
        {currentBox ? (
          <UVCanvas
            img={img}
            textureSize={textureSize}
            box={currentBox}
            selectedFace={selectedFace}
            onFaceSelect={setSelectedFace}
            onBoxChange={handleBoxChange}
          />
        ) : (
          <div style={{ color: '#444', fontSize: '0.9rem', paddingTop: '2rem' }}>
            Select a {mode === 'part' ? 'part' : 'body model'} and box to start editing.
          </div>
        )}
      </div>

    </div>
  )
}
