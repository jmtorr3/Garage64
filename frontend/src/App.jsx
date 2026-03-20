import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import { ThemeProvider } from './ThemeContext'
import Gallery from './pages/Gallery'
import Parts from './features/Parts/index.jsx'
import PartsLibrary from './pages/PartsLibrary'
import Export from './features/Export/index.jsx'
import Studio from './features/Studio/index.jsx'
import Viewer from './features/Viewer/index.jsx'
import UVEditor from './features/TextureEditing/components/UVEditor.jsx'
import TextureEditor from './features/TextureEditing/index.jsx'
import Modeler from './features/Modeler/index.jsx'

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
            <Route path="/" element={<Navigate to="/viewer" replace />} />
            <Route path="/viewer" element={<Viewer />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/variants" element={<Navigate to="/gallery" replace />} />
            <Route path="/parts" element={<Parts />} />
            <Route path="/parts-library" element={<PartsLibrary />} />
            <Route path="/export" element={<Export />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/modeler" element={<Modeler />} />
            <Route path="/uv" element={<UVEditor />} />
            <Route path="/texture" element={<TextureEditor />} />
          </Routes>
        </main>
      </div>
    </ThemeProvider>
  )
}
