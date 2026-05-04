import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

/* eslint-disable react-refresh/only-export-components */

export type ThemeName = 'tavern' | 'night' | 'contrast'

interface ThemeContextValue {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const THEME_STORAGE_KEY = 'st-theme'
const DEFAULT_THEME: ThemeName = 'tavern'

interface ThemeProviderProps {
  children: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME)
  const [mounted, setMounted] = useState(false)

  const applyTheme = useCallback((themeName: ThemeName) => {
    document.documentElement.setAttribute('data-theme', themeName)
  }, [])

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    const nextTheme =
      savedTheme && ['tavern', 'night', 'contrast'].includes(savedTheme)
        ? (savedTheme as ThemeName)
        : DEFAULT_THEME

    setThemeState(nextTheme)
    setMounted(true)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [applyTheme, theme])

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }

  // Prevent flash of unstyled content
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
