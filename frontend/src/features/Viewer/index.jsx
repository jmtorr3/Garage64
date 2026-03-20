import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import CemViewer from '../../components/CemViewer'
import { useTheme } from '../../ThemeContext'

const s = {
  page: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', margin: '-1.5rem -2rem', overflow: 'hidden' },
  canvas: { flex: 1, position: 'relative', overflow: 'hidden' },
  overlay: { position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', pointerEvents: 'none', whiteSpace: 'nowrap' },
  title: { color: '#fff', fontFamily: 'Monocraft, sans-serif', fontSize: '28px', fontWeight: 'bold', fontStyle: 'italic', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 10px rgba(0,0,0,0.9)', letterSpacing: '-0.01em' },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'Monocraft, sans-serif' },
  btn: { pointerEvents: 'all', padding: '7px 22px', background: 'linear-gradient(180deg,#4590d6,#1060c4)', borderTop: '2px solid #6ab0f0', borderLeft: '2px solid #6ab0f0', borderRight: '2px solid #0a246a', borderBottom: '2px solid #0a246a', color: '#fff', fontFamily: 'Monocraft, sans-serif', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
}

export default function Viewer() {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const [jem, setJem] = useState(null)

  useEffect(() => {
    api.getVariants().then(vs => {
      const target = vs.find(v => v.file_name === 'oak_boat3') || vs[0]
      if (!target) return
      fetch(`${import.meta.env.BASE_URL}api/variants/${target.id}/compiled_jem/`)
        .then(r => r.json())
        .then(setJem)
        .catch(() => { })
    })
  }, [])

  const bg = isDark ? '#1e1e1e' : '#ece9d8'

  return (
    <div style={s.page}>
      <div style={s.canvas}>
        <CemViewer jem={jem} onError={() => { }} autoRotate showGrid={false} showAxes={false} enableZoom={false} bgColor={bg} />
        <div style={s.overlay}>
          <span style={s.title}>Garage64</span>
          <button style={s.btn} onClick={() => navigate('/gallery')}>Open Garage →</button>
          <span style={s.hint}>drag to orbit</span>
        </div>
      </div>
    </div>
  )
}
