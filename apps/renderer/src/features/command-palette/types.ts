/**
 * Type definitions and interfaces for Toast, Command Palette, and Keyboard Shortcuts
 */

// ============================================================================
// Toast Types (from sonner)
// ============================================================================

export interface ToastOptions {
  description?: string
  duration?: number
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  icon?: React.ReactNode
  closeButton?: boolean
  action?: {
    label: string
    onClick: () => void
  }
  id?: string
  important?: boolean
  unstyled?: boolean
}

export interface Toast {
  (message: string, options?: ToastOptions): string
  success: (message: string, options?: ToastOptions) => string
  error: (message: string, options?: ToastOptions) => string
  loading: (message: string, options?: ToastOptions) => string
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: Error) => string)
    },
    options?: ToastOptions
  ) => Promise<T>
  dismiss: (toastId?: string) => void
}

// ============================================================================
// Command Palette Types
// ============================================================================

export interface CommandPaletteCharacter {
  avatar: string
  name: string
}

export interface CommandPaletteNavigationItem {
  id: string
  label: string
  section: string
  icon: React.ComponentType<{ className?: string }>
}

export interface CommandPaletteActionItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  characters?: CommandPaletteCharacter[]
  onSelectCharacter?: (avatar: string) => void
  onNavigate?: (section: string) => void
}

// ============================================================================
// Keyboard Shortcuts Types
// ============================================================================

export interface UseShortcutsOptions {
  /**
   * Send message - Ctrl+Enter (Cmd+Enter on Mac)
   */
  onSend?: () => void

  /**
   * Regenerate response - Ctrl+Shift+R (Cmd+Shift+R on Mac)
   */
  onRegenerate?: () => void

  /**
   * Open command palette - Ctrl+K or Ctrl+/ (Cmd+K or Cmd+/ on Mac)
   */
  onCommandPalette?: () => void

  /**
   * Open settings - Ctrl+, (Cmd+, on Mac)
   */
  onSettings?: () => void

  /**
   * Toggle library - Ctrl+B (Cmd+B on Mac)
   */
  onToggleLibrary?: () => void

  /**
   * Stop generation - Escape
   */
  onStopGeneration?: () => void
}

export interface KeyboardShortcut {
  name: string
  description: string
  windows: string
  mac: string
  callback: (() => void) | undefined
}

// ============================================================================
// Combined Configuration Type
// ============================================================================

export interface AppUIConfig {
  toasts?: {
    enabled?: boolean
    position?: ToastOptions['position']
    duration?: number
  }
  commandPalette?: {
    enabled?: boolean
    hotkey?: string[]
  }
  shortcuts?: UseShortcutsOptions & {
    enabled?: boolean
  }
}

// ============================================================================
// Event Handler Types
// ============================================================================

export type KeyboardEventHandler = (event: KeyboardEvent) => void

export type ShortcutCallback = () => void
