import { useState, useEffect, useRef } from 'react'
import { s, XP_TITLE } from '../../styles'
import { selKey } from '../../utils/outlinerUtils'

function BoxRow({ box, bi, indent, bSel, modelPath, onSel, onDragStart, onDrop, boxSel, onRename, onDelete }) {
  const [dropOver, setDropOver] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')

  useEffect(() => {
    if (!ctxMenu) return
    function close() { setCtxMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close) }
  }, [ctxMenu])

  const displayName = box.name || `cube ${bi}`

  return (
    <div>
      <div draggable
        onDragStart={e => { e.stopPropagation(); onDragStart({ kind: 'box', modelPath, boxIdx: bi }) }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropOver(true) }}
        onDragLeave={() => setDropOver(false)}
        onDrop={e => { e.stopPropagation(); setDropOver(false); onDrop({ kind: 'box', modelPath, boxIdx: bi }) }}
        style={{
          ...s.treeRow, paddingLeft: 4 + indent + 18,
          background: bSel ? 'var(--clr-accent)' : dropOver ? 'rgba(100,160,255,0.18)' : 'transparent',
          color: bSel ? '#fff' : 'var(--clr-text)',
          outline: dropOver ? '1px dashed #4488ff' : 'none', cursor: 'grab'
        }}
        onClick={e => onSel(boxSel, e.shiftKey, e.ctrlKey || e.metaKey)}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onSel(boxSel, false, false); setCtxMenu({ x: e.clientX, y: e.clientY }) }}>
        <span style={{ color: bSel ? '#fff' : '#ffaa55' }}>□</span>
        {editing
          ? <input autoFocus value={editVal}
            style={{ background: 'var(--bg-panel)', color: 'var(--clr-text)', border: '1px solid var(--clr-accent)', borderRadius: 2, width: '80%', fontSize: 'inherit', padding: '0 2px' }}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => { if (editVal.trim() && onRename) onRename(modelPath, bi, editVal.trim()); setEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { if (editVal.trim() && onRename) onRename(modelPath, bi, editVal.trim()); setEditing(false) } else if (e.key === 'Escape') setEditing(false); e.stopPropagation() }}
            onClick={e => e.stopPropagation()} />
          : <span onDoubleClick={e => { e.stopPropagation(); setEditVal(box.name || ''); setEditing(true) }}>{displayName}</span>}
        {box.coordinates && <span style={{ color: 'rgba(160,160,160,0.5)', fontSize: '10px', marginLeft: 4 }}>
          {box.coordinates.slice(0, 3).map(v => Math.round(v)).join(',')}
        </span>}
      </div>
      {ctxMenu && <div
        style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
          background: 'var(--bg-panel)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, padding: '2px 0', boxShadow: '2px 4px 16px rgba(0,0,0,0.5)', minWidth: 160
        }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '5px 14px', cursor: 'pointer', fontSize: '12px' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--clr-accent)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          onClick={() => { setCtxMenu(null); setEditVal(box.name || ''); setEditing(true) }}>
          Rename
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
        <div style={{ padding: '5px 14px', cursor: 'pointer', fontSize: '12px', color: '#f77' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,80,80,0.15)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          onClick={() => { setCtxMenu(null); onDelete && onDelete(modelPath, bi) }}>
          Delete
        </div>
      </div>}
    </div>
  )
}

function OutlinerNode({ model, modelPath, sel, multiSel, onSel, onDragStart, onDrop, depth = 0, hiddenModels, onToggleVisible, onRename, onDelete, onRenameBox, onDeleteBox, openNodes, onToggleOpen, onOpenNode }) {
  const open = openNodes?.has(modelPath.join('_')) ?? false
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [ctxMenu, setCtxMenu] = useState(null)
  const [dropOver, setDropOver] = useState(false)

  useEffect(() => {
    if (!ctxMenu) return
    function close() { setCtxMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close) }
  }, [ctxMenu])
  const hoverTimer = useRef(null)
  const indent = depth * 14
  const thisKey = selKey({ kind: 'model', modelPath })
  const isSel = (multiSel || []).some(s => s.kind === 'model' && selKey(s) === thisKey)

  // Auto-open when any selection is inside this node
  useEffect(() => {
    const all = multiSel?.length ? multiSel : (sel ? [sel] : [])
    for (const s of all) {
      if (!s?.modelPath) continue
      const sp = s.modelPath
      const isAnc = sp.length > modelPath.length && modelPath.every((v, i) => sp[i] === v)
      const isParent = s.kind === 'box' && sp.length === modelPath.length && modelPath.every((v, i) => sp[i] === v)
      if (isAnc || isParent) { onOpenNode?.(modelPath); break }
    }
  }, [sel, multiSel]) // eslint-disable-line react-hooks/exhaustive-deps

  function onDragOverNode(e) {
    e.preventDefault(); e.stopPropagation(); setDropOver(true)
    if (!hoverTimer.current) hoverTimer.current = setTimeout(() => onOpenNode?.(modelPath), 600)
  }
  function onDragLeaveNode() {
    setDropOver(false)
    clearTimeout(hoverTimer.current); hoverTimer.current = null
  }

  const hasChildren = (model.boxes?.length || 0) + (model.submodels?.length || 0) > 0
  const isHidden = hiddenModels?.has(modelPath.join('_'))
  return (
    <div>
      <div draggable
        onDragStart={e => { e.stopPropagation(); onDragStart({ kind: 'model', modelPath }) }}
        onDragOver={onDragOverNode}
        onDragLeave={onDragLeaveNode}
        onDrop={e => { e.stopPropagation(); setDropOver(false); clearTimeout(hoverTimer.current); hoverTimer.current = null; onDrop({ kind: 'model', modelPath }) }}
        style={{
          ...s.treeRow, paddingLeft: 4 + indent,
          background: isSel ? 'var(--clr-accent)' : dropOver ? 'rgba(100,160,255,0.18)' : 'transparent',
          color: isSel ? '#fff' : 'var(--clr-text)',
          outline: dropOver ? '1px dashed #4488ff' : 'none', cursor: 'grab'
        }}
        onClick={e => onSel({ kind: 'model', modelPath }, e.shiftKey, e.ctrlKey || e.metaKey)}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onSel({ kind: 'model', modelPath }, false, false); setCtxMenu({ x: e.clientX, y: e.clientY }) }}>
        <span style={{ fontSize: '9px', width: '10px', color: isSel ? '#fff' : 'var(--clr-text-dim)', flexShrink: 0 }}
          onClick={e => { e.stopPropagation(); onToggleOpen?.(modelPath) }}>
          {hasChildren ? (open ? '▼' : '▶') : ' '}
        </span>
        <span style={{ color: isSel ? '#fff' : '#88aaff' }}>{(model.submodels?.length && !model.boxes?.length) ? '📁' : '⬡'}</span>
        <span style={{ flex: 1, opacity: isHidden ? 0.4 : 1 }}
          onDoubleClick={e => { e.stopPropagation(); setEditVal(model.id || model.part || ''); setEditing(true) }}>
          {editing
            ? <input autoFocus value={editVal}
              style={{ background: 'var(--bg-panel)', color: 'var(--clr-text)', border: '1px solid var(--clr-accent)', borderRadius: 2, width: '90%', fontSize: 'inherit', padding: '0 2px' }}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => { if (editVal.trim() && onRename) onRename(modelPath, editVal.trim()); setEditing(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { if (editVal.trim() && onRename) onRename(modelPath, editVal.trim()); setEditing(false) } else if (e.key === 'Escape') { setEditing(false) } e.stopPropagation() }}
              onClick={e => e.stopPropagation()} />
            : model.id || model.part || `bone ${modelPath[modelPath.length - 1]}`}
        </span>
        {onToggleVisible && <span title={isHidden ? 'Show' : 'Hide'}
          onClick={e => { e.stopPropagation(); onToggleVisible(modelPath) }}
          style={{ marginLeft: 'auto', fontSize: '11px', opacity: isHidden ? 0.35 : 0.7, cursor: 'pointer', paddingRight: '2px', flexShrink: 0 }}>
          {isHidden ? '○' : '●'}
        </span>}
      </div>
      {open && <>
        {(model.boxes || []).map((box, bi) => {
          const boxSel = { kind: 'box', modelPath, boxIdx: bi }
          const bSel = (multiSel || []).some(s => s.kind === 'box' && selKey(s) === selKey(boxSel))
          return (
            <BoxRow key={bi} box={box} bi={bi} indent={indent} bSel={bSel} modelPath={modelPath}
              onSel={onSel} onDragStart={onDragStart} onDrop={onDrop} boxSel={boxSel}
              onRename={onRenameBox} onDelete={onDeleteBox} />
          )
        })}
        {(model.submodels || []).map((sub, si) => (
          <OutlinerNode key={si} model={sub} modelPath={[...modelPath, si]} sel={sel} multiSel={multiSel} onSel={onSel}
            onDragStart={onDragStart} onDrop={onDrop} depth={depth + 1}
            hiddenModels={hiddenModels} onToggleVisible={onToggleVisible} onRename={onRename} onDelete={onDelete}
            onRenameBox={onRenameBox} onDeleteBox={onDeleteBox}
            openNodes={openNodes} onToggleOpen={onToggleOpen} onOpenNode={onOpenNode} />
        ))}
      </>}
      {ctxMenu && <div
        style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
          background: 'var(--bg-panel)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, padding: '2px 0', boxShadow: '2px 4px 16px rgba(0,0,0,0.5)', minWidth: 160
        }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '5px 14px', cursor: 'pointer', fontSize: '12px' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--clr-accent)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          onClick={() => { setCtxMenu(null); setEditVal(model.id || model.part || ''); setEditing(true) }}>
          Rename
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
        <div style={{ padding: '5px 14px', cursor: 'pointer', fontSize: '12px', color: '#f77' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,80,80,0.15)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          onClick={() => { setCtxMenu(null); onDelete && onDelete(modelPath) }}>
          Delete
        </div>
      </div>}
    </div>
  )
}

function RootDropZone({ onDrop }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.stopPropagation(); setOver(false); onDrop() }}
      style={{
        minHeight: 24, borderTop: '1px dashed rgba(255,255,255,0.08)', margin: '2px 4px', borderRadius: 2,
        background: over ? 'rgba(100,160,255,0.12)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '9px', color: over ? '#88aaff' : 'rgba(255,255,255,0.2)', fontFamily: 'Monocraft,sans-serif',
        transition: 'background 0.1s'
      }}>
      {over ? '↑ move to root' : ''}
    </div>
  )
}

export default function OutlinerPanel({ models, sel, multiSel, onSel, onDragStart, onDrop, onDropRoot, hiddenModels, onToggleVisible, onRename, onDelete, onRenameBox, onDeleteBox, openNodes, onToggleOpen, onOpenNode, onAddFolder }) {
  return (
    <div style={s.outliner}>
      <div style={{ ...XP_TITLE, display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>Outliner</span>
        <button title="Add Folder" onClick={onAddFolder}
          style={{ background: 'none', border: 'none', color: 'var(--clr-text)', cursor: 'pointer', fontSize: '13px', padding: '0 4px', lineHeight: 1 }}>📁+</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          {(models || []).map((model, mi) => (
            <OutlinerNode key={mi} model={model} modelPath={[mi]} sel={sel} multiSel={multiSel} onSel={onSel}
              onDragStart={onDragStart} onDrop={onDrop} depth={0} hiddenModels={hiddenModels}
              onToggleVisible={onToggleVisible} onRename={onRename} onDelete={onDelete}
              onRenameBox={onRenameBox} onDeleteBox={onDeleteBox}
              openNodes={openNodes} onToggleOpen={onToggleOpen} onOpenNode={onOpenNode} />
          ))}
        </div>
        <RootDropZone onDrop={onDropRoot} />
      </div>
    </div>
  )
}
