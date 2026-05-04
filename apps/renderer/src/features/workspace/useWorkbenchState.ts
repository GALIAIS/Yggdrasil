import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  type AppSettings,
  ChatIntegrityError,
  type ChatMessage,
  type CharacterSummary,
  type GenerateChatReplyPayload,
  type GenerationContextResult,
  type SessionSummary,
  type TraceContextBudgetDebug,
  type TraceContextPayload,
} from '@yggdrasil/api-client'

import { useCharacterChatsQuery } from '@/features/characters/hooks'
import {
  traceEntriesQueryKey,
  useExtractNarrativeMemoryMutation,
  useChatQuery,
  useDeleteChatMutation,
  useDuplicateChatMutation,
  useGenerateAssistantMutation,
  useRenameChatMutation,
  useSaveChatMutation,
} from '@/features/chat/hooks'
import {
  narrativeMemoryCandidatesQueryKey,
  narrativeMemoriesQueryKey,
  narrativeMemoryHitsQueryKey,
  useLoginMutation,
  useLibraryDocumentsQuery,
  retrievalHitsQueryKey,
  retrievalJobsQueryKey,
  sessionSummariesQueryKey,
  useSaveCharacterMutation,
  useSaveSettingsMutation,
  useWorkspaceBootstrapQuery,
  useWorkspaceCatalogQuery,
} from '@/features/workspace/hooks'
import { worldStateSnapshotQueryKey } from '@/features/workspace/hooks'
import { useI18n } from '@/lib/i18n'
import {
  getCharacterName,
  resolveSelectedCharacterAvatar,
} from '@/lib/character'
import {
  buildPersistedChat,
  buildChatCompletionMessages,
  buildTextGenerationPrompt,
  createAssistantChatMessage,
  createChatFileName,
  createInitialChatTranscript,
  createUserChatMessage,
  getMessageText,
  removeChatMessage,
  resolveSelectedChatId,
  truncateChatTranscript,
  updateChatMessageText,
} from '@/lib/chat'
import {
  assembleGenerationContext,
  buildChatCompletionMessagesFromAssembly,
  buildTextPromptFromAssembly,
} from '@/lib/context-assembly'
import { normalizeStrictMessageRenderingOutput } from '@/lib/chat-rendering'
import { resolveMessageRenderingConfigFromSettings } from '@/lib/chat-rendering-settings'
import {
  buildSessionSummarySourceSignature,
} from '@/lib/session-summary'
import { toErrorMessage, toTimestamp } from '@/lib/formatters'
import {
  applyCurrentModelToSettings,
  applyOpenAiBehaviorToSettings,
  applyGenerationParameterToSettings,
  resolveSessionSummaryMinMessages,
  resolveSessionSummaryRefreshIntervalMs,
  resolveSessionSummarySourceWindow,
  resolveOpenAiStreamingEnabled,
} from '@/lib/workspace-runtime'
import { importCharacterFile } from '@/lib/character-import'
import type { WorkbenchSaveState } from '@/lib/workbench-layout'
import { toast } from 'sonner'
import { clearTauriAvatarSrcCache } from '@yggdrasil/api-client'
import { useSectionRoute } from '@/hooks/useSectionRoute'
import { useStoredState } from '@/hooks/useStoredState'
import { useQueryClient } from '@tanstack/react-query'
import { flushSync } from 'react-dom'

export type InspectorTabKey = 'generation' | 'context' | 'character' | 'trace'
export type SettingsTabKey = 'overview' | 'engines' | 'inventory' | 'context' | 'rendering'
export type SettingsPanelAction = {
  kind: 'test-connection'
  nonce: number
} | null

type GenerationContextSnapshot = GenerationContextResult & {
  assemblyBudget?: TraceContextBudgetDebug
  query: string
  recentMessagesKept?: number
  summaryKindsUsed?: string[]
}

export type StructuredInsightKind = 'relationship_delta' | 'story_suggestion' | 'world_state_update'
export type DraftAssistMode =
  | 'continue'
  | 'expand'
  | 'compress'
  | 'rewrite_character_voice'
  | 'narration_to_dialogue'

export interface DraftAssistRequestBuildInput {
  appSettings?: AppSettings | null
  authorName: string
  baseChat: ChatMessage[]
  character: CharacterSummary
  draftMessage: string
  generationContext: Pick<
    GenerationContextResult,
    'directiveSnippets' | 'lorebookSnippets' | 'narrativeMemories' | 'worldStateSnippets'
  >
  mode: DraftAssistMode
  sessionSummaries?: SessionSummary[]
}

function normalizeAssistantReplyText(text: string, appSettings: AppSettings | null | undefined): string {
  return normalizeStrictMessageRenderingOutput(
    text,
    resolveMessageRenderingConfigFromSettings(appSettings),
  )
}

function buildTraceAssemblyBudget(
  assembled: {
    budget: {
      droppedDebug: TraceContextBudgetDebug['dropped']
      keptDebug: TraceContextBudgetDebug['kept']
      reservedOutput: number
      usableInputBudget: number
      usedTokens: number
    }
    debug: {
      recentMessagesKept: number
      summaryKindsUsed: string[]
    }
  },
): TraceContextBudgetDebug {
  return {
    dropped: assembled.budget.droppedDebug,
    kept: assembled.budget.keptDebug,
    recentMessagesKept: assembled.debug.recentMessagesKept,
    reservedOutput: assembled.budget.reservedOutput,
    summaryKindsUsed: assembled.debug.summaryKindsUsed,
    usableInputBudget: assembled.budget.usableInputBudget,
    usedTokens: assembled.budget.usedTokens,
  }
}

const SESSION_SUMMARY_KINDS = ['session', 'scene', 'relationship', 'open_loops'] as const

type StructuredInsightResult = {
  generatedAt: number
  kind: StructuredInsightKind
  payload: Record<string, unknown>
}

const SETTINGS_TABS = ['overview', 'engines', 'inventory', 'context', 'rendering'] as const

function coerceSettingsTab(value: unknown): SettingsTabKey {
  return typeof value === 'string' && SETTINGS_TABS.includes(value as SettingsTabKey)
    ? (value as SettingsTabKey)
    : 'overview'
}

export function useWorkbenchState() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [avatarOverride, setAvatarOverride] = useStoredState<string | null>('st.workbench.selectedAvatar', null)
  const [chatSelectionByAvatar, setChatSelectionByAvatar] = useStoredState<Record<string, string | null>>(
    'st.workbench.selectedChatByAvatar',
    {},
  )
  const {
    section,
    setSection,
    openWith: openSectionWith,
    sectionParams,
  } = useSectionRoute('workbench')
  const [inspectorTab, setInspectorTab] = useState<InspectorTabKey>('generation')
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>('overview')
  const [settingsPanelAction, setSettingsPanelAction] = useState<SettingsPanelAction>(null)
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false)
  const [draftMessage, setDraftMessage] = useState('')
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveErrorTitle, setSaveErrorTitle] = useState<string | null>(null)
  const [, setSaveState] = useState<WorkbenchSaveState>('idle')
  const [actionLockCount, setActionLockCount] = useState(0)
  const actionLockRef = useRef(false)
  const selectedCharacterAvatarRef = useRef('')
  const selectedChatIdRef = useRef('')
  const [pendingTranscript, setPendingTranscript] = useState<ChatMessage[] | null>(null)
  const [lastGenerationContext, setLastGenerationContext] = useState<GenerationContextSnapshot | null>(null)
  const sessionSummaryRefreshAtRef = useRef<Record<string, number>>({})
  const [structuredInsight, setStructuredInsight] = useState<StructuredInsightResult | null>(null)
  const [structuredInsightPending, setStructuredInsightPending] = useState<StructuredInsightKind | null>(null)
  const [structuredInsightApplying, setStructuredInsightApplying] = useState(false)
  const [autoApplyWorldState, setAutoApplyWorldState] = useStoredState('st.workbench.autoApplyWorldState', false)
  const [draftAssistMode, setDraftAssistMode] = useStoredState<DraftAssistMode>(
    'st.workbench.draftAssistMode',
    'continue',
  )
  const [sessionNameDialog, setSessionNameDialog] = useState<{
    avatarUrl: string
    fileId: string
    initialValue: string
    mode: 'duplicate' | 'rename'
  } | null>(null)

  useEffect(() => {
    if (section !== 'settings') return
    const nextTab = coerceSettingsTab(sectionParams.tab)
    setSettingsTab((current) => (current === nextTab ? current : nextTab))
  }, [section, sectionParams.tab])

  const workspaceQuery = useWorkspaceBootstrapQuery()
  const workspaceCatalogQuery = useWorkspaceCatalogQuery()
  const worldDocumentsQuery = useLibraryDocumentsQuery('worlds', true)
  const loginMutation = useLoginMutation()
  const saveChatMutation = useSaveChatMutation()
  const saveCharacterMutation = useSaveCharacterMutation()
  const deleteChatMutation = useDeleteChatMutation()
  const renameChatMutation = useRenameChatMutation()
  const duplicateChatMutation = useDuplicateChatMutation()
  const generateAssistantMutation = useGenerateAssistantMutation()
  const extractNarrativeMemoryMutation = useExtractNarrativeMemoryMutation()
  const saveSettingsMutation = useSaveSettingsMutation()

  const workspace = workspaceQuery.data ?? null
  const catalog = workspaceCatalogQuery.data ?? null
  const auth = workspace?.auth ?? null
  const settings = workspace?.settings ?? null
  const characters = useMemo(() => workspace?.characters ?? [], [workspace?.characters])
  const activeWorldDocuments = useMemo(() => {
    const activeNames = Array.isArray(settings?.world_names)
      ? settings.world_names.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
    const documents = worldDocumentsQuery.data ?? []
    return documents.filter((document) => activeNames.includes(document.name))
  }, [settings?.world_names, worldDocumentsQuery.data])

  useEffect(() => {
    if (section !== 'characters') return

    const routeAvatar = typeof sectionParams.avatar === 'string' ? sectionParams.avatar : ''
    if (!routeAvatar) return
    if (!characters.some((item) => typeof item.avatar === 'string' && item.avatar === routeAvatar)) return

    setAvatarOverride((current) => (current === routeAvatar ? current : routeAvatar))
  }, [characters, section, sectionParams.avatar])

  const isAuthenticated = Boolean(auth?.currentUser)
  const csrfToken = auth?.csrfToken ?? ''
  const loading = workspaceQuery.isPending || workspaceQuery.isFetching
  const catalogLoading = workspaceCatalogQuery.isPending || workspaceCatalogQuery.isFetching
  const submitting = loginMutation.isPending
  const savePending = saveChatMutation.isPending
  const deletePending = deleteChatMutation.isPending
  const mutateChatPending = renameChatMutation.isPending || duplicateChatMutation.isPending
  const generatePending = generateAssistantMutation.isPending
  const actionPending = actionLockCount > 0 || savePending || deletePending || mutateChatPending || generatePending

  const runWithActionLock = useCallback(async <T,>(task: () => Promise<T>) => {
    actionLockRef.current = true
    flushSync(() => {
      setActionLockCount((current) => current + 1)
    })
    try {
      return await task()
    } finally {
      actionLockRef.current = false
      setActionLockCount((current) => Math.max(0, current - 1))
    }
  }, [])

  const invalidateGenerationArtifacts = useCallback((traceContext?: TraceContextPayload) => {
    void queryClient.invalidateQueries({
      queryKey: traceEntriesQueryKey(
        traceContext?.avatarUrl,
        traceContext?.fileName,
      ),
    })
    void queryClient.invalidateQueries({
      queryKey: retrievalJobsQueryKey(traceContext?.fileName),
    })
    void queryClient.invalidateQueries({
      queryKey: retrievalHitsQueryKey(
        traceContext?.generationContext?.query,
      ),
    })
    void queryClient.invalidateQueries({
      queryKey: narrativeMemoryHitsQueryKey(
        traceContext?.avatarUrl,
        traceContext?.fileName,
        traceContext?.generationContext?.query,
      ),
    })
  }, [queryClient])

  const requestAssistantReply = useCallback(
    async (
      payload: GenerateChatReplyPayload,
      onChunk?: (accumulated: string) => void,
    ) => {
      const shouldStream =
        payload.settings.main_api === 'openai'
        && resolveOpenAiStreamingEnabled(payload.settings)
        && typeof onChunk === 'function'

      if (shouldStream) {
        const { generateChatReplyStream } = await import('@yggdrasil/api-client')
        const reply = await generateChatReplyStream({
          ...payload,
          onChunk: (_delta, accumulated) => {
            onChunk(accumulated)
          },
        })
        invalidateGenerationArtifacts(payload.traceContext)
        return reply
      }

      const reply = await generateAssistantMutation.mutateAsync(payload)
      return reply
    },
    [generateAssistantMutation, invalidateGenerationArtifacts],
  )

  const appError = useMemo(() => {
    const cause = workspaceQuery.error ?? workspaceCatalogQuery.error ?? loginMutation.error
    return cause ? toErrorMessage(cause) : null
  }, [loginMutation.error, workspaceCatalogQuery.error, workspaceQuery.error])

  const sortedCharacters = useMemo(() => {
    return [...characters].sort((left, right) => {
      const dateDelta = toTimestamp(right.date_last_chat) - toTimestamp(left.date_last_chat)
      if (dateDelta !== 0) return dateDelta
      return getCharacterName(left).localeCompare(getCharacterName(right), 'zh-CN')
    })
  }, [characters])

  const selectedCharacterAvatar = useMemo(() => {
    return resolveSelectedCharacterAvatar(characters, avatarOverride ?? '')
  }, [avatarOverride, characters])

  const chatIdOverride = selectedCharacterAvatar
    ? chatSelectionByAvatar[selectedCharacterAvatar] ?? null
    : null

  const selectedCharacter = useMemo(
    () => sortedCharacters.find((item) => item.avatar === selectedCharacterAvatar) ?? null,
    [selectedCharacterAvatar, sortedCharacters],
  )

  const characterChatsQuery = useCharacterChatsQuery({
    avatarUrl: selectedCharacterAvatar,
    enabled: isAuthenticated,
  })

  const characterChats = useMemo(() => characterChatsQuery.data ?? [], [characterChatsQuery.data])

  const selectedChatId = useMemo(() => {
    if (chatIdOverride) {
      return chatIdOverride
    }
    return resolveSelectedChatId(characterChats, '')
  }, [chatIdOverride, characterChats])

  const selectedChat = useMemo(
    () => characterChats.find((item) => item.file_id === selectedChatId) ?? null,
    [characterChats, selectedChatId],
  )

  useEffect(() => {
    selectedCharacterAvatarRef.current = selectedCharacterAvatar ?? ''
    selectedChatIdRef.current = selectedChatId
  }, [selectedCharacterAvatar, selectedChatId])

  const setChatOverrideForAvatar = useCallback((avatar: string, fileId: string | null) => {
    if (!avatar) return
    setChatSelectionByAvatar((current) => {
      if ((current[avatar] ?? null) === fileId) {
        return current
      }
      return {
        ...current,
        [avatar]: fileId,
      }
    })
  }, [setChatSelectionByAvatar])

  const chatQuery = useChatQuery({
    avatarUrl: selectedCharacterAvatar,
    fileName: selectedChatId,
    enabled: isAuthenticated && Boolean(selectedChatId),
  })

  const chatMessages = useMemo(() => chatQuery.data ?? [], [chatQuery.data])
  const starterTranscript = useMemo(() => {
    if (!selectedCharacter) return []
    return createInitialChatTranscript(selectedCharacter)
  }, [selectedCharacter])
  const activeChatSource = useMemo(
    () => {
      if (pendingTranscript) return pendingTranscript
      if (chatMessages.length > 0) return chatMessages
      if (starterTranscript.length > 0 && (!selectedChatId || !selectedChat)) {
        return starterTranscript
      }
      return chatMessages
    },
    [chatMessages, pendingTranscript, selectedChat, selectedChatId, starterTranscript],
  )

  const chatMetadata = useMemo(() => {
    const first = activeChatSource[0]
    if (first && first.chat_metadata && typeof first.chat_metadata === 'object') {
      return first.chat_metadata
    }
    return null
  }, [activeChatSource])

  const transcriptView = useMemo(() => {
    const messages: ChatMessage[] = []
    const sourceIndexes: number[] = []
    activeChatSource.forEach((message, index) => {
      if (index === 0 && message.chat_metadata && !getMessageText(message)) {
        return
      }
      if (!getMessageText(message) && !message.name && !message.send_date) {
        return
      }
      messages.push(message)
      sourceIndexes.push(index)
    })
    return { messages, sourceIndexes }
  }, [activeChatSource])

  const transcriptMessages = transcriptView.messages
  const transcriptSourceIndexes = transcriptView.sourceIndexes

  const draftAuthorName = useMemo(() => {
    const name = settings?.settings.username
    if (typeof name === 'string' && name.trim()) return name.trim()
    return auth?.currentUser?.name ?? 'User'
  }, [auth?.currentUser?.name, settings])

  const chatsError = characterChatsQuery.error ? toErrorMessage(characterChatsQuery.error) : null
  const chatError = chatQuery.error ? toErrorMessage(chatQuery.error) : null
  const chatsLoading = characterChatsQuery.isPending && characterChatsQuery.fetchStatus !== 'idle'
  const chatLoading = chatQuery.isPending && chatQuery.fetchStatus !== 'idle'

  const currentUserLabel = auth?.currentUser
    ? auth.currentUser.name?.trim() || auth.currentUser.handle?.trim() || auth.backend.serverVersion
    : auth?.backend.serverVersion || 'Tauri'

  const workspaceError = saveError ?? chatError ?? chatsError ?? appError

  // ── Handlers ──

  const handleLoginSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!auth) return
      try {
        await loginMutation.mutateAsync({
          csrfToken: auth.csrfToken,
          handle: auth.currentUser?.handle ?? 'tauri',
          password: '',
        })
        setSection('workbench')
      } catch { /* swallow */ }
    },
    [auth, loginMutation],
  )

  const persistChatTranscriptForCharacter = useCallback(
    async (
      character: NonNullable<typeof selectedCharacter>,
      avatar: string,
      nextChatMessages: ChatMessage[],
      fileName: string,
    ) => {
      if (!character || !avatar) return false
      const persistedChat = buildPersistedChat(nextChatMessages)
      const selectionSnapshot = {
        avatar: selectedCharacterAvatarRef.current,
        chatId: selectedChatIdRef.current,
      }
      try {
        setSaveError(null)
        setSaveErrorTitle(null)
        setSaveState('idle')
        await saveChatMutation.mutateAsync({
          avatarUrl: avatar,
          characterName: getCharacterName(character),
          chat: persistedChat,
          csrfToken,
          fileName,
        })
        const selectionUnchanged =
          selectedCharacterAvatarRef.current === selectionSnapshot.avatar
          && selectedChatIdRef.current === selectionSnapshot.chatId
        if (selectionUnchanged) {
          setAvatarOverride(avatar)
          setChatOverrideForAvatar(avatar, fileName)
          setPendingTranscript(null)
        }
        setSaveState('saved')
        return true
      } catch (cause) {
        setSaveState('idle')
        if (cause instanceof ChatIntegrityError) {
          setSaveError(t('workbench.errors.chatIntegrity'))
          setSaveErrorTitle(t('chatTranscript.errors.saveTitle'))
        } else {
          setSaveError(toErrorMessage(cause))
          setSaveErrorTitle(t('chatTranscript.errors.saveTitle'))
        }
        return false
      }
    },
    [csrfToken, saveChatMutation, t],
  )

  const persistChatTranscript = useCallback(
    async (nextChatMessages: ChatMessage[], fileName: string) => {
      if (!selectedCharacter || !selectedCharacterAvatar) return false
      return persistChatTranscriptForCharacter(selectedCharacter, selectedCharacterAvatar, nextChatMessages, fileName)
    },
    [persistChatTranscriptForCharacter, selectedCharacter, selectedCharacterAvatar],
  )

  const queueNarrativeMemoryExtraction = useCallback(
    (nextChatMessages: ChatMessage[], fileName: string) => {
      if (!selectedCharacter || !selectedCharacterAvatar || !settings) return
      if ((settings.settings.main_api ?? 'openai') !== 'openai') return

      const messages = buildChatCompletionMessages(
        selectedCharacter,
        nextChatMessages,
        draftAuthorName,
        settings.settings,
        [],
        [],
        [],
        [],
      )

      void extractNarrativeMemoryMutation.mutateAsync({
        csrfToken,
        messages,
        settings: settings.settings,
        traceContext: {
          avatarUrl: selectedCharacterAvatar,
          characterName: getCharacterName(selectedCharacter),
          fileName,
        },
      }).then(async (extraction) => {
        if (
          settings.settings.narrative_embedding_enabled !== true
          || extraction.candidate_memories.length === 0
        ) {
          return
        }

        const { fetchNarrativeMemoryCandidates, reviewNarrativeMemoryCandidate } = await import('@yggdrasil/api-client')
        const pendingCandidates = await fetchNarrativeMemoryCandidates({
          avatarUrl: selectedCharacterAvatar,
          csrfToken,
          fileName,
          limit: Math.max(extraction.candidate_memories.length * 2, 16),
        })

        if (pendingCandidates.length === 0) {
          return
        }

        await Promise.all(
          pendingCandidates.map((candidate) =>
            reviewNarrativeMemoryCandidate({
              action: 'approve',
              candidateId: candidate.id,
              csrfToken,
            }),
          ),
        )

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: narrativeMemoryCandidatesQueryKey(selectedCharacterAvatar, fileName),
          }),
          queryClient.invalidateQueries({
            queryKey: narrativeMemoriesQueryKey(selectedCharacterAvatar, fileName),
          }),
        ])
      }).catch(() => {
        // Narrative memory extraction is best-effort and should never interrupt chat flow.
      })
    },
    [
      csrfToken,
      draftAuthorName,
      extractNarrativeMemoryMutation,
      queryClient,
      selectedCharacter,
      selectedCharacterAvatar,
      settings,
    ],
  )

  const resolveNarrativeMemoriesForGeneration = useCallback(
    async (fileName: string, ...queryParts: Array<string | null | undefined>) => {
      if (!selectedCharacterAvatar || !csrfToken || !settings) {
        return {
          characterSnippets: [],
          directiveSnippets: [],
          lorebookSnippets: [],
          narrativeMemories: [],
          retrievalHits: [],
          sessionSnippets: [],
          worldStateSnippets: [],
        }
      }

      const query = queryParts
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join('\n')

      try {
        const { retrieveGenerationContext } = await import('@yggdrasil/api-client')
        const result = await retrieveGenerationContext({
          activeWorldNames: activeWorldDocuments.map((document) => document.name),
          avatarUrl: selectedCharacterAvatar,
          csrfToken,
          fileName,
          query,
          settings: settings.settings,
        })
        setLastGenerationContext({
          ...result,
          query,
        })
        return result
      } catch {
        setLastGenerationContext(null)
        return {
          characterSnippets: [],
          directiveSnippets: [],
          lorebookSnippets: [],
          narrativeMemories: [],
          retrievalHits: [],
          sessionSnippets: [],
          worldStateSnippets: [],
        }
      }
    },
    [activeWorldDocuments, csrfToken, selectedCharacterAvatar, settings],
  )

  const resolveSessionSummariesForGeneration = useCallback(
    async (fileName: string): Promise<SessionSummary[]> => {
      if (!selectedCharacterAvatar || !csrfToken || !fileName) {
        return []
      }

      try {
        const { fetchSessionSummaries } = await import('@yggdrasil/api-client')
        return await fetchSessionSummaries({
          avatarUrl: selectedCharacterAvatar,
          csrfToken,
          fileName,
        })
      } catch {
        return []
      }
    },
    [csrfToken, selectedCharacterAvatar],
  )

  const buildAssembledGenerationPayload = useCallback(
    (
      baseChat: ChatMessage[],
      generationContext: GenerationContextResult,
      sessionSummaries: SessionSummary[],
    ) => {
      if (!selectedCharacter || !settings) {
        return null
      }

      const assembled = assembleGenerationContext({
        character: selectedCharacter,
        directiveSnippets: generationContext.directiveSnippets,
        lorebookSnippets: generationContext.lorebookSnippets,
        narrativeMemories: generationContext.narrativeMemories,
        sessionSnippets: generationContext.sessionSnippets,
        sessionSummaries,
        settings: settings.settings,
        transcript: baseChat,
        userName: draftAuthorName,
        worldStateSnippets: generationContext.worldStateSnippets,
      })

      return {
        assembled,
        messages: buildChatCompletionMessagesFromAssembly(assembled),
        prompt: buildTextPromptFromAssembly(
          assembled,
          getCharacterName(selectedCharacter),
          draftAuthorName,
        ),
      }
    },
    [draftAuthorName, selectedCharacter, settings],
  )

  const refreshSessionSummary = useCallback(
    async (chatMessages: ChatMessage[], fileName: string, options?: { force?: boolean }) => {
      if (!selectedCharacter || !selectedCharacterAvatar || !settings || !fileName) return
      if ((settings.settings.main_api ?? 'openai') !== 'openai') return

      const meaningfulMessages = chatMessages.filter((message, index) => {
        if (index === 0 && message.chat_metadata) {
          return false
        }

        return Boolean(getMessageText(message).trim())
      })
      const sessionSummaryMinMessages = resolveSessionSummaryMinMessages(settings.settings)
      const sessionSummaryRefreshIntervalMs = resolveSessionSummaryRefreshIntervalMs(settings.settings)
      const sessionSummarySourceWindow = resolveSessionSummarySourceWindow(settings.settings)

      if (meaningfulMessages.length < sessionSummaryMinMessages) {
        return
      }

      const now = Date.now()
      const lastRefreshedAt = sessionSummaryRefreshAtRef.current[fileName] ?? 0
      if (!options?.force && now - lastRefreshedAt < sessionSummaryRefreshIntervalMs) {
        return
      }
      sessionSummaryRefreshAtRef.current[fileName] = now

      try {
        const recentWindow = meaningfulMessages.slice(-sessionSummarySourceWindow)
        const sourceSignature = buildSessionSummarySourceSignature(
          recentWindow,
          draftAuthorName,
          getCharacterName(selectedCharacter),
          sessionSummarySourceWindow,
        )
        const transcriptBlock = recentWindow
          .map((message) => {
            const speaker = message.is_user ? draftAuthorName : message.name || getCharacterName(selectedCharacter)
            return `${speaker}: ${getMessageText(message).trim()}`
          })
          .join('\n')

        const sessionSummaries = await resolveSessionSummariesForGeneration(fileName)
        const existingByKind = new Map(sessionSummaries.map((item) => [item.summaryKind, item]))
        const hasFreshCompleteSummarySet =
          SESSION_SUMMARY_KINDS.every((summaryKind) => {
            const existing = existingByKind.get(summaryKind)
            return Boolean(
              existing
              && existing.sourceSignature === sourceSignature
              && (existing.sourceMessageEnd ?? 0) >= meaningfulMessages.length,
            )
          })

        if (!options?.force && hasFreshCompleteSummarySet) {
          return
        }

        const summaryMessages = buildChatCompletionMessages(
          selectedCharacter,
          [{ chat_metadata: { integrity: 'summary-refresh' } }, ...recentWindow],
          draftAuthorName,
          settings.settings,
          [],
          [],
          [],
          [],
          sessionSummaries.filter((item) => item.summaryKind !== 'session'),
        )

        const { generateChatReply, saveSessionSummary } = await import('@yggdrasil/api-client')
        const summaryReply = await generateChatReply({
          csrfToken,
          messages: [
            ...summaryMessages,
            {
              role: 'user',
              content: [
                'Summarize the current roleplay session for future context reuse.',
                'Return exactly four tagged sections using these markers and nothing else:',
                '[session]...[/session]',
                '[scene]...[/scene]',
                '[relationship]...[/relationship]',
                '[open_loops]...[/open_loops]',
                'Each section must be concise plain text, under 120 words, and contain no roleplay dialogue.',
                'Capture: overall session state, current scene, relationship movement, and unresolved threads.',
                `Conversation snapshot:\n${transcriptBlock || '[empty]'}`,
              ].join('\n\n'),
            },
          ],
          settings: settings.settings,
          taskKind: 'summarize_memory',
          traceContext: {
            avatarUrl: selectedCharacterAvatar,
            characterName: getCharacterName(selectedCharacter),
            fileName,
          },
        })

        const parsedSummaries = parseGeneratedSessionSummaryBundle(summaryReply)
        if (parsedSummaries.length === 0) {
          return
        }

        await Promise.all(
          parsedSummaries.map((entry) =>
            saveSessionSummary({
              avatarUrl: selectedCharacterAvatar,
              content: entry.content,
              csrfToken,
              fileName,
              id: existingByKind.get(entry.summaryKind)?.id,
              sourceSignature,
              sourceMessageEnd: meaningfulMessages.length,
              sourceMessageStart: Math.max(1, meaningfulMessages.length - recentWindow.length + 1),
              summaryKind: entry.summaryKind,
            }),
          ),
        )
        await queryClient.invalidateQueries({
          queryKey: sessionSummariesQueryKey(selectedCharacterAvatar, fileName),
        })
      } catch {
        delete sessionSummaryRefreshAtRef.current[fileName]
      }
    },
    [
      csrfToken,
      draftAuthorName,
      queryClient,
      resolveSessionSummariesForGeneration,
      selectedCharacter,
      selectedCharacterAvatar,
      settings,
    ],
  )

  const handleRefreshGenerationContextSnapshot = useCallback(async () => {
    if (!selectedChatId) {
      setLastGenerationContext(null)
      return null
    }

    const query = lastGenerationContext?.query ?? ''
    const result = await resolveNarrativeMemoriesForGeneration(selectedChatId, query)
    return {
      ...result,
      query,
    }
  }, [lastGenerationContext?.query, resolveNarrativeMemoriesForGeneration, selectedChatId])

  const handleRefreshSessionSummary = useCallback(async () => {
    if (!selectedChatId) return
    await refreshSessionSummary(transcriptMessages, selectedChatId, { force: true })
  }, [refreshSessionSummary, selectedChatId, transcriptMessages])

  const buildTraceContext = useCallback(
    (
      fileName: string | undefined,
      generationContext?: {
        characterSnippets: GenerationContextResult['characterSnippets']
        contextBudget?: TraceContextBudgetDebug
        directiveSnippets: GenerationContextResult['directiveSnippets']
        lorebookSnippets: GenerationContextResult['lorebookSnippets']
        narrativeMemories: GenerationContextResult['narrativeMemories']
        retrievalHits: GenerationContextResult['retrievalHits']
        sessionSnippets: GenerationContextResult['sessionSnippets']
        worldStateSnippets: GenerationContextResult['worldStateSnippets']
        query?: string
      },
    ) => ({
      avatarUrl: selectedCharacterAvatar || undefined,
      characterName: selectedCharacter ? getCharacterName(selectedCharacter) : undefined,
      fileName,
      generationContext: generationContext
        ? {
            characterSnippets: generationContext.characterSnippets,
            contextBudget: generationContext.contextBudget,
            directiveSnippets: generationContext.directiveSnippets,
            lorebookSnippets: generationContext.lorebookSnippets,
            narrativeMemories: generationContext.narrativeMemories,
            query: generationContext.query ?? '',
            retrievalHits: generationContext.retrievalHits,
            sessionSnippets: generationContext.sessionSnippets,
            worldStateSnippets: generationContext.worldStateSnippets,
          }
        : undefined,
    }),
    [selectedCharacter, selectedCharacterAvatar],
  )

  const handleGenerateStructuredInsight = useCallback(
    async (kind: StructuredInsightKind) => {
      if (!selectedCharacter || !settings || actionPending) return

      const targetChatId = selectedChatId || ''
      const transcriptText = transcriptMessages
        .slice(-10)
        .map((message) => {
          const speaker = message.is_user ? draftAuthorName : message.name || getCharacterName(selectedCharacter)
          const content = getMessageText(message).trim()
          return content ? `${speaker}: ${content}` : ''
        })
        .filter(Boolean)
        .join('\n')

      const instructionMap: Record<StructuredInsightKind, string> = {
        story_suggestion: [
          'Analyze the current roleplay session and propose the strongest next scene.',
          'Focus on momentum, unresolved hooks, conflict escalation, goals, and risks.',
          'Explicitly list unresolved conflicts that should carry into the next scene.',
          'Return structured output only.',
        ].join('\n'),
        relationship_delta: [
          'Analyze the current roleplay session and detect meaningful relationship changes between actors.',
          'Only include changes justified by explicit dialogue, decisions, or revealed intentions.',
          'For each change, include the most important next implication for future scenes.',
          'Return structured output only.',
        ].join('\n'),
        world_state_update: [
          'Analyze the current roleplay session and extract concrete persistent world-state changes.',
          'Focus on entities, locations, factions, items, conditions, and status transitions.',
          'For each state update, set scope to one of: location, faction, relationship, quest, inventory_item, scene_state.',
          'Return structured output only.',
        ].join('\n'),
      }

      const retrievalQueryMap: Record<StructuredInsightKind, string> = {
        story_suggestion: `Next scene planning\n${transcriptText}`,
        relationship_delta: `Relationship changes\n${transcriptText}`,
        world_state_update: `World state changes\n${transcriptText}`,
      }

      try {
        setStructuredInsightPending(kind)
        setStructuredInsight(null)
        setSaveError(null)
        setSaveErrorTitle(null)

        const generationContext = await resolveNarrativeMemoriesForGeneration(
          targetChatId,
          retrievalQueryMap[kind],
          instructionMap[kind],
        )

        const messages = [
          ...buildChatCompletionMessages(
            selectedCharacter,
            activeChatSource,
            draftAuthorName,
            settings.settings,
            generationContext.lorebookSnippets,
            generationContext.narrativeMemories,
            generationContext.directiveSnippets,
            generationContext.worldStateSnippets,
          ),
          {
            role: 'user' as const,
            content: `${instructionMap[kind]}\n\nConversation snapshot:\n${transcriptText || '[empty]'}`,
          },
        ]

        const { generateStructuredOutput } = await import('@yggdrasil/api-client')
        const raw = await generateStructuredOutput({
          csrfToken,
          messages,
          schemaId: kind,
          settings: settings.settings,
          traceContext: buildTraceContext(selectedChatId || undefined, {
            ...generationContext,
            query: retrievalQueryMap[kind],
          }),
        })

        const nextInsight = {
          generatedAt: Date.now(),
          kind,
          payload: JSON.parse(raw) as Record<string, unknown>,
        }
        setStructuredInsight(nextInsight)

        if (kind === 'world_state_update' && autoApplyWorldState) {
          const updates = normalizeWorldStateUpdates(nextInsight.payload)
          if (updates.length > 0) {
            setStructuredInsightApplying(true)
            try {
              const { applyWorldStateUpdates } = await import('@yggdrasil/api-client')
              await applyWorldStateUpdates({
                avatarUrl: selectedCharacterAvatar || undefined,
                csrfToken,
                fileName: targetChatId || undefined,
                updates,
              })
              void queryClient.invalidateQueries({
                queryKey: worldStateSnapshotQueryKey(selectedCharacterAvatar || undefined, targetChatId || undefined),
              })
              toast.success(t('inspector.director.applied'))
            } finally {
              setStructuredInsightApplying(false)
            }
          }
        }
      } catch (cause) {
        setSaveError(toErrorMessage(cause))
        setSaveErrorTitle(t('workbench.errors.generateFailedTitle'))
      } finally {
        setStructuredInsightPending(null)
      }
    },
    [
      actionPending,
      activeChatSource,
      autoApplyWorldState,
      buildTraceContext,
      csrfToken,
      draftAuthorName,
      queryClient,
      resolveNarrativeMemoriesForGeneration,
      selectedCharacter,
      selectedCharacterAvatar,
      selectedChatId,
      settings,
      t,
      transcriptMessages,
    ],
  )

  const handleApplyStructuredInsight = useCallback(async () => {
    if (
      structuredInsight?.kind !== 'world_state_update'
      || !selectedCharacterAvatar
      || !selectedChatId
      || structuredInsightApplying
    ) {
      return
    }

    const updates = normalizeWorldStateUpdates(structuredInsight.payload)
    if (updates.length === 0) {
      toast.error(t('inspector.director.noApplicableStateUpdates'))
      return
    }

    try {
      setStructuredInsightApplying(true)
      setSaveError(null)
      setSaveErrorTitle(null)
      const { applyWorldStateUpdates } = await import('@yggdrasil/api-client')
      await applyWorldStateUpdates({
        avatarUrl: selectedCharacterAvatar,
        csrfToken,
        fileName: selectedChatId,
        updates,
      })
      void queryClient.invalidateQueries({
        queryKey: worldStateSnapshotQueryKey(selectedCharacterAvatar, selectedChatId),
      })
      toast.success(t('inspector.director.applied'))
    } catch (cause) {
      setSaveError(toErrorMessage(cause))
      setSaveErrorTitle(t('workbench.errors.generateFailedTitle'))
    } finally {
      setStructuredInsightApplying(false)
    }
  }, [
    csrfToken,
    queryClient,
    selectedCharacterAvatar,
    selectedChatId,
    structuredInsight,
    structuredInsightApplying,
    t,
  ])

  const handleClearStructuredInsight = useCallback(() => {
    setStructuredInsight(null)
  }, [])

  const handleCreateChatClick = useCallback(async () => {
    if (actionPending) return

    const targetCharacter = selectedCharacter ?? sortedCharacters[0] ?? null
    const targetAvatar = typeof targetCharacter?.avatar === 'string' ? targetCharacter.avatar : ''
    if (!targetCharacter || !targetAvatar) return

    const nextChatId = createChatFileName(targetCharacter)
    const nextChat = createInitialChatTranscript(targetCharacter)
    setDraftMessage('')
    setPendingTranscript(nextChat)
    setSaveState('idle')
    await runWithActionLock(() =>
      persistChatTranscriptForCharacter(targetCharacter, targetAvatar, nextChat, nextChatId),
    )
  }, [actionPending, persistChatTranscriptForCharacter, runWithActionLock, selectedCharacter, sortedCharacters])

  const handleSaveCurrentChatClick = useCallback(async () => {
    if (!selectedChatId || chatMessages.length === 0 || actionPending) return
    await runWithActionLock(() => persistChatTranscript(chatMessages, selectedChatId))
  }, [actionPending, chatMessages, persistChatTranscript, runWithActionLock, selectedChatId])

  const handleDraftSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!selectedCharacter || !settings || actionPending) return
      const nextDraft = draftMessage.trim()
      if (!nextDraft) return

      const targetChatId = selectedChatId || createChatFileName(selectedCharacter)
      const baseChat = selectedChatId ? chatMessages : createInitialChatTranscript(selectedCharacter)
      const nextChat = [...baseChat, createUserChatMessage(draftAuthorName, nextDraft)]
      const pendingAssistantMessage = createAssistantChatMessage(
        getCharacterName(selectedCharacter),
        t('workbench.pending.generatingReply'),
      )
      const pendingMessages = [...nextChat, pendingAssistantMessage]
      const pendingAssistantIndex = pendingMessages.length - 1

      await runWithActionLock(async () => {
        try {
          setSaveError(null)
          setSaveErrorTitle(null)
          setSaveState('idle')
          setDraftMessage('')
          setPendingTranscript(pendingMessages)
          const generationContext = await resolveNarrativeMemoriesForGeneration(
            targetChatId,
            nextDraft,
            getMessageText(nextChat.at(-2) ?? {}),
          )
          const sessionSummaries = await resolveSessionSummariesForGeneration(targetChatId)
          const generationPayload = buildAssembledGenerationPayload(
            nextChat,
            generationContext,
            sessionSummaries,
          )
          if (!generationPayload) {
            throw new Error('当前无法构建生成上下文。')
          }
          const traceAssemblyBudget = buildTraceAssemblyBudget(generationPayload.assembled)
          const traceContext = buildTraceContext(targetChatId, {
            ...generationContext,
            contextBudget: traceAssemblyBudget,
            query: [nextDraft, getMessageText(nextChat.at(-2) ?? {})].filter(Boolean).join('\n'),
          })
          setLastGenerationContext({
            ...generationContext,
            assemblyBudget: traceAssemblyBudget,
            query: [nextDraft, getMessageText(nextChat.at(-2) ?? {})].filter(Boolean).join('\n'),
            recentMessagesKept: generationPayload.assembled.debug.recentMessagesKept,
            summaryKindsUsed: generationPayload.assembled.debug.summaryKindsUsed,
          })
          const rawReply = await requestAssistantReply({
            csrfToken,
            messages: generationPayload.messages,
            prompt: generationPayload.prompt.prompt,
            settings: settings.settings,
            stopSequences: generationPayload.prompt.stopSequences,
            traceContext,
          }, (streamedReply) => {
            setPendingTranscript(
              updateChatMessageText(pendingMessages, pendingAssistantIndex, streamedReply),
            )
          })
          const reply = normalizeAssistantReplyText(rawReply, settings.settings)
          const finalChat = updateChatMessageText(pendingMessages, pendingAssistantIndex, reply)
          const didSave = await persistChatTranscript(finalChat, targetChatId)
          if (!didSave) {
            setDraftMessage(nextDraft)
          } else {
            queueNarrativeMemoryExtraction(finalChat, targetChatId)
            void refreshSessionSummary(finalChat, targetChatId)
          }
        } catch (cause) {
          setDraftMessage(nextDraft)
          setPendingTranscript(null)
          setSaveState('idle')
          setSaveError(toErrorMessage(cause))
          setSaveErrorTitle(t('workbench.errors.generateFailedTitle'))
        }
      })
    },
    [actionPending, buildTraceContext, chatMessages, csrfToken, draftAuthorName, draftMessage, persistChatTranscript, queueNarrativeMemoryExtraction, refreshSessionSummary, requestAssistantReply, resolveNarrativeMemoriesForGeneration, runWithActionLock, selectedCharacter, selectedChatId, settings, t],
  )

  const handleAssistDraft = useCallback(async () => {
    if (!selectedCharacter || !settings || actionPending) return

    const baseChat = selectedChatId ? activeChatSource : createInitialChatTranscript(selectedCharacter)

    await runWithActionLock(async () => {
      try {
        setSaveError(null)
        setSaveErrorTitle(null)
        setSaveState('idle')
        const retrievalQuery = buildDraftAssistRetrievalQuery(
          baseChat,
          draftAuthorName,
          getCharacterName(selectedCharacter),
          draftMessage,
        )
        const generationContext = await resolveNarrativeMemoriesForGeneration(
          selectedChatId || '',
          retrievalQuery,
        )
        const sessionSummaries = await resolveSessionSummariesForGeneration(selectedChatId || '')
          const request = buildDraftAssistRequest({
            appSettings: settings.settings,
            authorName: draftAuthorName,
            baseChat,
            character: selectedCharacter,
          draftMessage,
          generationContext,
          mode: draftAssistMode,
          sessionSummaries,
        })
        const traceContext = buildTraceContext(selectedChatId || undefined, {
          ...generationContext,
          query: request.traceQuery,
        })
        const reply = await requestAssistantReply({
          csrfToken,
          messages: request.messages,
          prompt: request.prompt,
          settings: settings.settings,
          taskKind: 'draft_assist',
          stopSequences: request.stopSequences,
          traceContext,
        }, (streamedReply) => {
          setDraftMessage(sanitizeDraftSuggestion(streamedReply, draftAuthorName))
        })
        const nextDraft = sanitizeDraftSuggestion(reply, draftAuthorName)
        setDraftMessage(nextDraft)
        toast.success(t('workbench.feedback.draftSuggested'))
      } catch (cause) {
        setSaveError(toErrorMessage(cause))
        setSaveErrorTitle(t('workbench.errors.draftAssistFailedTitle'))
        toast.error(cause instanceof Error ? cause.message : t('workbench.feedback.draftSuggestFailed'))
      }
    })
  }, [
    actionPending,
    activeChatSource,
    buildTraceContext,
    csrfToken,
    draftAssistMode,
    draftAuthorName,
    draftMessage,
    resolveNarrativeMemoriesForGeneration,
    requestAssistantReply,
    runWithActionLock,
    selectedCharacter,
    selectedChatId,
    settings,
    t,
  ])

  const handleSelectCharacter = useCallback((avatar: string) => {
    setAvatarOverride(avatar)
    setPendingTranscript(null)
    setSaveError(null)
    setSaveErrorTitle(null)
    setDraftMessage('')
    setSaveState('idle')
    setSection('workbench')
    setSessionNameDialog(null)
    setLastGenerationContext(null)
    setStructuredInsight(null)
  }, [])

  const handleHighlightCharacter = useCallback((avatar: string) => {
    setAvatarOverride(avatar)
    setPendingTranscript(null)
    setSaveError(null)
    setSaveErrorTitle(null)
    setDraftMessage('')
    setSaveState('idle')
    setSessionNameDialog(null)
    setLastGenerationContext(null)
    setStructuredInsight(null)
    if (section === 'characters') {
      openSectionWith('characters', { avatar })
    }
  }, [openSectionWith, section])

  const handleSelectChat = useCallback((fileId: string) => {
    if (selectedCharacterAvatar) {
      setChatOverrideForAvatar(selectedCharacterAvatar, fileId)
    }
    setPendingTranscript(null)
    setSaveError(null)
    setSaveErrorTitle(null)
    setDraftMessage('')
    setSaveState('idle')
    setSessionNameDialog(null)
    setLastGenerationContext(null)
    setStructuredInsight(null)
  }, [selectedCharacterAvatar, setChatOverrideForAvatar])

  const handleRestoreSession = useCallback((avatar: string, fileId: string) => {
    setAvatarOverride(avatar)
    setChatOverrideForAvatar(avatar, fileId)
    setPendingTranscript(null)
    setSaveError(null)
    setSaveErrorTitle(null)
    setDraftMessage('')
    setSaveState('idle')
    setSection('workbench')
    setSessionNameDialog(null)
    setLastGenerationContext(null)
    setStructuredInsight(null)
  }, [setChatOverrideForAvatar])

  const runDeleteChat = useCallback(
    async (avatarUrl: string, fileId: string) => {
      if (!avatarUrl || !fileId || actionPending) return
      await runWithActionLock(async () => {
        try {
          setSaveError(null)
          setSaveErrorTitle(null)
          await deleteChatMutation.mutateAsync({
            avatarUrl,
            csrfToken,
            fileName: fileId,
          })

          if (avatarUrl === selectedCharacterAvatar && (chatIdOverride === fileId || selectedChatId === fileId)) {
            const remainingChats = characterChats.filter((item) => item.file_id !== fileId)
            setChatOverrideForAvatar(avatarUrl, remainingChats[0]?.file_id ?? null)
            setPendingTranscript(null)
          }
        } catch (cause) {
          setSaveError(toErrorMessage(cause))
          setSaveErrorTitle(t('workbench.errors.deleteFailedTitle'))
        }
      })
    },
    [actionPending, characterChats, chatIdOverride, csrfToken, deleteChatMutation, runWithActionLock, selectedCharacterAvatar, selectedChatId, setChatOverrideForAvatar, t],
  )

  const runRenameChat = useCallback(
    async (avatarUrl: string, fileId: string, nextName: string) => {
      if (!avatarUrl || !fileId || actionPending) return
      const trimmedName = nextName.trim()
      if (!trimmedName || trimmedName === fileId) return

      await runWithActionLock(async () => {
        try {
          setSaveError(null)
          setSaveErrorTitle(null)
          await renameChatMutation.mutateAsync({
            avatarUrl,
            csrfToken,
            fileName: fileId,
            nextFileName: trimmedName,
          })
          if (avatarUrl === selectedCharacterAvatar && (chatIdOverride === fileId || selectedChatId === fileId)) {
            setChatOverrideForAvatar(avatarUrl, trimmedName)
          }
          setSessionNameDialog(null)
        } catch (cause) {
          setSaveError(toErrorMessage(cause))
          setSaveErrorTitle(t('workbench.errors.renameFailedTitle'))
        }
      })
    },
    [actionPending, chatIdOverride, csrfToken, renameChatMutation, runWithActionLock, selectedCharacterAvatar, selectedChatId, setChatOverrideForAvatar, t],
  )

  const runDuplicateChat = useCallback(
    async (avatarUrl: string, fileId: string, nextName: string) => {
      if (!avatarUrl || !fileId || actionPending) return
      const trimmedName = nextName.trim()
      if (!trimmedName) return

      await runWithActionLock(async () => {
        try {
          setSaveError(null)
          setSaveErrorTitle(null)
          await duplicateChatMutation.mutateAsync({
            avatarUrl,
            csrfToken,
            fileName: fileId,
            nextFileName: trimmedName,
          })
          if (avatarUrl === selectedCharacterAvatar) {
            setChatOverrideForAvatar(avatarUrl, trimmedName)
          }
          setSessionNameDialog(null)
        } catch (cause) {
          setSaveError(toErrorMessage(cause))
          setSaveErrorTitle(t('workbench.errors.duplicateFailedTitle'))
        }
      })
    },
    [actionPending, csrfToken, duplicateChatMutation, runWithActionLock, selectedCharacterAvatar, setChatOverrideForAvatar, t],
  )

  const handleDeleteChat = useCallback(
    async (fileId: string) => {
      if (!selectedCharacterAvatar) return
      await runDeleteChat(selectedCharacterAvatar, fileId)
    },
    [runDeleteChat, selectedCharacterAvatar],
  )

  const handleRenameChat = useCallback(
    async (fileId: string) => {
      if (!selectedCharacterAvatar) return
      setSessionNameDialog({
        avatarUrl: selectedCharacterAvatar,
        fileId,
        initialValue: fileId,
        mode: 'rename',
      })
    },
    [selectedCharacterAvatar],
  )

  const handleDuplicateChat = useCallback(
    async (fileId: string) => {
      if (!selectedCharacterAvatar) return
      setSessionNameDialog({
        avatarUrl: selectedCharacterAvatar,
        fileId,
        initialValue: t('sectionBrowser.dialogs.copySuffix', { name: fileId }),
        mode: 'duplicate',
      })
    },
    [selectedCharacterAvatar],
  )

  const handleRenameSession = useCallback((avatarUrl: string, fileId: string, nextName?: string) => {
    setSessionNameDialog({
      avatarUrl,
      fileId,
      initialValue: nextName?.trim() || fileId,
      mode: 'rename',
    })
  }, [])

  const handleDuplicateSession = useCallback((avatarUrl: string, fileId: string, nextName?: string) => {
    setSessionNameDialog({
      avatarUrl,
      fileId,
      initialValue: nextName?.trim() || t('sectionBrowser.dialogs.copySuffix', { name: fileId }),
      mode: 'duplicate',
    })
  }, [t])

  const handleSessionNameDialogConfirm = useCallback(
    async (nextName: string) => {
      if (!sessionNameDialog) return
      if (sessionNameDialog.mode === 'rename') {
        await runRenameChat(sessionNameDialog.avatarUrl, sessionNameDialog.fileId, nextName)
        return
      }
      await runDuplicateChat(sessionNameDialog.avatarUrl, sessionNameDialog.fileId, nextName)
    },
    [runDuplicateChat, runRenameChat, sessionNameDialog],
  )

  const resolveVisibleSourceIndex = useCallback(
    (visibleIndex: number) => transcriptSourceIndexes[visibleIndex] ?? -1,
    [transcriptSourceIndexes],
  )

  const generateAssistantReplyForTranscript = useCallback(
    async (
      baseChat: ChatMessage[],
      targetChatId: string,
      pendingText: string,
      failureTitle: string,
    ) => {
      if (!selectedCharacter || !settings || actionPending) return

      const pendingMessages = [
        ...baseChat,
        createAssistantChatMessage(getCharacterName(selectedCharacter), pendingText),
      ]
      const pendingAssistantIndex = pendingMessages.length - 1

      await runWithActionLock(async () => {
        try {
          setSaveError(null)
          setSaveErrorTitle(null)
          setSaveState('idle')
          setPendingTranscript(pendingMessages)
          const retrievalQuery = buildReplyRetrievalQuery(
            baseChat,
            draftAuthorName,
            getCharacterName(selectedCharacter),
          )
          const generationContext = await resolveNarrativeMemoriesForGeneration(
            targetChatId,
            retrievalQuery,
          )
          const sessionSummaries = await resolveSessionSummariesForGeneration(targetChatId)
          const generationPayload = buildAssembledGenerationPayload(
            baseChat,
            generationContext,
            sessionSummaries,
          )
          if (!generationPayload) {
            throw new Error('当前无法构建生成上下文。')
          }
          const traceAssemblyBudget = buildTraceAssemblyBudget(generationPayload.assembled)
          const traceContext = buildTraceContext(targetChatId, {
            ...generationContext,
            contextBudget: traceAssemblyBudget,
            query: retrievalQuery,
          })
          setLastGenerationContext({
            ...generationContext,
            assemblyBudget: traceAssemblyBudget,
            query: retrievalQuery,
            recentMessagesKept: generationPayload.assembled.debug.recentMessagesKept,
            summaryKindsUsed: generationPayload.assembled.debug.summaryKindsUsed,
          })
          const rawReply = await requestAssistantReply({
            csrfToken,
            messages: generationPayload.messages,
            prompt: generationPayload.prompt.prompt,
            settings: settings.settings,
            stopSequences: generationPayload.prompt.stopSequences,
            traceContext,
          }, (streamedReply) => {
            setPendingTranscript(
              updateChatMessageText(pendingMessages, pendingAssistantIndex, streamedReply),
            )
          })
          const reply = normalizeAssistantReplyText(rawReply, settings.settings)
          const finalChat = updateChatMessageText(pendingMessages, pendingAssistantIndex, reply)
          const didSave = await persistChatTranscript(finalChat, targetChatId)
          if (didSave) {
            queueNarrativeMemoryExtraction(finalChat, targetChatId)
            void refreshSessionSummary(finalChat, targetChatId)
          }
        } catch (cause) {
          setPendingTranscript(null)
          setSaveState('idle')
          setSaveError(toErrorMessage(cause))
          setSaveErrorTitle(failureTitle)
        }
      })
    },
    [
      actionPending,
      buildTraceContext,
      csrfToken,
      draftAuthorName,
      persistChatTranscript,
      queueNarrativeMemoryExtraction,
      refreshSessionSummary,
      requestAssistantReply,
      resolveNarrativeMemoriesForGeneration,
      runWithActionLock,
      selectedCharacter,
      settings,
    ],
  )

  const handleEditMessage = useCallback(
    async (visibleIndex: number, nextText: string) => {
      if (actionPending) return
      const sourceIndex = resolveVisibleSourceIndex(visibleIndex)
      if (sourceIndex < 0 || !selectedChatId) return
      const nextChat = updateChatMessageText(activeChatSource, sourceIndex, nextText)
      setPendingTranscript(nextChat)
      await runWithActionLock(() => persistChatTranscript(nextChat, selectedChatId))
    },
    [actionPending, activeChatSource, persistChatTranscript, resolveVisibleSourceIndex, runWithActionLock, selectedChatId],
  )

  const handleDeleteMessage = useCallback(
    async (visibleIndex: number) => {
      if (actionPending) return
      const sourceIndex = resolveVisibleSourceIndex(visibleIndex)
      if (sourceIndex < 0 || !selectedChatId) return
      const nextChat = removeChatMessage(activeChatSource, sourceIndex)
      setPendingTranscript(nextChat)
      await runWithActionLock(() => persistChatTranscript(nextChat, selectedChatId))
    },
    [actionPending, activeChatSource, persistChatTranscript, resolveVisibleSourceIndex, runWithActionLock, selectedChatId],
  )

  const handleBranchMessage = useCallback(
    async (visibleIndex: number) => {
      if (actionPending) return
      if (!selectedCharacter) return
      const sourceIndex = resolveVisibleSourceIndex(visibleIndex)
      if (sourceIndex < 0) return
      const nextChatId = createChatFileName(selectedCharacter)
      const nextChat = truncateChatTranscript(activeChatSource, sourceIndex)
      setPendingTranscript(nextChat)
      await runWithActionLock(() => persistChatTranscript(nextChat, nextChatId))
    },
    [actionPending, activeChatSource, persistChatTranscript, resolveVisibleSourceIndex, runWithActionLock, selectedCharacter],
  )

  const handleRegenerateMessage = useCallback(
    async (visibleIndex: number) => {
      if (!selectedChatId) return
      const sourceIndex = resolveVisibleSourceIndex(visibleIndex)
      if (sourceIndex <= 0) return
      const nextChat = truncateChatTranscript(activeChatSource, sourceIndex - 1)
      await generateAssistantReplyForTranscript(
        nextChat,
        selectedChatId,
        t('workbench.pending.regeneratingReply'),
        t('workbench.errors.regenerateFailedTitle'),
      )
    },
    [
      activeChatSource,
      generateAssistantReplyForTranscript,
      resolveVisibleSourceIndex,
      selectedChatId,
      t,
    ],
  )

  const handleContinueMessage = useCallback(
    async (visibleIndex: number) => {
      if (!selectedChatId || !selectedCharacter || !settings || actionPending) return
      const sourceIndex = resolveVisibleSourceIndex(visibleIndex)
      if (sourceIndex < 0) return

      const targetMessage = activeChatSource[sourceIndex]
      if (!targetMessage || targetMessage.is_user || targetMessage.is_system) return

      const currentText = getMessageText(targetMessage).trim()
      if (!currentText) return

      const baseChat = truncateChatTranscript(activeChatSource, sourceIndex)
      const prompt = [
        `Continue the last reply from ${getCharacterName(selectedCharacter)} exactly where it stops.`,
        'Keep the same tone, perspective, and scene continuity.',
        'Return only the continuation text to append, without repeating the existing content, speaker labels, explanations, or quote marks.',
        `Current partial reply:\n${currentText}`,
      ].join('\n\n')

      await runWithActionLock(async () => {
        try {
          setSaveError(null)
          setSaveErrorTitle(null)
          setSaveState('idle')

          const pendingChat = updateChatMessageText(
            activeChatSource,
            sourceIndex,
            `${currentText}\n\n${t('workbench.pending.continuingReply')}`,
          )
          setPendingTranscript(pendingChat)
          const retrievalQuery = buildContinuationRetrievalQuery(
            baseChat,
            draftAuthorName,
            getCharacterName(selectedCharacter),
            currentText,
          )
          const generationContext = await resolveNarrativeMemoriesForGeneration(
            selectedChatId,
            retrievalQuery,
          )
          const sessionSummaries = await resolveSessionSummariesForGeneration(selectedChatId)
          const generationPayload = buildAssembledGenerationPayload(
            baseChat,
            generationContext,
            sessionSummaries,
          )
          if (!generationPayload) {
            throw new Error('当前无法构建生成上下文。')
          }

          const traceAssemblyBudget = buildTraceAssemblyBudget(generationPayload.assembled)
          const traceContext = buildTraceContext(selectedChatId, {
            ...generationContext,
            contextBudget: traceAssemblyBudget,
            query: retrievalQuery,
          })
          setLastGenerationContext({
            ...generationContext,
            assemblyBudget: traceAssemblyBudget,
            query: retrievalQuery,
            recentMessagesKept: generationPayload.assembled.debug.recentMessagesKept,
            summaryKindsUsed: generationPayload.assembled.debug.summaryKindsUsed,
          })
          const rawContinuation = await requestAssistantReply({
            csrfToken,
            messages: [
              ...generationPayload.messages,
              {
                role: 'user',
                content: prompt,
              },
            ],
            prompt: buildContinuationTextPrompt(
              generationPayload.prompt.prompt,
              prompt,
              getCharacterName(selectedCharacter),
              currentText,
            ),
            settings: settings.settings,
            stopSequences: [
              `\n${draftAuthorName}:`,
              `\n${getCharacterName(selectedCharacter)}:`,
            ],
            traceContext,
          }, (streamedReply) => {
            const appendedPreview = sanitizeContinuationText(streamedReply)
            const previewText = appendedPreview
              ? joinContinuedMessage(currentText, appendedPreview)
              : currentText
            setPendingTranscript(
              updateChatMessageText(activeChatSource, sourceIndex, previewText),
            )
          })

          const continuation = normalizeAssistantReplyText(rawContinuation, settings.settings)
          const appended = sanitizeContinuationText(continuation)
          if (!appended) {
            setPendingTranscript(null)
            return
          }

          const joined = joinContinuedMessage(currentText, appended)
          const nextChat = updateChatMessageText(activeChatSource, sourceIndex, joined)
          setPendingTranscript(nextChat)
          const didSave = await persistChatTranscript(nextChat, selectedChatId)
          if (didSave) {
            queueNarrativeMemoryExtraction(nextChat, selectedChatId)
            void refreshSessionSummary(nextChat, selectedChatId)
          }
        } catch (cause) {
          setPendingTranscript(null)
          setSaveState('idle')
          setSaveError(toErrorMessage(cause))
          setSaveErrorTitle(t('workbench.errors.continueFailedTitle'))
        }
      })
    },
    [
      actionPending,
      activeChatSource,
      buildTraceContext,
      csrfToken,
      draftAuthorName,
      persistChatTranscript,
      queueNarrativeMemoryExtraction,
      refreshSessionSummary,
      requestAssistantReply,
      resolveNarrativeMemoriesForGeneration,
      resolveVisibleSourceIndex,
      runWithActionLock,
      selectedCharacter,
      selectedChatId,
      settings,
      t,
    ],
  )

  const handleExportSession = useCallback(
    async (avatarUrl: string, fileId: string) => {
      if (!avatarUrl || !fileId) {
        toast.error(t('workbench.feedback.noSessionToExport'))
        return
      }

      try {
        const { exportChatTranscript } = await import('@yggdrasil/api-client')
        const exportPath = await exportChatTranscript({
          avatarUrl,
          csrfToken,
          fileName: fileId,
          format: 'jsonl',
        })
        toast.success(t('workbench.feedback.sessionExported', { path: exportPath }))
      } catch (cause) {
        toast.error(toErrorMessage(cause))
      }
    },
    [csrfToken],
  )

  const handleBranchCurrentChat = useCallback(async () => {
    if (transcriptMessages.length === 0) return
    await handleBranchMessage(transcriptMessages.length - 1)
  }, [handleBranchMessage, transcriptMessages.length])

  const handleExportCurrentChat = useCallback(async () => {
    if (!selectedCharacterAvatar || !selectedChatId) {
      toast.error(t('workbench.feedback.noSessionToExport'))
      return
    }
    await handleExportSession(selectedCharacterAvatar, selectedChatId)
  }, [handleExportSession, selectedCharacterAvatar, selectedChatId])

  const handleProviderChange = useCallback(
    (provider: string) => {
      if (!settings) return
      void saveSettingsMutation.mutateAsync({
        csrfToken,
        settings: { ...settings.settings, main_api: provider },
      })
    },
    [csrfToken, saveSettingsMutation, settings],
  )

  const handleModelChange = useCallback(
    (model: string) => {
      if (!settings) return
      void saveSettingsMutation.mutateAsync({
        csrfToken,
        settings: applyCurrentModelToSettings(settings.settings, model),
      })
    },
    [csrfToken, saveSettingsMutation, settings],
  )

  const handleSettingChange = useCallback(
    (key: string, value: unknown) => {
      if (!settings) return
      let nextSettings = settings.settings

      if (typeof value === 'number') {
        nextSettings = applyGenerationParameterToSettings(
          settings.settings,
          key as 'amount_gen' | 'freq_pen' | 'rep_pen' | 'temp' | 'top_p',
          value,
        )
      } else if (
        key === 'stream_openai'
        && typeof value === 'boolean'
      ) {
        nextSettings = applyOpenAiBehaviorToSettings(settings.settings, 'stream_openai', value)
      } else if (
        key === 'reasoning_effort_openai'
        && typeof value === 'string'
        && ['off', 'low', 'medium', 'high'].includes(value)
      ) {
        nextSettings = applyOpenAiBehaviorToSettings(
          settings.settings,
          'reasoning_effort_openai',
          value as 'off' | 'low' | 'medium' | 'high',
        )
      } else {
        return
      }

      void saveSettingsMutation.mutateAsync({
        csrfToken,
        settings: nextSettings,
      })
    },
    [csrfToken, saveSettingsMutation, settings],
  )

  const handleMaxOutputChange = useCallback(
    (value: number) => {
      if (!settings) return
      void saveSettingsMutation.mutateAsync({
        csrfToken,
        settings: applyGenerationParameterToSettings(settings.settings, 'amount_gen', value),
      })
    },
    [csrfToken, saveSettingsMutation, settings],
  )

  const handleImportCharacterFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileList = Array.from(files)
      if (fileList.length === 0) {
        return
      }

      let importedCount = 0
      for (const file of fileList) {
        try {
          const draft = await importCharacterFile(file)
          const saved = await saveCharacterMutation.mutateAsync({
            csrfToken,
            ...draft,
          })
          clearTauriAvatarSrcCache(String(saved.avatar ?? ''))
          if (typeof saved.avatar === 'string' && saved.avatar) {
          setAvatarOverride(saved.avatar)
          setSection('characters')
        }
          importedCount += 1
        } catch (cause) {
          toast.error(cause instanceof Error ? cause.message : t('workbench.feedback.importCharacterFailed', { name: file.name }))
        }
      }

      if (importedCount > 0) {
        toast.success(
          importedCount === 1
            ? t('workbench.feedback.characterImported')
            : t('workbench.feedback.charactersImported', { count: importedCount }),
        )
      }
    },
    [csrfToken, saveCharacterMutation, t],
  )

  return {
    // State
    section,
    setSection,
    openSectionWith,
    sectionParams,
    inspectorTab,
    setInspectorTab,
    settingsTab,
    setSettingsTab,
    settingsPanelAction,
    setSettingsPanelAction,
    libraryDialogOpen,
    setLibraryDialogOpen,
    auth,
    settings,
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
    catalog,
    catalogLoading,
    submitting,
    chatsLoading,
    chatLoading,
    chatsError,
    chatError,
    saveError,
    saveErrorTitle,
    actionPending,
    draftMessage,
    draftAuthorName,
    currentUserLabel,
    workspaceError,
    libraryCollapsed,
    isAuthenticated,
    appError,
    activeWorldDocuments,
    lastGenerationContext,
    structuredInsight,
    structuredInsightPending,
    structuredInsightApplying,
    autoApplyWorldState,
    draftAssistMode,

    // Handlers
    handleLoginSubmit,
    handleCreateChatClick,
    handleSaveCurrentChatClick,
    handleDraftSubmit,
    handleAssistDraft,
    handleSelectCharacter,
    handleHighlightCharacter,
    handleSelectChat,
    handleRestoreSession,
    handleDeleteChat,
    handleDeleteSession: runDeleteChat,
    handleRenameChat,
    handleRenameSession,
    handleDuplicateChat,
    handleDuplicateSession,
    handleEditMessage,
    handleDeleteMessage,
    handleBranchMessage,
    handleRegenerateMessage,
    handleContinueMessage,
    handleBranchCurrentChat,
    handleExportCurrentChat,
    handleExportSession,
    handleSessionNameDialogConfirm,
    handleProviderChange,
    handleModelChange,
    handleSettingChange,
    handleMaxOutputChange,
    handleGenerateStructuredInsight,
    handleApplyStructuredInsight,
    handleClearStructuredInsight,
    handleRefreshGenerationContextSnapshot,
    handleRefreshSessionSummary,
    handleImportCharacterFiles,
    setAutoApplyWorldState,
    setDraftAssistMode,
    setDraftMessage,
    setLibraryCollapsed,
    setSaveState,
    setSessionNameDialog,

    // Queries
    workspaceQuery,
    workspaceCatalogQuery,
  }
}

function buildDraftAssistGuidance(
  mode: DraftAssistMode,
  authorName: string,
  draftMessage: string,
) {
  const trimmedDraft = draftMessage.trim()
  if (!trimmedDraft) {
    return `${authorName} has not written a draft yet. Write a fresh next contribution that fits the current scene.`
  }

  switch (resolveEffectiveDraftAssistMode(mode, trimmedDraft)) {
    case 'continue':
      return `Current partial draft from ${authorName}:\n${trimmedDraft}`
    case 'expand':
      return `Expand and enrich this draft from ${authorName}:\n${trimmedDraft}`
    case 'compress':
      return `Compress this draft from ${authorName} while preserving intent:\n${trimmedDraft}`
    case 'rewrite_character_voice':
      return `Rewrite this draft from ${authorName} so it better matches the current character voice and scene:\n${trimmedDraft}`
    case 'narration_to_dialogue':
      return `Convert this narration-heavy draft from ${authorName} into immersive spoken dialogue and action beats:\n${trimmedDraft}`
  }
}

export function buildDraftAssistInstruction(
  mode: DraftAssistMode,
  authorName: string,
  guidance: string,
) {
  const hasDraft = !guidance.includes('has not written a draft yet')
  const baseRules = [
    `You are helping ${authorName} write the next user-side contribution in this roleplay chat.`,
    'Base the result on the current conversation, character setup, active lorebooks, retrieval context, and narrative memories.',
    'Return only directly usable reply content.',
    'Do not include speaker labels, quotation marks, explanations, bullet points, or multiple alternatives.',
  ]

  const modeRules: Record<DraftAssistMode, string[]> = {
    continue: [
      'If a partial draft already exists, continue it naturally instead of restarting from scratch.',
      'Keep scene continuity, tone, pacing, and intent consistent.',
    ],
    expand: [
      'Expand the draft with richer sensory detail, subtext, and stronger scene presence.',
      'Preserve the core meaning while making it fuller and more expressive.',
    ],
    compress: [
      'Make the draft shorter, sharper, and easier to send immediately.',
      'Preserve essential intent, factual meaning, and emotional direction.',
    ],
    rewrite_character_voice: [
      'Rewrite the draft so it sounds more aligned with the established character voice and roleplay tone.',
      'Preserve the intended meaning while improving authenticity and style fit.',
    ],
    narration_to_dialogue: [
      'Convert exposition and flat narration into a more scene-native mix of dialogue, action, and reaction.',
      'Keep it immersive and naturally playable in chat form.',
    ],
  }

  const effectiveMode = hasDraft ? mode : 'continue'
  const emptyDraftRules = hasDraft
    ? []
    : [
        'No user draft currently exists.',
        'Write a fresh next contribution grounded in the latest scene instead of editing a missing draft.',
      ]

  return [...baseRules, ...emptyDraftRules, ...modeRules[effectiveMode], guidance].join('\n\n')
}

function resolveEffectiveDraftAssistMode(mode: DraftAssistMode, trimmedDraft: string): DraftAssistMode {
  return trimmedDraft ? mode : 'continue'
}

function buildRecentRetrievalTurns(
  baseChat: ChatMessage[],
  authorName: string,
  characterName: string,
): string[] {
  return baseChat
    .filter((message, index) => !(index === 0 && message.chat_metadata))
    .map((message) => {
      const text = getMessageText(message).trim()
      if (!text) return null
      const speaker = message.is_user ? authorName : message.name?.trim() || characterName
      return `${speaker}: ${text}`
    })
    .filter((value): value is string => Boolean(value))
    .slice(-4)
}

export function buildDraftAssistRetrievalQuery(
  baseChat: ChatMessage[],
  authorName: string,
  characterName: string,
  draftMessage: string,
): string {
  const recentTurns = buildRecentRetrievalTurns(baseChat, authorName, characterName)

  const trimmedDraft = draftMessage.trim()
  return [trimmedDraft, recentTurns.join('\n')].filter(Boolean).join('\n\n')
}

export function buildContinuationRetrievalQuery(
  baseChat: ChatMessage[],
  authorName: string,
  characterName: string,
  currentText: string,
): string {
  const recentTurns = buildRecentRetrievalTurns(baseChat, authorName, characterName)

  return [currentText.trim(), recentTurns.join('\n')].filter(Boolean).join('\n\n')
}

export function buildReplyRetrievalQuery(
  baseChat: ChatMessage[],
  authorName: string,
  characterName: string,
): string {
  return buildRecentRetrievalTurns(baseChat, authorName, characterName).join('\n')
}

function stripTrailingSpeakerCue(prompt: string, cue: string): string {
  const trimmed = prompt.trimEnd()
  return trimmed.endsWith(cue) ? trimmed.slice(0, -cue.length).trimEnd() : trimmed
}

export function buildDraftAssistTextPrompt(
  basePrompt: string,
  instruction: string,
  authorName: string,
): string {
  const cue = `${authorName}:`
  const promptWithoutCue = stripTrailingSpeakerCue(basePrompt, cue)
  return [
    promptWithoutCue,
    `Drafting instruction:\n${instruction}`,
    cue,
  ].filter(Boolean).join('\n\n')
}

export function buildContinuationTextPrompt(
  basePrompt: string,
  instruction: string,
  characterName: string,
  currentText: string,
): string {
  const cue = `${characterName}:`
  const promptWithoutCue = stripTrailingSpeakerCue(basePrompt, cue)
  return [
    promptWithoutCue,
    `Continuation instruction:\n${instruction}`,
    `${cue} ${currentText.trimStart()}`.trimEnd(),
  ].filter(Boolean).join('\n\n')
}

export function buildDraftAssistRequest({
  appSettings,
  authorName,
  baseChat,
  character,
  draftMessage,
  generationContext,
  mode,
  sessionSummaries = [],
}: DraftAssistRequestBuildInput) {
  const guidance = buildDraftAssistGuidance(mode, authorName, draftMessage)
  const instruction = buildDraftAssistInstruction(mode, authorName, guidance)
  const traceQuery = buildDraftAssistRetrievalQuery(
    baseChat,
    authorName,
    getCharacterName(character),
    draftMessage,
  )
  const prompt = buildTextGenerationPrompt(
    character,
    baseChat,
    authorName,
    appSettings,
    generationContext.lorebookSnippets,
    generationContext.narrativeMemories,
    generationContext.directiveSnippets,
    generationContext.worldStateSnippets,
    sessionSummaries,
  )

  return {
    instruction,
    messages: [
      ...buildChatCompletionMessages(
        character,
        baseChat,
        authorName,
        appSettings,
        generationContext.lorebookSnippets,
        generationContext.narrativeMemories,
        generationContext.directiveSnippets,
        generationContext.worldStateSnippets,
        sessionSummaries,
      ),
      {
        role: 'user' as const,
        content: instruction,
      },
    ],
    prompt: buildDraftAssistTextPrompt(prompt.prompt, instruction, authorName),
    stopSequences: [
      `\n${getCharacterName(character)}:`,
      `\n${authorName}:`,
    ],
    traceQuery,
  }
}

export function sanitizeDraftSuggestion(value: string, authorName: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const withoutFence = trimmed
    .replace(/^```[\w-]*\s*/u, '')
    .replace(/\s*```$/u, '')
    .trim()

  const withoutSpeaker = withoutFence.replace(new RegExp(`^${escapeRegExp(authorName)}\\s*:\\s*`, 'iu'), '').trim()
  const unquoted = withoutSpeaker.replace(/^["“'`]+|["”'`]+$/gu, '').trim()
  return unquoted
}

export function parseGeneratedSessionSummaryBundle(value: string): Array<{
  content: string
  summaryKind: 'open_loops' | 'relationship' | 'scene' | 'session'
}> {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }

  const results = SESSION_SUMMARY_KINDS
    .map((summaryKind) => {
      const pattern = new RegExp(`\\[${summaryKind}\\]([\\s\\S]*?)\\[\\/${summaryKind}\\]`, 'i')
      const match = trimmed.match(pattern)
      const content = match?.[1]?.trim() ?? ''
      if (!content) {
        return null
      }

      return {
        content,
        summaryKind,
      }
    })
    .filter((entry): entry is {
      content: string
      summaryKind: 'open_loops' | 'relationship' | 'scene' | 'session'
    } => Boolean(entry))

  if (results.length > 0) {
    return results
  }

  return [{
    content: trimmed,
    summaryKind: 'session',
  }]
}

function normalizeWorldStateUpdates(payload: Record<string, unknown>) {
  const candidate = payload.state_updates
  if (!Array.isArray(candidate)) {
    return []
  }

  return candidate
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const entity = typeof item.entity === 'string' ? item.entity.trim() : ''
      const field = typeof item.field === 'string' ? item.field.trim() : ''
      const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
      if (!entity || !field) {
        return null
      }

      return {
        entity,
        field,
        nextValue: 'next_value' in item ? item.next_value : null,
        reason,
      }
    })
    .filter((item): item is { entity: string; field: string; nextValue: unknown; reason: string } => Boolean(item))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sanitizeContinuationText(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  return trimmed
    .replace(/^```[\w-]*\s*/u, '')
    .replace(/\s*```$/u, '')
    .replace(/^["“'`]+|["”'`]+$/gu, '')
    .trim()
}

function joinContinuedMessage(currentText: string, continuation: string): string {
  if (!continuation) return currentText

  if (/^[,.;!?)}\]]/.test(continuation)) {
    return `${currentText}${continuation}`
  }

  if (/[({["'`\u201c]$/.test(currentText)) {
    return `${currentText}${continuation}`
  }

  if (/\s$/.test(currentText)) {
    return `${currentText}${continuation}`
  }

  return `${currentText} ${continuation}`
}
