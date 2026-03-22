export default function UVEditor({ uvCanvasRef, uvCursor, uvBufRef, onMouseDown, onMouseMove, onMouseUp, onMouseLeave }) {
  return (
    <div style={{ flexShrink: 0, borderBottom: '2px solid var(--bdr-dk)', background: '#111', lineHeight: 0, position: 'relative', overflow: 'auto', maxHeight: 220 }}>
      <canvas ref={uvCanvasRef}
        style={{ display: 'block', imageRendering: 'pixelated', cursor: uvCursor }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />
      {!uvBufRef.current && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.2)', fontSize: '10px', fontFamily: 'Monocraft,sans-serif', pointerEvents: 'none'
        }}>
          no texture
        </div>
      )}
    </div>
  )
}
