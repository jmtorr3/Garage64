import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import { ThemeProvider } from './ThemeContext'
import Gallery from './pages/Gallery'
import Parts from './pages/Parts'
import Export from './pages/Export'
import Studio from './pages/Studio'
import UVEditor from './pages/UVEditor'
import TextureEditor from './pages/TextureEditor'

const s = {
  layout: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-window)' },
  main: { flex: 1, padding: '1.5rem 2rem', background: 'var(--bg-window)' },
}

export default function App() {
  return (
    <ThemeProvider>
    <div style={s.layout}>
      <NavBar />
      <main style={s.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/gallery" replace />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/variants" element={<Navigate to="/gallery" replace />} />
          <Route path="/viewer" element={<Navigate to="/gallery" replace />} />
          <Route path="/parts" element={<Parts />} />
          <Route path="/export" element={<Export />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/uv" element={<UVEditor />} />
          <Route path="/texture" element={<TextureEditor />} />
        </Routes>
      </main>
    </div>
    </ThemeProvider>
  )
}
