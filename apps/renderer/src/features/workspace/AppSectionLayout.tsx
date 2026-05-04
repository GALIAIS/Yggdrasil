import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import type {
  AuthBootstrap,
  CharacterChatSummary,
  CharacterSummary,
  ChatMessage,
  LibraryDocument,
  SettingsPayload,
  WorkspaceCatalogPayload,
} from '@yggdrasil/api-client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChatTranscriptCard } from '@/features/chat/ChatTranscriptCard'
import { LibraryPanel } from '@/features/library/LibraryPanel'
import { SettingsWorkspace } from '@/features/settings/SettingsWorkspace'
import { SystemWorkspace } from '@/features/system/SystemWorkspace'
import { useI18n } from '@/lib/i18n'
import { resolveMessageRenderingConfigFromSettings } from '@/lib/chat-rendering-settings'
import type { WorkbenchSection } from '@/lib/workbench-layout'
import type { DraftAssistMode, SettingsPanelAction } from '@/features/workspace/useWorkbenchState'
import {
  readPreloadedWorkbenchSectionModule,
  scheduleWorkbenchSectionPreload,
} from '@/features/workspace/workbenchSectionPreload'

function createAsyncSectionComponent<TProps, TModule>(
  section: WorkbenchSection,
  loader: () => Promise<TModule>,
  pick: (module: TModule) => ComponentType<TProps>,
): readonly [ComponentType<TProps>, () => Promise<ComponentType<TProps>>] {
  const shouldPersistCache = !import.meta.env.DEV

  let loadedComponent: ComponentType<TProps> | null = null
  let loadingPromise: Promise<ComponentType<TProps>> | null = null

  const load = () => {
    const preloadedModule = readPreloadedWorkbenchSectionModule<TModule>(section)
    if (preloadedModule) {
      const nextComponent = pick(preloadedModule)
      if (shouldPersistCache) {
        loadedComponent = nextComponent
      }
      return Promise.resolve(nextComponent)
    }
    if (shouldPersistCache && loadedComponent) {
      return Promise.resolve(loadedComponent)
    }
    if (!loadingPromise || !shouldPersistCache) {
      loadingPromise = loader().then((module) => {
        const nextComponent = pick(module)
        if (shouldPersistCache) {
          loadedComponent = nextComponent
        }
        return nextComponent
      }).finally(() => {
        if (!shouldPersistCache) {
          loadingPromise = null
        }
      })
    }
    return loadingPromise
  }

  function AsyncSectionComponent(props: TProps) {
    const [ResolvedComponent, setResolvedComponent] = useState<ComponentType<TProps> | null>(() => {
      if (loadedComponent) {
        return loadedComponent
      }
      const preloadedModule = readPreloadedWorkbenchSectionModule<TModule>(section)
      if (!preloadedModule) {
        return null
      }
      const nextComponent = pick(preloadedModule)
      if (shouldPersistCache) {
        loadedComponent = nextComponent
      }
      return nextComponent
    })

    useEffect(() => {
      if (ResolvedComponent) return
      void load().then((nextComponent) => {
        setResolvedComponent(() => nextComponent)
      })
    }, [ResolvedComponent])

    if (!ResolvedComponent) {
      return <DelayedSectionWorkspaceFallback />
    }

    const SectionComponent = ResolvedComponent as ComponentType<Record<string, unknown>>
    return <SectionComponent {...(props as Record<string, unknown>)} />
  }

  return [AsyncSectionComponent, load] as const
}

const [AssetManagerPanel] = createAsyncSectionComponent(
  'assets',
  () => import('@/features/assets/AssetManagerPanel'),
  (module) => module.AssetManagerPanel,
)
const [BackupsPanel] = createAsyncSectionComponent(
  'backups',
  () => import('@/features/backups/BackupsPanel'),
  (module) => module.BackupsPanel,
)
const [CharacterManagerPanel] = createAsyncSectionComponent(
  'characters',
  () => import('@/features/characters/CharacterManagerPanel'),
  (module) => module.CharacterManagerPanel,
)
const [StoryBoardPanel] = createAsyncSectionComponent(
  'story',
  () => import('@/features/story/StoryBoardPanel'),
  (module) => module.StoryBoardPanel,
)
const [ProjectManagerPanel] = createAsyncSectionComponent(
  'projects',
  () => import('@/features/projects/ProjectManagerPanel'),
  (module) => module.ProjectManagerPanel,
)
const [ExtensionsPanel] = createAsyncSectionComponent(
  'extensions',
  () => import('@/features/extensions/ExtensionsPanel'),
  (module) => module.ExtensionsPanel,
)
const [GroupsPanel] = createAsyncSectionComponent(
  'groups',
  () => import('@/features/groups/GroupsPanel'),
  (module) => module.GroupsPanel,
)
const [LogsPanel] = createAsyncSectionComponent(
  'logs',
  () => import('@/features/logs/LogsPanel'),
  (module) => module.LogsPanel,
)
const [ProviderManagerPanel] = createAsyncSectionComponent(
  'providers',
  () => import('@/features/providers/ProviderManagerPanel'),
  (module) => module.ProviderManagerPanel,
)
const [LorebookManagerPanel] = createAsyncSectionComponent(
  'lorebooks',
  () => import('@/features/lorebooks/LorebookManagerPanel'),
  (module) => module.LorebookManagerPanel,
)
const [PresetManagerPanel] = createAsyncSectionComponent(
  'presets',
  () => import('@/features/presets/PresetManagerPanel'),
  (module) => module.PresetManagerPanel,
)
const [RecentlyUsedPanel] = createAsyncSectionComponent(
  'recently-used',
  () => import('@/features/recent/RecentlyUsedPanel'),
  (module) => module.RecentlyUsedPanel,
)
const [SessionManagerPanel] = createAsyncSectionComponent(
  'sessions',
  () => import('@/features/sessions/SessionManagerPanel'),
  (module) => module.SessionManagerPanel,
)
const [TemplatesManagerPanel] = createAsyncSectionComponent(
  'templates',
  () => import('@/features/templates/TemplatesManagerPanel'),
  (module) => module.TemplatesManagerPanel,
)

export interface AppSectionLayoutProps {
  section: WorkbenchSection
  sectionParams?: Record<string, string>
  resourcePanelVariant?: 'panel' | 'dialog'
  onSetSection?: (section: WorkbenchSection) => void
  onOpenSectionWith?: (section: WorkbenchSection, params?: Record<string, string>) => void
  auth: AuthBootstrap | null
  settings: SettingsPayload | null
  settingsTab?: 'overview' | 'engines' | 'inventory' | 'context' | 'rendering'
  onSettingsTabChange?: (tab: 'overview' | 'engines' | 'inventory' | 'context' | 'rendering') => void
  settingsPanelAction?: SettingsPanelAction
  onSettingsPanelActionHandled?: () => void
  catalog: WorkspaceCatalogPayload | null
  sortedCharacters: CharacterSummary[]
  selectedCharacterAvatar: string
  selectedCharacter: CharacterSummary | null
  characterChats: CharacterChatSummary[]
  selectedChatId: string
  selectedChat: CharacterChatSummary | null
  transcriptMessages: ChatMessage[]
  chatMessages: ChatMessage[]
  chatMetadata: Record<string, unknown> | null
  loading: boolean
  chatsLoading: boolean
  chatLoading: boolean
  chatsError: string | null
  chatError: string | null
  saveError: string | null
  saveErrorTitle?: string | null
  actionPending: boolean
  draftMessage: string
  draftAssistMode?: DraftAssistMode
  draftAuthorName: string
  currentUserLabel: string
  workspaceError: string | null
  libraryCollapsed: boolean
  activeWorldDocuments: LibraryDocument[]
  onHighlightCharacter?: (avatar: string) => void
  onSelectCharacter: (avatar: string) => void
  onSelectChat: (fileId: string) => void
  onCreateChat: () => void
  onToggleLibrary: () => void
  onDraftChange: (value: string) => void
  onDraftSubmit: (event: FormEvent<HTMLFormElement>) => void
  onAssistDraft?: () => void
  onDraftAssistModeChange?: (mode: DraftAssistMode) => void
  onResaveClick: () => void
  onBranchMessage?: (index: number) => void
  onContinueMessage?: (index: number) => void
  onDeleteMessage?: (index: number) => void
  onEditMessage?: (index: number, nextText: string) => void
  onRegenerateMessage?: (index: number) => void
  onDeleteChat?: (fileId: string) => void
  onDuplicateChat?: (fileId: string) => void
  onRenameChat?: (fileId: string) => void
  onDeleteSession?: (avatar: string, fileId: string) => void
  onDuplicateSession?: (avatar: string, fileId: string, nextName: string) => void
  onExportSession?: (avatar: string, fileId: string) => void
  onRenameSession?: (avatar: string, fileId: string, nextName: string) => void
  onRestoreSession?: (avatar: string, fileId: string) => void
}

export function AppSectionResourcePanel(props: AppSectionLayoutProps) {
  return <>{createResourcePanel(props)}</>
}

export function AppSectionMainPanel(props: AppSectionLayoutProps) {
  useEffect(() => {
    scheduleWorkbenchSectionPreload()
  }, [])

  return <>{createMainPanel(props)}</>
}

export function AppSectionInspectorPanel(props: AppSectionLayoutProps) {
  return <>{createInspectorPanel(props)}</>
}

function createResourcePanel(props: AppSectionLayoutProps): ReactNode {
  const { resourcePanelVariant = 'panel', section } = props

  // Library panel is always visible at the bottom for workbench-like sections
  if (section === 'settings') {
    return (
      <SectionWorkspaceBoundary>
        <SettingsWorkspace
          charactersCount={props.sortedCharacters.length}
          chatsCount={props.characterChats.length}
          catalog={props.catalog}
          currentUserLabel={props.currentUserLabel}
          activeTab={props.settingsTab}
          onActiveTabChange={props.onSettingsTabChange}
          actionRequest={props.settingsPanelAction}
          onActionHandled={props.onSettingsPanelActionHandled}
          settings={props.settings}
          onOpenProviders={props.onSetSection ? () => props.onSetSection?.('providers') : undefined}
          slot="resource"
        />
      </SectionWorkspaceBoundary>
    )
  }

  if (section === 'system') {
    return (
      <SectionWorkspaceBoundary>
        <SystemWorkspace
          auth={props.auth}
          catalog={props.catalog}
          charactersCount={props.sortedCharacters.length}
          chatsCount={props.characterChats.length}
          currentUserLabel={props.currentUserLabel}
          messagesCount={props.transcriptMessages.length}
          selectedCharacterAvatar={props.selectedCharacterAvatar || undefined}
          selectedChatId={props.selectedChatId || undefined}
          settings={props.settings}
          slot="resource"
          workspaceError={props.workspaceError}
        />
      </SectionWorkspaceBoundary>
    )
  }

  // For all other sections (workbench + feature sections), show the library
  const {
    sortedCharacters,
    selectedCharacterAvatar,
    loading,
    libraryCollapsed,
    onSelectCharacter,
    onCreateChat,
    onToggleLibrary,
  } = props

  return (
    <LibraryPanel
      catalog={props.catalog}
      characters={sortedCharacters}
      libraryCollapsed={libraryCollapsed}
      loading={loading}
      onCreateChat={onCreateChat}
      onOpenSection={(nextSection) => {
        if (props.onOpenSectionWith) {
          props.onOpenSectionWith(nextSection)
          return
        }
        props.onSetSection?.(nextSection)
      }}
      onSelectCharacter={onSelectCharacter}
      onToggleLibrary={onToggleLibrary}
      selectedCharacterAvatar={selectedCharacterAvatar}
      variant={resourcePanelVariant}
    />
  )
}

function createMainPanel(props: AppSectionLayoutProps): ReactNode {
  const {
    section,
    auth,
    settings,
    sortedCharacters,
    selectedCharacter,
    characterChats,
    selectedChatId,
    selectedChat,
    transcriptMessages,
    chatMessages,
    chatMetadata,
    chatLoading,
    chatError,
    saveError,
    saveErrorTitle,
    actionPending,
    draftMessage,
    draftAssistMode,
    draftAuthorName,
    onDraftChange,
    onDraftSubmit,
    onResaveClick,
    currentUserLabel,
  } = props
  const messageRenderingConfig = resolveMessageRenderingConfigFromSettings(settings?.settings)

  if (section === 'settings') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <SettingsWorkspace
            charactersCount={sortedCharacters.length}
            chatsCount={characterChats.length}
            catalog={props.catalog}
            currentUserLabel={currentUserLabel}
            activeTab={props.settingsTab}
            onActiveTabChange={props.onSettingsTabChange}
            actionRequest={props.settingsPanelAction}
            onActionHandled={props.onSettingsPanelActionHandled}
            settings={settings}
            slot="main"
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'system') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <SystemWorkspace
            auth={auth}
            catalog={props.catalog}
            charactersCount={sortedCharacters.length}
            chatsCount={characterChats.length}
            currentUserLabel={currentUserLabel}
            messagesCount={transcriptMessages.length}
            selectedCharacterAvatar={props.selectedCharacterAvatar || undefined}
            selectedChatId={props.selectedChatId || undefined}
            settings={settings}
            slot="main"
            workspaceError={props.workspaceError}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'sessions') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <SessionManagerPanel
            sessions={props.catalog?.entries.sessions ?? []}
            onDeleteSession={props.onDeleteSession}
            onDuplicateSession={props.onDuplicateSession}
            onExportSession={props.onExportSession}
            onRenameSession={props.onRenameSession}
            onRestoreSession={props.onRestoreSession}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'templates') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <TemplatesManagerPanel
            catalog={props.catalog}
            onOpenSectionWith={props.onOpenSectionWith}
            onSetSection={props.onSetSection}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'recently-used') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <RecentlyUsedPanel
            catalog={props.catalog}
            onRestoreSession={props.onRestoreSession}
            onSelectCharacter={props.onSelectCharacter}
            onOpenSectionWith={props.onOpenSectionWith}
            onSetSection={props.onSetSection}
            sortedCharacters={props.sortedCharacters}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'library') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <LibraryPanel
          catalog={props.catalog}
          characters={props.sortedCharacters}
          libraryCollapsed={false}
          loading={props.loading}
          onCreateChat={props.onCreateChat}
          onOpenSection={props.onOpenSectionWith ?? props.onSetSection}
          onSelectCharacter={props.onSelectCharacter}
          onToggleLibrary={props.onToggleLibrary}
          selectedCharacterAvatar={props.selectedCharacterAvatar}
          variant="dialog"
        />
      </div>
    )
  }

  if (section === 'logs') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
            <LogsPanel
              csrfToken={auth?.csrfToken ?? 'tauri-local'}
              initialSelectedName={props.sectionParams?.name}
              logs={props.catalog?.entries.logs ?? []}
              settings={props.settings}
            />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'providers') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <ProviderManagerPanel settings={props.settings} />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'assets') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <AssetManagerPanel
            csrfToken={auth?.csrfToken ?? 'tauri-local'}
            initialSelectedDomain={props.sectionParams?.domain}
            initialSelectedName={props.sectionParams?.name}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'groups') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <GroupsPanel
            csrfToken={auth?.csrfToken ?? 'tauri-local'}
            initialSelectedDomain={props.sectionParams?.domain}
            initialSelectedName={props.sectionParams?.name}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'extensions') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <ExtensionsPanel catalog={props.catalog} initialSelectedName={props.sectionParams?.name} settings={props.settings} />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'backups') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <BackupsPanel csrfToken={auth?.csrfToken ?? 'tauri-local'} initialSelectedName={props.sectionParams?.name} />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'characters') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <CharacterManagerPanel
            characters={sortedCharacters}
            csrfToken={auth?.csrfToken ?? 'tauri-local'}
            onHighlightCharacter={props.onHighlightCharacter ?? props.onSelectCharacter}
            onSelectCharacter={props.onSelectCharacter}
            selectedAvatar={props.selectedCharacterAvatar}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'lorebooks') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <LorebookManagerPanel
            avatarUrl={props.selectedCharacterAvatar || undefined}
            csrfToken={auth?.csrfToken ?? 'tauri-local'}
            fileName={props.selectedChatId || undefined}
            initialSelectedName={props.sectionParams?.name}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'story') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <StoryBoardPanel
            csrfToken={auth?.csrfToken ?? 'tauri-local'}
            initialSelectedKind={props.sectionParams?.kind}
            initialSelectedName={props.sectionParams?.name}
            selectedCharacterAvatar={props.selectedCharacterAvatar || undefined}
            selectedChatId={props.selectedChatId || undefined}
            onRestoreSession={props.onRestoreSession}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'projects') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <ProjectManagerPanel
            catalog={props.catalog}
            csrfToken={auth?.csrfToken ?? 'tauri-local'}
            initialSelectedName={props.sectionParams?.name}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  if (section === 'presets') {
    return (
      <div className="h-full min-h-0 p-3 md:p-4">
        <SectionWorkspaceBoundary>
          <PresetManagerPanel
            csrfToken={auth?.csrfToken ?? 'tauri-local'}
            initialSelectedDomain={props.sectionParams?.domain}
            initialSelectedKind={props.sectionParams?.kind}
            initialSelectedName={props.sectionParams?.name}
          />
        </SectionWorkspaceBoundary>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 p-3 md:p-4">
      <div className="h-full min-h-0">
        <ChatTranscriptCard
          actionPending={actionPending}
          chatMessagesCount={chatMessages.length}
          draftAuthorName={draftAuthorName}
          draftMessage={draftMessage}
          draftAssistMode={draftAssistMode}
          error={chatError}
          hasChatMetadata={Boolean(chatMetadata)}
          loading={chatLoading}
          messageRenderingConfig={messageRenderingConfig}
          onAssistDraft={props.onAssistDraft}
          onDraftAssistModeChange={props.onDraftAssistModeChange}
          onDraftChange={onDraftChange}
          onDraftSubmit={onDraftSubmit}
          onBranchMessage={props.onBranchMessage}
          onContinueMessage={props.onContinueMessage}
          onResaveClick={onResaveClick}
          onDeleteMessage={props.onDeleteMessage}
          onEditMessage={props.onEditMessage}
          onRegenerateMessage={props.onRegenerateMessage}
          saveError={saveError}
          saveErrorTitle={saveErrorTitle}
          selectedCharacter={selectedCharacter}
          selectedChat={selectedChat}
          selectedChatId={selectedChatId}
          transcriptMessages={transcriptMessages}
        />
      </div>
    </div>
  )
}

function createInspectorPanel(props: AppSectionLayoutProps): ReactNode {
  if (props.section === 'settings') {
    return (
      <SectionWorkspaceBoundary>
        <SettingsWorkspace
          charactersCount={props.sortedCharacters.length}
          chatsCount={props.characterChats.length}
          catalog={props.catalog}
          currentUserLabel={props.currentUserLabel}
          activeTab={props.settingsTab}
          onActiveTabChange={props.onSettingsTabChange}
          actionRequest={props.settingsPanelAction}
          onActionHandled={props.onSettingsPanelActionHandled}
          settings={props.settings}
          onOpenProviders={props.onSetSection ? () => props.onSetSection?.('providers') : undefined}
          slot="inspector"
        />
      </SectionWorkspaceBoundary>
    )
  }

  if (props.section === 'system') {
    return (
      <SectionWorkspaceBoundary>
        <SystemWorkspace
          auth={props.auth}
          catalog={props.catalog}
          charactersCount={props.sortedCharacters.length}
          chatsCount={props.characterChats.length}
          currentUserLabel={props.currentUserLabel}
          messagesCount={props.transcriptMessages.length}
          selectedCharacterAvatar={props.selectedCharacterAvatar || undefined}
          selectedChatId={props.selectedChatId || undefined}
          settings={props.settings}
          slot="inspector"
          workspaceError={props.workspaceError}
        />
      </SectionWorkspaceBoundary>
    )
  }

  if (props.section === 'providers') {
    return null
  }

  return null
}

function SectionWorkspaceBoundary({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function DelayedSectionWorkspaceFallback() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timeoutId = globalThis.setTimeout(() => setVisible(true), 180)
    return () => globalThis.clearTimeout(timeoutId)
  }, [])

  if (!visible) {
    return null
  }

  return <SectionWorkspaceFallback />
}

function SectionWorkspaceFallback() {
  const { t } = useI18n()

  return (
    <div className="h-full min-h-0">
      <Card className="h-full shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t('common.loading')}</CardTitle>
          <CardDescription>{t('sectionBrowser.loadingSection')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Skeleton className="h-24 rounded-sm" />
          <Skeleton className="h-24 rounded-sm" />
          <Skeleton className="h-24 rounded-sm" />
        </CardContent>
      </Card>
    </div>
  )
}
