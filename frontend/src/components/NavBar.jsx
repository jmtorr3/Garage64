import { NavLink } from 'react-router-dom'
import { useTheme } from '../ThemeContext'
import MusicPlayer from './MusicPlayer'

const s = {
  nav: {
    background: 'linear-gradient(180deg, #4590d6 0%, #2070cc 30%, #1760c4 50%, #1060c4 51%, #0a55bb 75%, #0850b5 100%)',
    padding: '0 10px',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    height: '48px',
    borderBottom: '2px solid #0a246a',
    boxShadow: '0 2px 6px rgba(0,0,60,0.6)',
    flexShrink: 0,
  },
  brand: {
    fontWeight: 'bold',
    color: '#fff',
    fontSize: '22px',
    fontFamily: 'Monocraft, "Segoe UI", sans-serif',
    fontStyle: 'italic',
    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 4px rgba(0,0,0,0.6)',
    marginRight: '14px',
    letterSpacing: '-0.01em',
    userSelect: 'none',
    flexShrink: 0,
  },
  divider: {
    width: '1px',
    height: '22px',
    background: 'rgba(255,255,255,0.3)',
    margin: '0 6px',
    flexShrink: 0,
  },
  link: {
    color: 'rgba(255,255,255,0.88)',
    textDecoration: 'none',
    fontSize: '11px',
    fontFamily: 'Monocraft, sans-serif',
    padding: '4px 10px',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
    border: '1px solid transparent',
  },
  activeLink: {
    background: 'rgba(0,0,0,0.28)',
    color: '#fff',
    fontWeight: 'bold',
    border: '1px solid rgba(255,255,255,0.35)',
  },
  themeBtn: {
    marginLeft: 'auto',
    padding: '3px 10px',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: '3px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
    fontFamily: 'Monocraft, sans-serif',
    flexShrink: 0,
  },
}

export default function NavBar() {
  const { isDark, toggle } = useTheme()

  return (
    <nav style={s.nav}>
      <span style={s.brand}>Garage64</span>
      <div style={s.divider} />
      {[
        { to: '/viewer',   label: 'Home'       },
        { to: '/gallery',  label: 'Garage'     },
      ].map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({ ...s.link, ...(isActive ? s.activeLink : {}) })}
        >
          {label}
        </NavLink>
      ))}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 10px' }}>
        <MusicPlayer />
      </div>
      <button style={s.themeBtn} onClick={toggle} title={isDark ? 'Switch to XP theme' : 'Switch to dark mode'}>
        {isDark ? '☀ XP' : '◑ Dark'}
      </button>
    </nav>
  )
}
