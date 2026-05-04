import { useEffect, useRef } from 'react'
import { checkForAppUpdate, isTauriDesktop } from '@yggdrasil/api-client'
import { toast } from 'sonner'
import { useMenuActions } from '@/features/menu/useMenuActions'
import { WorkbenchShell } from '@/features/workspace/WorkbenchShell'
import { preloadWorkbenchSection } from '@/features/workspace/workbenchSectionPreload'
import { useWorkbenchState } from '@/features/workspace/useWorkbenchState'
import { openExternalUrl } from '@/lib/open-external'

function App() {
  const state = useWorkbenchState()
  const importCharacterInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isTauriDesktop()) {
      return
    }

    let cancelled = false
    void checkForAppUpdate()
      .then((update) => {
        if (!update || cancelled) {
          return
        }
        toast.info(`发现新版本 ${update.version}`)
        void update.close().catch(() => undefined)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  const navigateToSection = async (section: Parameters<typeof state.setSection>[0]) => {
    await preloadWorkbenchSection(section)
    state.setSection(section)
  }

  const navigateToSectionWith = async (
    section: Parameters<typeof state.openSectionWith>[0],
    params?: Parameters<typeof state.openSectionWith>[1],
  ) => {
    await preloadWorkbenchSection(section)
    state.openSectionWith(section, params)
  }

  useMenuActions({
    onBranchCurrentChat: () => void state.handleBranchCurrentChat(),
    onFocusInspectorTab: (tab) => {
      state.setSection('workbench')
      state.setInspectorTab(tab)
    },
    onImportCharacter: () => importCharacterInputRef.current?.click(),
    onDuplicateCurrentSession: () => {
      if (state.selectedChatId) {
        void state.handleDuplicateChat(state.selectedChatId)
      }
    },
    onExportChat: () => void state.handleExportCurrentChat(),
    onOpenExternalUrl: openExternalUrl,
    onOpenSettingsConnections: () => {
      void navigateToSectionWith('settings', { tab: 'engines' })
    },
    onOpenLibraryDialog: () => {
      state.setSection('workbench')
      state.setLibraryDialogOpen(true)
    },
    onSetSection: (section) => void navigateToSection(section),
    onRefreshWorkspace: () => void state.workspaceQuery.refetch(),
    onCreateChat: () => void state.handleCreateChatClick(),
    onShowAbout: () => void navigateToSection('system'),
    onTestConnection: () => {
      void navigateToSectionWith('settings', { tab: 'engines' })
      state.setSettingsPanelAction({ kind: 'test-connection', nonce: Date.now() })
    },
  })

  return (
    <>
      <input
        accept=".json,.png"
        className="hidden"
        multiple
        onChange={(event) => {
          const files = event.target.files
          if (files && files.length > 0) {
            void state.handleImportCharacterFiles(files)
          }
          event.target.value = ''
        }}
        ref={importCharacterInputRef}
        type="file"
      />
      <WorkbenchShell state={state} />
    </>
  )
}

export default App
