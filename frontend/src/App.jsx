import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import Variants from './pages/Variants'
import Parts from './pages/Parts'
import Export from './pages/Export'
import Viewer from './pages/Viewer'
import Studio from './pages/Studio'
import UVEditor from './pages/UVEditor'
import TextureEditor from './pages/TextureEditor'

const s = {
  layout: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  main: { flex: 1, padding: '1.5rem 2rem' },
}

export default function App() {
  return (
    <div style={s.layout}>
      <NavBar />
      <main style={s.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/variants" replace />} />
          <Route path="/variants" element={<Variants />} />
          <Route path="/parts" element={<Parts />} />
          <Route path="/export" element={<Export />} />
          <Route path="/viewer" element={<Viewer />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/uv" element={<UVEditor />} />
          <Route path="/texture" element={<TextureEditor />} />
        </Routes>
      </main>
    </div>
  )
}
