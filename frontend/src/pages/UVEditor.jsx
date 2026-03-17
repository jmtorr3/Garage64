/**
 * UVEditor — pick a part OR body model, pick a box, edit face UVs on the canvas.
 *
 * Mode "part"  → edits a ModelPart (JPM)
 * Mode "body"  → edits a box inside an EntityBody's body_data (JEM)
 */

import { useEffect, useState } from 'react'
import { api } from '../api'
import UVCanvas from '../components/UVCanvas'

const XP_INPUT = { padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--clr-text)', borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)', fontFamily: 'Monocraft, sans-serif', fontSize: '11px' }

const s = {
  page:        { display: 'flex', gap: '6px', height: 'calc(100vh - 48px)', overflow: 'hidden', background: 'var(--bg-window)', padding: '6px' },
  panel:       { width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' },
  canvas:      { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' },
  section:     { background: 'var(--bg-window)', overflow: 'hidden', borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)' },
  secHead:     { background: 'var(--bg-title)', color: 'var(--clr-text-on-title)', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--bdr-dk)' },
  secBody:     { padding: '6px 8px' },
  select:      { ...XP_INPUT, width: '100%', boxSizing: 'border-box' },
  treeItem:    { padding: '2px 4px', cursor: 'pointer', fontSize: '11px', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Monocraft, sans-serif' },
  faceRow:     { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0', fontSize: '11px' },
  dot:         { width: '10px', height: '10px', flexShrink: 0 },
  coordLabel:  { width: '18px', color: 'var(--clr-text-dim)', fontSize: '10px', textAlign: 'right', flexShrink: 0, fontFamily: 'Monocraft, sans-serif' },
  numInput:    { width: '46px', ...XP_INPUT },
  btn:         { padding: '4px 16px', background: 'var(--bg-btn-primary)', borderTop: '2px solid var(--bdr-btn-primary-lt)', borderLeft: '2px solid var(--bdr-btn-primary-lt)', borderRight: '2px solid var(--bdr-btn-primary-dk)', borderBottom: '2px solid var(--bdr-btn-primary-dk)', color: '#fff', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginTop: '4px' },
  btnSm:       { padding: '2px 8px', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', cursor: 'pointer', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  ok:          { color: 'var(--clr-ok)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  err:         { color: 'var(--clr-err)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  offsetRow:   { display: 'flex', gap: '6px', alignItems: 'center', padding: '3px 0', fontSize: '11px' },
  offsetLabel: { color: 'var(--clr-text-dim)', width: '14px', textAlign: 'right', fontSize: '10px', fontFamily: 'Monocraft, sans-serif' },
  tabBar:      { display: 'flex', gap: '2px', background: 'var(--bg-panel)', borderBottom: '2px solid var(--bdr-dk)', padding: '4px 4px 0' },
  tab:         { flex: 1, padding: '3px 0', textAlign: 'center', borderRadius: '3px 3px 0 0', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid var(--bdr-dk)', borderBottom: 'none', fontFamily: 'Monocraft, sans-serif', background: 'var(--bg-panel-alt)', color: 'var(--clr-text-dim)' },
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
                background: mode === m ? 'var(--clr-accent)' : 'var(--bg-panel-alt)',
                color: mode === m ? '#fff' : 'var(--clr-text-dim)',
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
              ? <span style={{ color: 'var(--clr-text-dim)', fontSize: '0.8rem' }}>No boxes</span>
              : boxes.map((entry, i) => (
                  <div
                    key={entry.path}
                    style={{
                      ...s.treeItem,
                      background: i === boxIdx ? 'var(--clr-accent)' : 'transparent',
                      color: i === boxIdx ? '#fff' : 'var(--clr-text-dim)',
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
                  background: selectedFace === face ? 'var(--clr-accent)' : 'transparent',
                  borderRadius: '2px',
                  padding: '2px 4px',
                }}
                onClick={() => currentBox && setSelectedFace(face)}
              >
                <div style={{ ...s.dot, background: FACE_COLORS[face] }} />
                <span style={{ color: selectedFace === face ? '#fff' : 'var(--clr-text-dim)', flex: 1, fontSize: '11px', fontFamily: 'Monocraft, sans-serif' }}>
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
                  <div style={{ fontSize: '0.7rem', color: 'var(--clr-text-dim)', marginTop: '4px' }}>
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
                <span style={{ color: 'var(--clr-text-dim)', fontSize: '0.8rem' }}>Select a face to edit.</span>
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
          <div style={{ color: 'var(--clr-text-dim)', fontSize: '0.9rem', paddingTop: '2rem' }}>
            Select a {mode === 'part' ? 'part' : 'body model'} and box to start editing.
          </div>
        )}
      </div>

    </div>
  )
}
