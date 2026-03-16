import { NavLink } from 'react-router-dom'

const s = {
  nav: {
    background: '#1a1a1a',
    borderBottom: '1px solid #333',
    padding: '0 2rem',
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
    height: '48px',
  },
  brand: { fontWeight: 'bold', color: '#f90', fontSize: '1.1rem', textDecoration: 'none' },
  link: { color: '#aaa', textDecoration: 'none', fontSize: '0.9rem' },
  activeLink: { color: '#fff', fontWeight: 'bold' },
}

export default function NavBar() {
  return (
    <nav style={s.nav}>
      <span style={s.brand}>Garage64</span>
      {[
        { to: '/studio', label: 'Studio' },
        { to: '/variants', label: 'Variants' },
        { to: '/parts', label: 'Parts' },
        { to: '/viewer', label: 'Viewer' },
        { to: '/uv', label: 'UV Editor' },
        { to: '/texture', label: 'Texture' },
        { to: '/export', label: 'Export' },
      ].map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({ ...s.link, ...(isActive ? s.activeLink : {}) })}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
