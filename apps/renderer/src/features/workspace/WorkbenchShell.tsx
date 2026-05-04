import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  BookOpenIcon,
  ChevronDownIcon,
  HeartIcon,
  MoreHorizontalIcon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'

import {
  FaAssetsIcon,
  FaAboutIcon,
  FaBackupsIcon,
  FaCharactersIcon,
  FaExtensionsIcon,
  FaGroupsIcon,
  FaLibraryIcon,
  FaLogsIcon,
  FaLorebooksIcon,
  FaPresetsIcon,
  FaProjectsIcon,
  FaProvidersIcon,
  FaRecentlyUsedIcon,
  FaSessionsIcon,
  FaSettingsIcon,
  FaStoryIcon,
  FaTavernIcon,
  FaTemplatesIcon,
} from '@/components/icons/font-awesome'
import { YggdrasilLogo } from '@/components/icons/yggdrasil-logo'
import { WorkspaceAvatar } from '@/components/workspace/WorkspaceAvatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useClearTraceEntriesMutation, useTraceEntriesQuery } from '@/features/chat/hooks'
import { CommandPalette } from '@/features/command-palette/CommandPalette'
import { ControlBar } from '@/features/control-bar/ControlBar'
import { createMenuActionHandler } from '@/features/menu/useMenuActions'
import {
  useClearMemoryHitsMutation,
  useDeleteNarrativeMemoryCandidateMutation,
  useDeleteNarrativeMemoryMutation,
  useDeleteSessionSummaryMutation,
  useMemoryHitsQuery,
  useNarrativeMemoryCandidatesQuery,
  useNarrativeMemoriesQuery,
  useRetrievalHitsQuery,
  useRetrievalJobsQuery,
  useSessionSummariesQuery,
  useReviewNarrativeMemoryCandidateMutation,
} from '@/features/workspace/hooks'
import { preloadWorkbenchSection } from '@/features/workspace/workbenchSectionPreload'
import { useShortcuts } from '@/hooks/useShortcuts'
import { getCharacterName } from '@/lib/character'
import { toErrorMessage } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'
import { buildCharacterSummary } from '@/lib/workspace-runtime'
import type { WorkbenchSection } from '@/lib/workbench-layout'
import { toast } from 'sonner'
import { useStoredState } from '@/hooks/useStoredState'
import type { DraftAssistMode, useWorkbenchState } from './useWorkbenchState'

type WorkbenchState = ReturnType<typeof useWorkbenchState>

const appSectionLayoutModulePromise = import('@/features/workspace/AppSectionLayout')
const generationTabModulePromise = import('@/features/inspector/GenerationTab')
const contextTabModulePromise = import('@/features/inspector/ContextTab')
const characterTabModulePromise = import('@/features/inspector/CharacterTab')
const traceTabModulePromise = import('@/features/inspector/TraceTab')

const AppSectionMainPanel = lazy(() =>
  appSectionLayoutModulePromise.then((module) => ({ default: module.AppSectionMainPanel })),
)
const AppSectionResourcePanel = lazy(() =>
  appSectionLayoutModulePromise.then((module) => ({ default: module.AppSectionResourcePanel })),
)
const GenerationTab = lazy(() =>
  generationTabModulePromise.then((module) => ({ default: module.GenerationTab })),
)
const ContextTab = lazy(() =>
  contextTabModulePromise.then((module) => ({ default: module.ContextTab })),
)
const CharacterTab = lazy(() =>
  characterTabModulePromise.then((module) => ({ default: module.CharacterTab })),
)
const TraceTab = lazy(() =>
  traceTabModulePromise.then((module) => ({ default: module.TraceTab })),
)

export interface WorkbenchShellProps {
  state: WorkbenchState
}

export function WorkbenchShell({ state }: WorkbenchShellProps) {
  const { t } = useI18n()
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [sessionNameValue, setSessionNameValue] = useState('')
  const [pendingNarrativeMemoryCandidateBatchAction, setPendingNarrativeMemoryCandidateBatchAction] = useState<'approve' | null>(null)
  const [navGroupCollapsed, setNavGroupCollapsed] = useStoredState<Record<string, boolean>>(
    'st.workbench.navGroupsCollapsed',
    {
      content: false,
      extensions: false,
      library: false,
      maintenance: false,
      sessions: false,
      tavern: false,
    },
  )
  const importCharacterInputRef = useRef<HTMLInputElement | null>(null)
  const clearTraceMutation = useClearTraceEntriesMutation()
  const clearMemoryHitsMutation = useClearMemoryHitsMutation()
  const deleteNarrativeMemoryMutation = useDeleteNarrativeMemoryMutation()
  const deleteNarrativeMemoryCandidateMutation = useDeleteNarrativeMemoryCandidateMutation()
  const {
    section,
    setSection,
    openSectionWith,
    sectionParams,
    inspectorTab,
    setInspectorTab,
    libraryDialogOpen,
    setLibraryDialogOpen,
    settings,
    settingsTab,
    settingsPanelAction,
    setSettingsPanelAction,
    catalog,
    sortedCharacters,
    selectedCharacterAvatar,
    selectedCharacter,
    characterChats,
    selectedChatId,
    selectedChat,
    transcriptMessages,
    sessionNameDialog,
    chatMessages,
    chatMetadata,
    loading,
    chatsLoading,
    chatLoading,
    chatsError,
    chatError,
    saveError,
    saveErrorTitle,
    actionPending,
    draftMessage,
    draftAssistMode,
    draftAuthorName,
    currentUserLabel,
    workspaceError,
    libraryCollapsed,
    activeWorldDocuments,
    lastGenerationContext,
    structuredInsight,
    structuredInsightPending,
    structuredInsightApplying,
    autoApplyWorldState,
    auth,
    handleCreateChatClick,
    handleHighlightCharacter,
    handleSaveCurrentChatClick,
    handleDraftSubmit,
    handleAssistDraft,
    handleSelectCharacter,
    handleSelectChat,
    handleDeleteChat,
    handleDeleteSession,
    handleDeleteMessage,
    handleDuplicateChat,
    handleDuplicateSession,
    handleBranchMessage,
    handleContinueMessage,
    handleEditMessage,
    handleExportSession,
    handleGenerateStructuredInsight,
    handleApplyStructuredInsight,
    handleClearStructuredInsight,
    setAutoApplyWorldState,
    setDraftAssistMode,
    handleProviderChange,
    handleModelChange,
    handleRefreshGenerationContextSnapshot,
    handleRefreshSessionSummary,
    handleRenameChat,
    handleRenameSession,
    handleRegenerateMessage,
    handleRestoreSession,
    handleSessionNameDialogConfirm,
    handleSettingChange,
    setDraftMessage,
    setLibraryCollapsed,
    setSaveState,
    setSessionNameDialog,
    workspaceQuery,
  } = state

  useEffect(() => {
    void appSectionLayoutModulePromise
    void generationTabModulePromise
    void contextTabModulePromise
    void characterTabModulePromise
    void traceTabModulePromise
  }, [])

  useEffect(() => {
    if (sessionNameDialog) {
      setSessionNameValue(sessionNameDialog.initialValue)
      return
    }
    setSessionNameValue('')
  }, [sessionNameDialog])

  useEffect(() => {
    if (section !== 'workbench' && libraryDialogOpen) {
      setLibraryDialogOpen(false)
    }
  }, [libraryDialogOpen, section, setLibraryDialogOpen])

  const navigateToSection = useCallback(
    (nextSection: WorkbenchSection) => {
      setLibraryDialogOpen(false)
      setSection(nextSection)
      void preloadWorkbenchSection(nextSection).catch(() => undefined)
    },
    [setLibraryDialogOpen, setSection],
  )

  const navigateToSectionWith = useCallback(
    (nextSection: WorkbenchSection, params?: Record<string, string>) => {
      setLibraryDialogOpen(false)
      openSectionWith(nextSection, params)
      void preloadWorkbenchSection(nextSection).catch(() => undefined)
    },
    [openSectionWith, setLibraryDialogOpen],
  )

  const toggleNavGroup = useCallback((group: keyof typeof navGroupCollapsed) => {
    setNavGroupCollapsed((current) => ({
      ...current,
      [group]: !current[group],
    }))
  }, [setNavGroupCollapsed])

  useShortcuts({
    onCommandPalette: () => setCommandPaletteOpen(true),
    onSettings: () => void navigateToSection('settings'),
    onToggleLibrary: () => setLibraryCollapsed((current) => !current),
  })

  const selectedCharacterName = selectedCharacter ? getCharacterName(selectedCharacter) : t('characterTab.noCharacterSelected')
  const versionLabel = auth?.backend?.pkgVersion ?? settings?.settings?.currentVersion ?? t('common.unavailable')
  const heroBadges = [
    settings?.settings?.sysprompt?.name,
    settings?.settings?.context?.preset,
    settings?.settings?.reasoning?.name,
    settings?.settings?.main_api,
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  const heroSummary = buildCharacterSummary(selectedCharacter) || t('common.unconfigured')
  const traceQuery = useTraceEntriesQuery({
    avatarUrl: selectedCharacterAvatar || undefined,
    fileName: selectedChatId || undefined,
    limit: 40,
  })
  const traceEntries = useMemo(() => traceQuery.data ?? [], [traceQuery.data])
  const narrativeMemoryCandidatesQuery = useNarrativeMemoryCandidatesQuery(
    selectedCharacterAvatar || undefined,
    selectedChatId || undefined,
    section === 'workbench',
  )
  const narrativeMemoriesQuery = useNarrativeMemoriesQuery(
    selectedCharacterAvatar || undefined,
    selectedChatId || undefined,
    section === 'workbench',
  )
  const memoryHitsQuery = useMemoryHitsQuery(
    selectedCharacterAvatar || undefined,
    selectedChatId || undefined,
    lastGenerationContext?.query,
    section === 'workbench',
  )
  const retrievalJobsQuery = useRetrievalJobsQuery(selectedChatId || undefined, section === 'workbench')
  const retrievalHitsQuery = useRetrievalHitsQuery(lastGenerationContext?.query, section === 'workbench')
  const sessionSummariesQuery = useSessionSummariesQuery(
    selectedCharacterAvatar || undefined,
    selectedChatId || undefined,
    section === 'workbench',
  )
  const deleteSessionSummaryMutation = useDeleteSessionSummaryMutation()
  const reviewNarrativeMemoryCandidateMutation = useReviewNarrativeMemoryCandidateMutation()
  const narrativeMemoryCandidates = useMemo(
    () => narrativeMemoryCandidatesQuery.data ?? [],
    [narrativeMemoryCandidatesQuery.data],
  )
  const storedNarrativeMemories = useMemo(
    () => narrativeMemoriesQuery.data ?? [],
    [narrativeMemoriesQuery.data],
  )
  const narrativeMemoryHits = useMemo(() => memoryHitsQuery.data ?? [], [memoryHitsQuery.data])
  const retrievalJobs = useMemo(() => retrievalJobsQuery.data ?? [], [retrievalJobsQuery.data])
  const retrievalActivityHits = useMemo(() => retrievalHitsQuery.data ?? [], [retrievalHitsQuery.data])
  const sessionSummaries = useMemo(() => sessionSummariesQuery.data ?? [], [sessionSummariesQuery.data])
  const handleCommandPaletteAction = useMemo(
    () =>
      createMenuActionHandler({
        onBranchCurrentChat: () => void state.handleBranchCurrentChat(),
        onFocusInspectorTab: (tab) => {
          setSection('workbench')
          setInspectorTab(tab)
        },
        onImportCharacter: () => importCharacterInputRef.current?.click(),
        onOpenLibraryDialog: () => {
          setSection('workbench')
          setLibraryDialogOpen(true)
        },
        onOpenSettingsConnections: () => {
          void navigateToSectionWith('settings', { tab: 'engines' })
        },
        onSetSection: (targetSection) => void navigateToSection(targetSection),
        onDuplicateCurrentSession: () => {
          if (selectedChatId) {
            void state.handleDuplicateChat(selectedChatId)
          }
        },
        onExportChat: () => void state.handleExportCurrentChat(),
        onRefreshWorkspace: () => void workspaceQuery.refetch(),
        onCreateChat: () => void handleCreateChatClick(),
        onTestConnection: () => {
          state.setSettingsPanelAction({ kind: 'test-connection', nonce: Date.now() })
        },
      }),
    [
      handleCreateChatClick,
      navigateToSection,
      navigateToSectionWith,
      selectedChatId,
      setInspectorTab,
      setLibraryDialogOpen,
      setSection,
      state,
      workspaceQuery,
    ],
  )

  const handleReviewNarrativeMemoryCandidate = useCallback(
    async (candidateId: string, action: 'approve' | 'reject') => {
      try {
        await reviewNarrativeMemoryCandidateMutation.mutateAsync({
          action,
          avatarUrl: selectedCharacterAvatar || undefined,
          candidateId,
          csrfToken: 'tauri-local',
          fileName: selectedChatId || undefined,
          queryText: lastGenerationContext?.query,
        })
        await handleRefreshGenerationContextSnapshot()
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
    },
    [
      handleRefreshGenerationContextSnapshot,
      lastGenerationContext?.query,
      reviewNarrativeMemoryCandidateMutation,
      selectedCharacterAvatar,
      selectedChatId,
    ],
  )

  const handleApproveAllNarrativeMemoryCandidates = useCallback(
    async () => {
      if (narrativeMemoryCandidates.length === 0) return
      try {
        setPendingNarrativeMemoryCandidateBatchAction('approve')
        for (const candidate of narrativeMemoryCandidates) {
          await reviewNarrativeMemoryCandidateMutation.mutateAsync({
            action: 'approve',
            avatarUrl: selectedCharacterAvatar || undefined,
            candidateId: candidate.id,
            csrfToken: 'tauri-local',
            fileName: selectedChatId || undefined,
            queryText: lastGenerationContext?.query,
          })
        }
        await handleRefreshGenerationContextSnapshot()
      } catch (error) {
        toast.error(toErrorMessage(error))
      } finally {
        setPendingNarrativeMemoryCandidateBatchAction(null)
      }
    },
    [
      handleRefreshGenerationContextSnapshot,
      lastGenerationContext?.query,
      narrativeMemoryCandidates,
      reviewNarrativeMemoryCandidateMutation,
      selectedCharacterAvatar,
      selectedChatId,
    ],
  )

  const handleDeleteNarrativeMemory = useCallback(
    async (memoryId: string) => {
      try {
        await deleteNarrativeMemoryMutation.mutateAsync({
          avatarUrl: selectedCharacterAvatar || undefined,
          csrfToken: 'tauri-local',
          fileName: selectedChatId || undefined,
          memoryId,
          query: lastGenerationContext?.query,
        })
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
    },
    [
      deleteNarrativeMemoryMutation,
      lastGenerationContext?.query,
      selectedCharacterAvatar,
      selectedChatId,
    ],
  )

  const handleDeleteNarrativeMemoryCandidate = useCallback(
    async (candidateId: string) => {
      try {
        await deleteNarrativeMemoryCandidateMutation.mutateAsync({
          avatarUrl: selectedCharacterAvatar || undefined,
          candidateId,
          csrfToken: 'tauri-local',
          fileName: selectedChatId || undefined,
        })
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
    },
    [
      deleteNarrativeMemoryCandidateMutation,
      selectedCharacterAvatar,
      selectedChatId,
    ],
  )

  const handleClearMemoryHits = useCallback(
    async () => {
      try {
        await clearMemoryHitsMutation.mutateAsync({
          avatarUrl: selectedCharacterAvatar || undefined,
          csrfToken: 'tauri-local',
          fileName: selectedChatId || undefined,
          query: lastGenerationContext?.query,
        })
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
    },
    [
      clearMemoryHitsMutation,
      lastGenerationContext?.query,
      selectedCharacterAvatar,
      selectedChatId,
    ],
  )

  const sectionLayoutProps = useMemo(
    () => ({
      section,
      sectionParams,
      onSetSection: (nextSection: WorkbenchSection) => {
        void navigateToSection(nextSection)
      },
      onOpenSectionWith: (nextSection: WorkbenchSection, params?: Record<string, string>) => {
        void navigateToSectionWith(nextSection, params)
      },
      auth,
      settings,
      settingsTab,
      settingsPanelAction,
      catalog,
      sortedCharacters,
      selectedCharacterAvatar,
      selectedCharacter,
      characterChats,
      selectedChatId,
      selectedChat,
      transcriptMessages,
      chatMessages,
      chatMetadata,
      loading,
      chatsLoading,
      chatLoading,
      chatsError,
      chatError,
      saveError,
      saveErrorTitle,
      actionPending,
      draftMessage,
      draftAssistMode,
      draftAuthorName,
      currentUserLabel,
      workspaceError,
      libraryCollapsed,
      activeWorldDocuments,
      onHighlightCharacter: handleHighlightCharacter,
      onSelectCharacter: handleSelectCharacter,
      onSelectChat: (fileId: string) => {
        handleSelectChat(fileId)
        setSection('workbench')
      },
      onCreateChat: () => void handleCreateChatClick(),
      onToggleLibrary: () => setLibraryCollapsed((c: boolean) => !c),
      onSettingsTabChange: (tab: 'overview' | 'engines' | 'inventory' | 'context' | 'rendering') => {
        void navigateToSectionWith('settings', { tab })
      },
      onSettingsPanelActionHandled: () => setSettingsPanelAction(null),
      onDraftChange: (value: string) => {
        setSaveState('idle')
        setDraftMessage(value)
      },
      onDraftSubmit: handleDraftSubmit,
      onAssistDraft: () => void handleAssistDraft(),
      onDraftAssistModeChange: (mode: DraftAssistMode) => setDraftAssistMode(mode),
      onResaveClick: () => void handleSaveCurrentChatClick(),
      onBranchMessage: (index: number) => void handleBranchMessage(index),
      onDeleteChat: (fileId: string) => void handleDeleteChat(fileId),
      onDeleteMessage: (index: number) => void handleDeleteMessage(index),
      onDuplicateChat: (fileId: string) => void handleDuplicateChat(fileId),
      onEditMessage: (index: number, nextText: string) => void handleEditMessage(index, nextText),
      onRegenerateMessage: (index: number) => void handleRegenerateMessage(index),
      onContinueMessage: (index: number) => void handleContinueMessage(index),
      onRenameChat: (fileId: string) => void handleRenameChat(fileId),
      onDeleteSession: (avatar: string, fileId: string) => void handleDeleteSession(avatar, fileId),
      onDuplicateSession: (avatar: string, fileId: string, nextName: string) => void handleDuplicateSession(avatar, fileId, nextName),
      onExportSession: (avatar: string, fileId: string) => void handleExportSession(avatar, fileId),
      onRenameSession: (avatar: string, fileId: string, nextName: string) => void handleRenameSession(avatar, fileId, nextName),
      onRestoreSession: (avatar: string, fileId: string) => void handleRestoreSession(avatar, fileId),
    }),
    [
      actionPending,
      auth,
      activeWorldDocuments,
      characterChats,
      chatError,
      chatLoading,
      chatMessages,
      chatMetadata,
      chatsError,
      chatsLoading,
      catalog,
      currentUserLabel,
      draftAuthorName,
      draftMessage,
      draftAssistMode,
      handleCreateChatClick,
      handleDeleteSession,
      handleDeleteMessage,
      handleDraftSubmit,
      handleAssistDraft,
      setDraftAssistMode,
      handleDuplicateSession,
      handleBranchMessage,
      handleContinueMessage,
      handleEditMessage,
      handleExportSession,
      handleHighlightCharacter,
      handleSaveCurrentChatClick,
      handleSelectCharacter,
      handleSelectChat,
      handleDeleteChat,
      handleDuplicateChat,
      loading,
      libraryCollapsed,
      saveError,
      saveErrorTitle,
      section,
      sectionParams,
      handleRestoreSession,
      handleRenameSession,
      handleRegenerateMessage,
      selectedCharacter,
      selectedCharacterAvatar,
      selectedChat,
      selectedChatId,
      navigateToSection,
      navigateToSectionWith,
      setDraftMessage,
      setAutoApplyWorldState,
      setLibraryCollapsed,
      setSettingsPanelAction,
      setSaveState,
      settings,
      settingsTab,
      settingsPanelAction,
      sortedCharacters,
      transcriptMessages,
      workspaceError,
      handleRenameChat,
      setSection,
    ],
  )

  return (
    <main className="ref-shell">
      <div className="ref-app">
        <ControlBar
          settings={settings}
          selectedCharacter={selectedCharacter}
          selectedChat={selectedChat}
          transcriptMessages={transcriptMessages}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
          onMaxOutputChange={state.handleMaxOutputChange}
          onSetSection={(nextSection) => void navigateToSection(nextSection)}
          onFocusInspectorTab={(tab) => {
            setSection('workbench')
            setInspectorTab(tab)
          }}
          onOpenLibraryDialog={() => {
            setSection('workbench')
            setLibraryDialogOpen(true)
          }}
          onOpenSettingsConnections={() => {
            void navigateToSectionWith('settings', { tab: 'engines' })
          }}
        />

        <div
          className={`ref-main-grid is-library-hidden ${libraryCollapsed ? 'is-library-collapsed' : ''} ${section === 'workbench' ? 'is-workbench-mode' : 'is-section-mode'}`}
        >
          <aside className="ref-left-nav">
            <div className="ref-nav-brand" aria-label="Yggdrasil">
              <YggdrasilLogo className="ref-nav-brand-mark" />
              <div className="ref-nav-brand-copy">
                <strong>Yggdrasil</strong>
                <span>Neural Sine Matrix</span>
              </div>
            </div>
            <ScrollArea className="ref-nav-scroll">
              <div className="ref-nav-scroll-body">
                <NavGroup
                  collapsed={Boolean(navGroupCollapsed.tavern)}
                  items={[{ icon: FaTavernIcon, label: t('nav.tavern'), active: section === 'workbench', onClick: () => void navigateToSection('workbench') }]}
                  onToggle={() => toggleNavGroup('tavern')}
                  title={t('nav.groups.tavern')}
                />
                <NavGroup
                  collapsed={Boolean(navGroupCollapsed.sessions)}
                  items={[
                    { icon: FaSessionsIcon, label: t('nav.sessions'), active: section === 'sessions', onClick: () => void navigateToSection('sessions'), preloadSection: 'sessions' },
                    { icon: FaTemplatesIcon, label: t('nav.templates'), active: section === 'templates', onClick: () => void navigateToSection('templates'), preloadSection: 'templates' },
                    { icon: FaRecentlyUsedIcon, label: t('nav.recentlyUsed'), active: section === 'recently-used', onClick: () => void navigateToSection('recently-used'), preloadSection: 'recently-used' },
                  ]}
                  onToggle={() => toggleNavGroup('sessions')}
                  title={t('nav.groups.sessions')}
                />
                <NavGroup
                  collapsed={Boolean(navGroupCollapsed.library)}
                  items={[{ icon: FaLibraryIcon, label: t('nav.library'), active: section === 'library', onClick: () => void navigateToSection('library') }]}
                  onToggle={() => toggleNavGroup('library')}
                  title={t('nav.groups.library')}
                />
                <NavGroup
                  collapsed={Boolean(navGroupCollapsed.content)}
                  items={[
                    { icon: FaCharactersIcon, label: t('nav.characters'), active: section === 'characters', onClick: () => void navigateToSection('characters'), preloadSection: 'characters' },
                    { icon: FaStoryIcon, label: t('nav.story'), active: section === 'story', onClick: () => void navigateToSection('story'), preloadSection: 'story' },
                    { icon: FaProjectsIcon, label: t('nav.projects'), active: section === 'projects', onClick: () => void navigateToSection('projects'), preloadSection: 'projects' },
                    { icon: FaLorebooksIcon, label: t('nav.lorebooks'), active: section === 'lorebooks', onClick: () => void navigateToSection('lorebooks'), preloadSection: 'lorebooks' },
                    { icon: FaPresetsIcon, label: t('nav.presets'), active: section === 'presets', onClick: () => void navigateToSection('presets'), preloadSection: 'presets' },
                    { icon: FaAssetsIcon, label: t('nav.assets'), active: section === 'assets', onClick: () => void navigateToSection('assets'), preloadSection: 'assets' },
                    { icon: FaGroupsIcon, label: t('nav.groupsLabel'), active: section === 'groups', onClick: () => void navigateToSection('groups'), preloadSection: 'groups' },
                  ]}
                  onToggle={() => toggleNavGroup('content')}
                  title={t('nav.groups.content')}
                />
                <NavGroup
                  collapsed={Boolean(navGroupCollapsed.extensions)}
                  items={[{ icon: FaExtensionsIcon, label: t('nav.extensions'), active: section === 'extensions', onClick: () => void navigateToSection('extensions'), preloadSection: 'extensions' }]}
                  onToggle={() => toggleNavGroup('extensions')}
                  title={t('nav.groups.extensions')}
                />
                <NavGroup
                  collapsed={Boolean(navGroupCollapsed.maintenance)}
                  items={[
                    { icon: FaBackupsIcon, label: t('nav.backups'), active: section === 'backups', onClick: () => void navigateToSection('backups'), preloadSection: 'backups' },
                    { icon: FaLogsIcon, label: t('nav.logs'), active: section === 'logs', onClick: () => void navigateToSection('logs'), preloadSection: 'logs' },
                    { icon: FaProvidersIcon, label: t('nav.providers'), active: section === 'providers', onClick: () => void navigateToSection('providers'), preloadSection: 'providers' },
                    { icon: FaSettingsIcon, label: t('nav.settings'), active: section === 'settings', onClick: () => void navigateToSection('settings'), preloadSection: 'settings' },
                    { icon: FaAboutIcon, label: t('nav.about'), active: section === 'system', onClick: () => void navigateToSection('system'), preloadSection: 'system' },
                  ]}
                  onToggle={() => toggleNavGroup('maintenance')}
                  title={t('nav.groups.maintenance')}
                />
              </div>
            </ScrollArea>
            <div className="ref-nav-footer">
              <div className="ref-nav-footer-status">
                <div className="ref-health-dot" />
                <p>{t('shell.systemHealthy')}</p>
              </div>
              <span>{t('shell.version', { version: versionLabel })}</span>
            </div>
          </aside>

          <section className={`ref-center-stack ${section === 'workbench' ? 'is-workbench has-inspector' : 'is-plain'}`}>
            {section === 'workbench' ? (
              <header className="ref-character-hero">
                <div className="ref-character-portrait">
                  <WorkspaceAvatar
                    avatar={selectedCharacter?.avatar}
                    className="!h-full !w-full rounded-none after:rounded-none"
                    imageClassName="!rounded-none !aspect-auto"
                    fallbackClassName="rounded-none ref-portrait-fallback"
                    name={selectedCharacterName}
                    size="default"
                  />
                </div>
                <div className="ref-character-copy">
                  <div className="ref-character-title-row">
                    <div className="ref-character-title-stack">
                      <h1>{selectedCharacterName}</h1>
                      <div className="ref-character-badges">
                        {heroBadges.length > 0 ? heroBadges.map((badge) => <span key={badge}>{badge}</span>) : <span>{t('common.unconfigured')}</span>}
                      </div>
                    </div>
                  </div>
                  <p className="ref-character-quote">
                    {heroSummary}
                  </p>
                </div>
                <div className="ref-character-actions">
                  <HeroActionRow
                    onOpenLibrary={() => setLibraryDialogOpen(true)}
                    onSetSection={(nextSection) => void navigateToSection(nextSection)}
                  />
                </div>
              </header>
            ) : null}

            <div className={`ref-chat-stage ${section === 'workbench' ? 'is-section-browser' : ''}`}>
              <Suspense fallback={<WorkbenchModuleFallback />}>
                <AppSectionMainPanel {...sectionLayoutProps} />
              </Suspense>
            </div>
          </section>

          {section === 'workbench' ? (
            <aside className="ref-right-sidebar">
              <Tabs value={inspectorTab} onValueChange={(value) => setInspectorTab(value as typeof inspectorTab)}>
                <TabsList className="ref-right-tabs h-auto w-full gap-0 rounded-none bg-transparent p-0">
                  <TabsTrigger className="ref-right-tab" value="generation">{t('inspector.generation')}</TabsTrigger>
                  <TabsTrigger className="ref-right-tab" value="context">{t('inspector.context')}</TabsTrigger>
                  <TabsTrigger className="ref-right-tab" value="character">{t('inspector.character')}</TabsTrigger>
                  <TabsTrigger className="ref-right-tab" value="trace">{t('inspector.trace')}</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="ref-right-content">
                <div className="ref-right-scroll">
                  {inspectorTab === 'generation' ? (
                    <Suspense fallback={<WorkbenchModuleFallback />}>
                      <GenerationTab
                        activeWorldDocuments={activeWorldDocuments}
                        autoApplyWorldState={autoApplyWorldState}
                        catalog={catalog}
                        currentUserLabel={currentUserLabel}
                        draftAuthorName={draftAuthorName}
                        onGenerateStructuredInsight={handleGenerateStructuredInsight}
                        onApplyStructuredInsight={handleApplyStructuredInsight}
                        onAutoApplyWorldStateChange={setAutoApplyWorldState}
                        onClearStructuredInsight={handleClearStructuredInsight}
                        onSettingChange={handleSettingChange}
                        recentTraces={traceEntries}
                        selectedCharacter={selectedCharacter}
                        settings={settings}
                        structuredInsight={structuredInsight}
                        structuredInsightApplying={structuredInsightApplying}
                        structuredInsightPending={structuredInsightPending}
                        transcriptMessages={transcriptMessages}
                      />
                    </Suspense>
                    ) : inspectorTab === 'context' ? (
                      <Suspense fallback={<WorkbenchModuleFallback />}>
                        <ContextTab
                          lastGenerationContext={lastGenerationContext}
                          narrativeMemoryCandidates={narrativeMemoryCandidates}
                          narrativeMemoryHits={narrativeMemoryHits}
                          storedNarrativeMemories={storedNarrativeMemories}
                          onApproveAllNarrativeMemoryCandidates={() => {
                            void handleApproveAllNarrativeMemoryCandidates()
                          }}
                          onApproveNarrativeMemoryCandidate={(candidateId) => {
                            void handleReviewNarrativeMemoryCandidate(candidateId, 'approve')
                          }}
                          onRejectNarrativeMemoryCandidate={(candidateId) => {
                            void handleReviewNarrativeMemoryCandidate(candidateId, 'reject')
                          }}
                          onDeleteNarrativeMemory={handleDeleteNarrativeMemory}
                          onDeleteNarrativeMemoryCandidate={handleDeleteNarrativeMemoryCandidate}
                          onClearMemoryHits={() => {
                            void handleClearMemoryHits()
                          }}
                          memoryHitsClearing={clearMemoryHitsMutation.isPending}
                          pendingNarrativeMemoryDeletionId={
                            deleteNarrativeMemoryMutation.isPending
                              ? deleteNarrativeMemoryMutation.variables?.memoryId ?? null
                              : null
                          }
                          pendingNarrativeMemoryCandidateDeletionId={
                            deleteNarrativeMemoryCandidateMutation.isPending
                              ? deleteNarrativeMemoryCandidateMutation.variables?.candidateId ?? null
                              : null
                          }
                          pendingNarrativeMemoryCandidateBatchAction={pendingNarrativeMemoryCandidateBatchAction}
                          pendingNarrativeMemoryCandidateId={
                            reviewNarrativeMemoryCandidateMutation.isPending
                              ? reviewNarrativeMemoryCandidateMutation.variables?.candidateId
                              : null
                          }
                          retrievalActivityHits={retrievalActivityHits}
                          retrievalJobs={retrievalJobs}
                          sessionSummaries={sessionSummaries}
                          sessionSummariesRefreshing={sessionSummariesQuery.isFetching}
                          sessionSummaryDeleting={deleteSessionSummaryMutation.isPending}
                          pendingSessionSummaryDeletionId={
                            deleteSessionSummaryMutation.isPending ? deleteSessionSummaryMutation.variables?.id ?? '__scope__' : null
                          }
                          onRefreshSessionSummaries={() => {
                            void handleRefreshSessionSummary()
                          }}
                          onDeleteSessionSummary={(summaryId) => {
                            void deleteSessionSummaryMutation.mutateAsync({
                              avatarUrl: selectedCharacterAvatar || undefined,
                              csrfToken: 'tauri-local',
                              fileName: selectedChatId || undefined,
                              id: summaryId,
                            })
                          }}
                          onClearSessionSummaries={() => {
                            void deleteSessionSummaryMutation.mutateAsync({
                              avatarUrl: selectedCharacterAvatar || undefined,
                              csrfToken: 'tauri-local',
                              fileName: selectedChatId || undefined,
                            })
                          }}
                          selectedCharacter={selectedCharacter}
                          settings={settings}
                          transcriptMessages={transcriptMessages}
                        />
                      </Suspense>
                  ) : inspectorTab === 'character' ? (
                    <Suspense fallback={<WorkbenchModuleFallback />}>
                      <CharacterTab character={selectedCharacter} key={selectedCharacter?.avatar || 'empty'} />
                    </Suspense>
                  ) : (
                    <Suspense fallback={<WorkbenchModuleFallback />}>
                      <TraceTab
                        traces={traceEntries}
                        onClear={() => {
                          void clearTraceMutation
                            .mutateAsync({
                              avatarUrl: selectedCharacterAvatar || undefined,
                              csrfToken: 'tauri-local',
                              fileName: selectedChatId || undefined,
                            })
                            .then(() => {
                              toast.success(t('traceTab.feedback.cleared'))
                            })
                            .catch((error) => {
                              toast.error(error instanceof Error ? error.message : t('traceTab.feedback.clearFailed'))
                            })
                        }}
                        onExport={() => {
                          void import('@yggdrasil/api-client').then(({ exportTraceEntries }) =>
                            exportTraceEntries({
                              avatarUrl: selectedCharacterAvatar || undefined,
                              csrfToken: 'tauri-local',
                              fileName: selectedChatId || undefined,
                            }),
                          ).then((path) => {
                            toast.success(t('traceTab.feedback.exported', { path }))
                          }).catch((error) => {
                            toast.error(error instanceof Error ? error.message : t('traceTab.feedback.exportFailed'))
                          })
                        }}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            </aside>
          ) : null}
        </div>

        <Dialog open={libraryDialogOpen} onOpenChange={setLibraryDialogOpen}>
        <DialogContent
          className="ref-library-dialog max-w-none sm:max-w-none"
          showCloseButton={false}
          style={{
              width: 'min(1480px, calc(100vw - 40px))',
              maxWidth: 'min(1480px, calc(100vw - 40px))',
              height: 'min(72vh, 760px)',
            }}
          >
            <div className="ref-library-dialog-head">
              <div>
                <DialogTitle>{t('nav.library')}</DialogTitle>
              </div>
              <Button
                aria-label={t('common.close')}
                className="ref-library-dialog-close"
                onClick={() => setLibraryDialogOpen(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            <div className="ref-library-dialog-body">
              <Suspense fallback={<WorkbenchModuleFallback />}>
                <AppSectionResourcePanel {...sectionLayoutProps} resourcePanelVariant="dialog" />
              </Suspense>
            </div>
          </DialogContent>
        </Dialog>

        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          characters={sortedCharacters
            .filter((character) => typeof character.avatar === 'string' && character.avatar)
            .map((character) => ({
              avatar: String(character.avatar),
              name: getCharacterName(character),
            }))}
          onAction={handleCommandPaletteAction}
          onNavigate={(target) => void navigateToSection(target as WorkbenchSection)}
          onSelectCharacter={(avatar) => handleSelectCharacter(avatar)}
        />

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

        <Dialog
          open={Boolean(sessionNameDialog)}
          onOpenChange={(open) => {
            if (!open) {
              setSessionNameDialog(null)
              setSessionNameValue('')
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {sessionNameDialog?.mode === 'rename'
                  ? t('sectionBrowser.dialogs.renameTitle')
                  : t('sectionBrowser.dialogs.duplicateTitle')}
              </DialogTitle>
              <DialogDescription>
                {sessionNameDialog?.mode === 'rename'
                  ? t('sectionBrowser.dialogs.renameDescription', { name: sessionNameDialog?.fileId ?? '' })
                  : t('sectionBrowser.dialogs.duplicateDescription', { name: sessionNameDialog?.fileId ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              placeholder={t('sectionBrowser.dialogs.namePlaceholder')}
              value={sessionNameValue}
              onChange={(event) => setSessionNameValue(event.target.value)}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSessionNameDialog(null)
                  setSessionNameValue('')
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSessionNameDialogConfirm(sessionNameValue)}
              >
                {sessionNameDialog?.mode === 'rename' ? t('common.save') : t('sectionBrowser.actions.duplicate')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}

function WorkbenchModuleFallback() {
  return <div className="h-full min-h-0" />
}

function HeroActionRow({
  onOpenLibrary,
  onSetSection,
}: {
  onOpenLibrary: () => void
  onSetSection: (section: 'characters' | 'lorebooks' | 'recently-used') => void
}) {
  const { t } = useI18n()
  const shortcuts = [
    { icon: UserRoundIcon, label: t('nav.characters'), onClick: () => onSetSection('characters') },
    { icon: BookOpenIcon, label: t('nav.lorebooks'), onClick: () => onSetSection('lorebooks') },
    { icon: HeartIcon, label: t('nav.recentlyUsed'), onClick: () => onSetSection('recently-used') },
    { icon: MoreHorizontalIcon, label: t('nav.library'), onClick: onOpenLibrary },
  ]

  return (
    <div className="ref-hero-action-row">
      {shortcuts.map((item) => {
        const Icon = item.icon
        return (
          <Button
            key={item.label}
            className="ref-hero-icon-button"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={item.onClick}
            title={item.label}
          >
            <Icon className="size-4" />
          </Button>
        )
      })}
    </div>
  )
}

function NavGroup({
  collapsed,
  onToggle,
  title,
  items,
}: {
  collapsed: boolean
  onToggle: () => void
  title: string
  items: Array<{ icon: ComponentType<{ className?: string }>; label: string; active: boolean; onClick?: () => void; preloadSection?: WorkbenchSection }>
}) {
  return (
    <div className={`ref-nav-group ${collapsed ? 'is-collapsed' : ''}`}>
      <button
        aria-expanded={!collapsed}
        className="ref-nav-group-toggle"
        onClick={onToggle}
        type="button"
      >
        <span>{title}</span>
        <ChevronDownIcon className="size-4" />
      </button>
      {!collapsed ? (
        <div className="ref-nav-group-body">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={`ref-nav-button ${item.active ? 'is-active' : ''}`}
                key={item.label}
                onClick={item.onClick}
                onMouseEnter={() => item.preloadSection && preloadWorkbenchSection(item.preloadSection)}
                onFocus={() => item.preloadSection && preloadWorkbenchSection(item.preloadSection)}
                type="button"
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
