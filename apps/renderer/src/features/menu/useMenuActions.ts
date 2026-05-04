import { useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useEffect } from 'react'
import type { WorkbenchSection } from '@/lib/workbench-layout'

export type MenuAction =
  | 'new-chat'
  | 'import-character'
  | 'export-chat'
  | 'refresh-workspace'
  | 'new-session'
  | 'duplicate-session'
  | 'branch-from-here'
  | 'switch-workspace'
  | 'open-library'
  | 'refresh-library'
  | 'show-characters'
  | 'show-lorebooks'
  | 'show-presets'
  | 'reload-settings'
  | 'test-connection'
  | 'switch-provider'
  | 'token-counter'
  | 'prompt-inspector'
  | 'open-logs'
  | 'go-workbench'
  | 'go-settings'
  | 'go-system'
  | 'about'
  | 'open-docs'
  | 'report-issue'

interface TauriMenuEventPayload {
  action: MenuAction
}

const MENU_SECTION_MAP: Partial<Record<MenuAction, WorkbenchSection>> = {
  'go-workbench': 'workbench',
  'go-settings': 'settings',
  'go-system': 'system',
  'open-library': 'library',
  'show-characters': 'characters',
  'show-lorebooks': 'lorebooks',
  'show-presets': 'presets',
  'open-logs': 'logs',
}

export interface UseMenuActionsOptions {
  onBranchCurrentChat?: () => void
  onFocusInspectorTab?: (tab: 'generation' | 'context' | 'character' | 'trace') => void
  onImportCharacter?: () => void
  onOpenLibraryDialog?: () => void
  onOpenSettingsConnections?: () => void
  onOpenExternalUrl?: (url: string) => void
  onSetSection: (section: WorkbenchSection) => void
  onDuplicateCurrentSession?: () => void
  onExportChat?: () => void
  onRefreshWorkspace: () => void
  onCreateChat: () => void
  onShowAbout?: () => void
  onTestConnection?: () => void
}

export function createMenuActionHandler({
  onBranchCurrentChat,
  onFocusInspectorTab,
  onImportCharacter,
  onOpenLibraryDialog,
  onOpenSettingsConnections,
  onOpenExternalUrl,
  onSetSection,
  onDuplicateCurrentSession,
  onExportChat,
  onRefreshWorkspace,
  onCreateChat,
  onShowAbout,
  onTestConnection,
}: UseMenuActionsOptions) {
  return (action: MenuAction) => {
    const sectionTarget = MENU_SECTION_MAP[action]
    if (sectionTarget) {
      if (action === 'open-library' && onOpenLibraryDialog) {
        onSetSection('workbench')
        onOpenLibraryDialog()
        return
      }
      onSetSection(sectionTarget)
      return
    }

    switch (action) {
      case 'refresh-workspace':
      case 'refresh-library':
      case 'reload-settings':
        onRefreshWorkspace()
        break
      case 'new-chat':
      case 'new-session':
        onCreateChat()
        break
      case 'import-character':
        onImportCharacter?.()
        break
      case 'export-chat':
        onExportChat?.()
        break
      case 'duplicate-session':
        onDuplicateCurrentSession?.()
        break
      case 'branch-from-here':
        onBranchCurrentChat?.()
        break
      case 'test-connection':
        onOpenSettingsConnections?.()
        onTestConnection?.()
        break
      case 'token-counter':
        onSetSection('workbench')
        onFocusInspectorTab?.('context')
        break
      case 'prompt-inspector':
        onSetSection('workbench')
        onFocusInspectorTab?.('generation')
        break
      case 'switch-provider':
      case 'switch-workspace':
        onOpenSettingsConnections?.()
        break
      case 'about':
        onShowAbout?.()
        break
      case 'open-docs':
        onOpenExternalUrl?.('https://github.com/GALIAIS/Yggdrasil')
        break
      case 'report-issue':
        onOpenExternalUrl?.('https://github.com/GALIAIS/Yggdrasil/issues')
        break
    }
  }
}

export function useMenuActions({
  onBranchCurrentChat,
  onFocusInspectorTab,
  onImportCharacter,
  onOpenLibraryDialog,
  onOpenSettingsConnections,
  onOpenExternalUrl,
  onSetSection,
  onDuplicateCurrentSession,
  onExportChat,
  onRefreshWorkspace,
  onCreateChat,
  onShowAbout,
  onTestConnection,
}: UseMenuActionsOptions) {
  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      createMenuActionHandler({
        onBranchCurrentChat,
        onFocusInspectorTab,
        onImportCharacter,
        onOpenLibraryDialog,
        onOpenSettingsConnections,
        onOpenExternalUrl,
        onSetSection,
        onDuplicateCurrentSession,
        onExportChat,
        onRefreshWorkspace,
        onCreateChat,
        onShowAbout,
        onTestConnection,
      })(action)
    },
    [
      onBranchCurrentChat,
      onCreateChat,
      onDuplicateCurrentSession,
      onExportChat,
      onFocusInspectorTab,
      onImportCharacter,
      onOpenExternalUrl,
      onOpenLibraryDialog,
      onOpenSettingsConnections,
      onRefreshWorkspace,
      onSetSection,
      onShowAbout,
      onTestConnection,
    ],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window) && !('__TAURI__' in window)) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | null = null

    void listen<TauriMenuEventPayload>('tauri-menu-action', (event) => {
      handleMenuAction(event.payload.action)
    }).then((cleanup) => {
      if (disposed) {
        void cleanup()
        return
      }
      unlisten = cleanup
    })

    return () => {
      disposed = true
      if (unlisten) {
        void unlisten()
      }
    }
  }, [handleMenuAction])

  return { handleMenuAction }
}
