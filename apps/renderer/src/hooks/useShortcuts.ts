import { useEffect } from 'react'

export interface UseShortcutsOptions {
  onSend?: () => void
  onRegenerate?: () => void
  onCommandPalette?: () => void
  onSettings?: () => void
  onToggleLibrary?: () => void
  onStopGeneration?: () => void
}

/**
 * Custom hook for managing global keyboard shortcuts
 * Supports cross-platform (Mac vs Windows) modifier keys
 *
 * Shortcuts:
 * - Ctrl+Enter (Cmd+Enter on Mac): Send message
 * - Ctrl+Shift+R (Cmd+Shift+R on Mac): Regenerate response
 * - Ctrl+K or Ctrl+/ (Cmd+K or Cmd+/ on Mac): Open Command Palette
 * - Ctrl+, (Cmd+, on Mac): Open Settings
 * - Ctrl+B (Cmd+B on Mac): Toggle Library
 * - Escape: Stop generation
 */
export function useShortcuts(options: UseShortcutsOptions) {
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)

    const handleKeyDown = (event: KeyboardEvent) => {
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey

      // Ctrl+Enter or Cmd+Enter: Send
      if (
        ctrlKey &&
        event.key === 'Enter' &&
        options.onSend
      ) {
        event.preventDefault()
        options.onSend()
        return
      }

      // Ctrl+Shift+R or Cmd+Shift+R: Regenerate
      if (
        ctrlKey &&
        event.shiftKey &&
        event.key === 'R' &&
        options.onRegenerate
      ) {
        event.preventDefault()
        options.onRegenerate()
        return
      }

      // Ctrl+K or Cmd+K: Command Palette
      if (
        ctrlKey &&
        event.key === 'k' &&
        options.onCommandPalette
      ) {
        event.preventDefault()
        options.onCommandPalette()
        return
      }

      // Ctrl+/ or Cmd+/: Command Palette (alternative)
      if (
        ctrlKey &&
        event.key === '/' &&
        options.onCommandPalette
      ) {
        event.preventDefault()
        options.onCommandPalette()
        return
      }

      // Ctrl+, or Cmd+,: Settings
      if (
        ctrlKey &&
        event.key === ',' &&
        options.onSettings
      ) {
        event.preventDefault()
        options.onSettings()
        return
      }

      // Ctrl+B or Cmd+B: Toggle Library
      if (
        ctrlKey &&
        event.key === 'b' &&
        options.onToggleLibrary
      ) {
        event.preventDefault()
        options.onToggleLibrary()
        return
      }

      // Escape: Stop Generation
      if (event.key === 'Escape' && options.onStopGeneration) {
        event.preventDefault()
        options.onStopGeneration()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    options.onSend,
    options.onRegenerate,
    options.onCommandPalette,
    options.onSettings,
    options.onToggleLibrary,
    options.onStopGeneration,
  ])
}
