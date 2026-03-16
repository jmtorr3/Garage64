import { createContext, useContext, useEffect, useState } from 'react'

const Ctx = createContext({ isDark: false, toggle: () => {} })

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('g64-theme') === 'dark')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('g64-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <Ctx.Provider value={{ isDark, toggle: () => setIsDark(v => !v) }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
