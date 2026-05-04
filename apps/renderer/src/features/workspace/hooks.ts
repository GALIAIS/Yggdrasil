import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type BackendConnectionStatus,
  type ChatCompletionStatusPayload,
  type ChatCompletionModelsPayload,
  type DeleteSessionSummaryPayload,
  type DeleteCharacterPayload,
  type DeleteLibraryDocumentPayload,
  type EvalRunEntry,
  type EvalRunsPayload,
  type LibraryDocument,
  type LoginPayload,
  type DeleteModelProviderPayload,
  type FetchModelProviderModelsPayload,
  type ModelProviderModelsPayload,
  type ModelProviderRecord,
  type NarrativeMemoryCandidateEntry,
  type NarrativeMemoryEntry,
  type NarrativeMemoryHitEntry,
  type NarrativeMemoryMutationPayload,
  type ProjectManifestRecord,
  type ProjectPluginBindingPayload,
  type SaveProjectManifestPayload,
  type ReviewNarrativeMemoryCandidatePayload,
  type SaveCharacterPayload,
  type SaveLibraryDocumentPayload,
  type SaveModelProviderPayload,
  type LogoutPayload,
  type RetrievalHitEntry,
  type RetrievalJobEntry,
  type SaveSettingsPayload,
  type SaveSettingsWithSecretPayload,
  type SessionSummary,
  type WriteSecretPayload,
  type TextGenerationStatusPayload,
  type WorldStateSnapshotEntry,
  type WorkspaceBootstrap,
  type WorkspaceCatalogPayload,
} from '@yggdrasil/api-client'

export const workspaceQueryKey = ['workspace'] as const
export const workspaceCatalogQueryKey = ['workspace', 'catalog'] as const
export const libraryDocumentsQueryKey = (domain: string) => ['workspace', 'library-documents', domain] as const
export const narrativeMemoryCandidatesQueryKey = (avatarUrl?: string, fileName?: string) => ['workspace', 'narrative-memory-candidates', avatarUrl ?? '__all__', fileName ?? '__all__'] as const
export const narrativeMemoriesQueryKey = (avatarUrl?: string, fileName?: string) => ['workspace', 'narrative-memories', avatarUrl ?? '__all__', fileName ?? '__all__'] as const
export const narrativeMemoryHitsQueryKey = (avatarUrl?: string, fileName?: string, query?: string) =>
  ['workspace', 'narrative-memory-hits', avatarUrl ?? '__all__', fileName ?? '__all__', query?.trim() || '__all__'] as const
export const retrievalJobsQueryKey = (fileName?: string) => ['workspace', 'retrieval-jobs', fileName ?? '__all__'] as const
export const retrievalHitsQueryKey = (queryText?: string) => ['workspace', 'retrieval-hits', queryText ?? '__all__'] as const
export const sessionSummariesQueryKey = (avatarUrl?: string, fileName?: string) =>
  ['workspace', 'session-summaries', avatarUrl ?? '__all__', fileName ?? '__all__'] as const
export const worldStateSnapshotQueryKey = (avatarUrl?: string, fileName?: string) =>
  ['workspace', 'world-state-snapshot', avatarUrl ?? '__all__', fileName ?? '__all__'] as const
export const evalRunsQueryKey = (avatarUrl?: string, fileName?: string) =>
  ['workspace', 'eval-runs', avatarUrl ?? '__all__', fileName ?? '__all__'] as const
export const projectManifestsQueryKey = ['workspace', 'project-manifests'] as const
export const modelProvidersQueryKey = ['workspace', 'model-providers'] as const
export const secretQueryKey = (secretKey: string) => ['workspace', 'secret', secretKey] as const

export function useWorkspaceBootstrapQuery() {
  return useQuery<WorkspaceBootstrap>({
    queryKey: workspaceQueryKey,
    queryFn: async ({ signal }) => {
      const { fetchWorkspaceBootstrap } = await import('@yggdrasil/api-client')
      return fetchWorkspaceBootstrap(signal)
    },
    staleTime: 30_000,
  })
}

export function useWorkspaceCatalogQuery() {
  return useQuery<WorkspaceCatalogPayload>({
    queryKey: workspaceCatalogQueryKey,
    queryFn: async ({ signal }) => {
      const { fetchWorkspaceCatalog } = await import('@yggdrasil/api-client')
      return fetchWorkspaceCatalog(signal)
    },
    staleTime: 30_000,
  })
}

export function useLoginMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { login } = await import('@yggdrasil/api-client')
      return login(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: LogoutPayload) => {
      const { logout } = await import('@yggdrasil/api-client')
      return logout(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
    },
  })
}

export function useSaveSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SaveSettingsPayload) => {
      const { saveSettings } = await import('@yggdrasil/api-client')
      return saveSettings(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'world-state-snapshot'] })
    },
  })
}

export function useSaveSettingsWithSecretMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SaveSettingsWithSecretPayload) => {
      const { saveSettingsWithSecret } = await import('@yggdrasil/api-client')
      return saveSettingsWithSecret(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'world-state-snapshot'] })
    },
  })
}

export function useModelProvidersQuery(enabled = true) {
  return useQuery<ModelProviderRecord[]>({
    queryKey: modelProvidersQueryKey,
    enabled,
    queryFn: async ({ signal }) => {
      const { fetchModelProviders } = await import('@yggdrasil/api-client')
      return fetchModelProviders(signal)
    },
    staleTime: 30_000,
  })
}

export function useSaveModelProviderMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SaveModelProviderPayload) => {
      const { saveModelProvider } = await import('@yggdrasil/api-client')
      return saveModelProvider(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelProvidersQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
    },
  })
}

export function useDeleteModelProviderMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: DeleteModelProviderPayload) => {
      const { deleteModelProvider } = await import('@yggdrasil/api-client')
      return deleteModelProvider(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: modelProvidersQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
    },
  })
}

export function useModelProviderModelsMutation() {
  return useMutation<ModelProviderModelsPayload, Error, FetchModelProviderModelsPayload>({
    mutationFn: async (payload) => {
      const { fetchModelProviderModels } = await import('@yggdrasil/api-client')
      return fetchModelProviderModels(payload)
    },
  })
}

export function useSaveCharacterMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SaveCharacterPayload) => {
      const { saveCharacter } = await import('@yggdrasil/api-client')
      return saveCharacter(payload)
    },
    onSuccess: (savedCharacter) => {
      queryClient.setQueryData<WorkspaceBootstrap | undefined>(workspaceQueryKey, (current) => {
        if (!current) {
          return current
        }

        const savedAvatar = typeof savedCharacter.avatar === 'string' ? savedCharacter.avatar : ''
        if (!savedAvatar) {
          return current
        }

        const nextCharacters = [...(current.characters ?? [])]
        const existingIndex = nextCharacters.findIndex(
          (character) => typeof character.avatar === 'string' && character.avatar === savedAvatar,
        )

        if (existingIndex >= 0) {
          nextCharacters[existingIndex] = {
            ...nextCharacters[existingIndex],
            ...savedCharacter,
          }
        } else {
          nextCharacters.unshift(savedCharacter)
        }

        return {
          ...current,
          characters: nextCharacters,
        }
      })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
    },
  })
}

export function useDeleteCharacterMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: DeleteCharacterPayload) => {
      const { deleteCharacter } = await import('@yggdrasil/api-client')
      return deleteCharacter(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
    },
  })
}

export function useLibraryDocumentsQuery(domain: string, enabled = true) {
  return useQuery<LibraryDocument[]>({
    queryKey: libraryDocumentsQueryKey(domain),
    enabled: enabled && Boolean(domain),
    queryFn: async ({ signal }) => {
      const { fetchLibraryDocuments } = await import('@yggdrasil/api-client')
      return fetchLibraryDocuments(domain, signal)
    },
    staleTime: 30_000,
  })
}

export function useNarrativeMemoryCandidatesQuery(avatarUrl?: string, fileName?: string, enabled = true) {
  return useQuery<NarrativeMemoryCandidateEntry[]>({
    queryKey: narrativeMemoryCandidatesQueryKey(avatarUrl, fileName),
    enabled: enabled && Boolean(avatarUrl) && Boolean(fileName),
    queryFn: async ({ signal }) => {
      const { fetchNarrativeMemoryCandidates } = await import('@yggdrasil/api-client')
      return fetchNarrativeMemoryCandidates({
        avatarUrl,
        csrfToken: 'tauri-local',
        fileName,
        limit: 8,
        signal,
      })
    },
    staleTime: 10_000,
  })
}

export function useNarrativeMemoriesQuery(avatarUrl?: string, fileName?: string, enabled = true) {
  return useQuery<NarrativeMemoryEntry[]>({
    queryKey: narrativeMemoriesQueryKey(avatarUrl, fileName),
    enabled: enabled && Boolean(avatarUrl) && Boolean(fileName),
    queryFn: async ({ signal }) => {
      const { fetchNarrativeMemories } = await import('@yggdrasil/api-client')
      return fetchNarrativeMemories({
        avatarUrl,
        csrfToken: 'tauri-local',
        fileName,
        limit: 12,
        signal,
      })
    },
    staleTime: 10_000,
  })
}

export function useMemoryHitsQuery(avatarUrl?: string, fileName?: string, query?: string, enabled = true) {
  return useQuery<NarrativeMemoryHitEntry[]>({
    queryKey: narrativeMemoryHitsQueryKey(avatarUrl, fileName, query),
    enabled: enabled && Boolean(query?.trim()),
    queryFn: async ({ signal }) => {
      const { fetchMemoryHits } = await import('@yggdrasil/api-client')
      return fetchMemoryHits({
        avatarUrl,
        csrfToken: 'tauri-local',
        fileName,
        limit: 12,
        query,
        signal,
      })
    },
    staleTime: 10_000,
  })
}

export function useRetrievalJobsQuery(fileName?: string, enabled = true) {
  return useQuery<RetrievalJobEntry[]>({
    queryKey: retrievalJobsQueryKey(fileName),
    enabled,
    queryFn: async ({ signal }) => {
      const { fetchRetrievalJobs } = await import('@yggdrasil/api-client')
      return fetchRetrievalJobs({
        csrfToken: 'tauri-local',
        fileName,
        limit: 8,
        signal,
      })
    },
    staleTime: 10_000,
  })
}

export function useSessionSummariesQuery(avatarUrl?: string, fileName?: string, enabled = true) {
  return useQuery<SessionSummary[]>({
    queryKey: sessionSummariesQueryKey(avatarUrl, fileName),
    enabled: enabled && Boolean(avatarUrl) && Boolean(fileName),
    queryFn: async ({ signal }) => {
      const { fetchSessionSummaries } = await import('@yggdrasil/api-client')
      return fetchSessionSummaries({
        avatarUrl,
        csrfToken: 'tauri-local',
        fileName,
        signal,
      })
    },
    staleTime: 10_000,
  })
}

export function useDeleteSessionSummaryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: DeleteSessionSummaryPayload) => {
      const { deleteSessionSummary } = await import('@yggdrasil/api-client')
      return deleteSessionSummary(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: sessionSummariesQueryKey(variables.avatarUrl, variables.fileName),
      })
    },
  })
}

export function useReviewNarrativeMemoryCandidateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: ReviewNarrativeMemoryCandidatePayload & { avatarUrl?: string; fileName?: string; queryText?: string }) => {
      const { reviewNarrativeMemoryCandidate } = await import('@yggdrasil/api-client')
      return reviewNarrativeMemoryCandidate(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoryCandidatesQueryKey(variables.avatarUrl, variables.fileName),
      })
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoriesQueryKey(variables.avatarUrl, variables.fileName),
      })
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoryHitsQueryKey(variables.avatarUrl, variables.fileName, variables.queryText),
      })
      void queryClient.invalidateQueries({
        queryKey: retrievalJobsQueryKey(variables.fileName),
      })
      void queryClient.invalidateQueries({
        queryKey: retrievalHitsQueryKey(variables.queryText),
      })
    },
  })
}

export function useDeleteNarrativeMemoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: NarrativeMemoryMutationPayload & { memoryId: string }) => {
      const { deleteNarrativeMemory } = await import('@yggdrasil/api-client')
      return deleteNarrativeMemory(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoriesQueryKey(variables.avatarUrl, variables.fileName),
      })
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoryHitsQueryKey(variables.avatarUrl, variables.fileName, variables.query),
      })
    },
  })
}

export function useDeleteNarrativeMemoryCandidateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: NarrativeMemoryMutationPayload & { candidateId: string }) => {
      const { deleteNarrativeMemoryCandidate } = await import('@yggdrasil/api-client')
      return deleteNarrativeMemoryCandidate(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoryCandidatesQueryKey(variables.avatarUrl, variables.fileName),
      })
    },
  })
}

export function useClearMemoryHitsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: NarrativeMemoryMutationPayload) => {
      const { clearMemoryHits } = await import('@yggdrasil/api-client')
      return clearMemoryHits(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoryHitsQueryKey(variables.avatarUrl, variables.fileName, variables.query),
      })
    },
  })
}

export function useRetrievalHitsQuery(queryText?: string, enabled = true) {
  return useQuery<RetrievalHitEntry[]>({
    queryKey: retrievalHitsQueryKey(queryText),
    enabled: enabled && Boolean(queryText?.trim()),
    queryFn: async ({ signal }) => {
      const { fetchRetrievalHits } = await import('@yggdrasil/api-client')
      return fetchRetrievalHits({
        csrfToken: 'tauri-local',
        limit: 16,
        queryText,
        signal,
      })
    },
    staleTime: 10_000,
  })
}

export function useEvalRunsQuery(avatarUrl?: string, fileName?: string, enabled = true) {
  return useQuery<EvalRunEntry[]>({
    queryKey: evalRunsQueryKey(avatarUrl, fileName),
    enabled,
    queryFn: async ({ signal }) => {
      const { fetchEvalRuns } = await import('@yggdrasil/api-client')
      return fetchEvalRuns({
        avatarUrl,
        csrfToken: 'tauri-local',
        fileName,
        limit: 8,
        signal,
      } satisfies EvalRunsPayload)
    },
    staleTime: 10_000,
  })
}

export function useRunLocalEvalMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: EvalRunsPayload) => {
      const { runLocalEval } = await import('@yggdrasil/api-client')
      return runLocalEval(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: evalRunsQueryKey(variables.avatarUrl, variables.fileName),
      })
    },
  })
}

export function useProjectManifestsQuery(enabled = true) {
  return useQuery<ProjectManifestRecord[]>({
    queryKey: projectManifestsQueryKey,
    enabled,
    queryFn: async ({ signal }) => {
      const { fetchProjectManifests } = await import('@yggdrasil/api-client')
      return fetchProjectManifests(signal)
    },
    staleTime: 30_000,
  })
}

export function useSaveProjectManifestMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SaveProjectManifestPayload) => {
      const { saveProjectManifest } = await import('@yggdrasil/api-client')
      return saveProjectManifest(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectManifestsQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
    },
  })
}

export function useDeleteProjectManifestMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { csrfToken: string; name: string }) => {
      const { deleteProjectManifest } = await import('@yggdrasil/api-client')
      return deleteProjectManifest(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectManifestsQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
    },
  })
}

export function useSetProjectPluginBindingMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: ProjectPluginBindingPayload) => {
      const { setProjectPluginBinding } = await import('@yggdrasil/api-client')
      return setProjectPluginBinding(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectManifestsQueryKey })
    },
  })
}

export function useSecretQuery(secretKey: string, enabled = true) {
  return useQuery<string>({
    queryKey: secretQueryKey(secretKey),
    enabled: enabled && Boolean(secretKey),
    queryFn: async ({ signal }) => {
      const { readSecret } = await import('@yggdrasil/api-client')
      return readSecret({
        csrfToken: 'tauri-local',
        secretKey,
        signal,
      })
    },
    staleTime: 30_000,
  })
}

export function useWorldStateSnapshotQuery(avatarUrl?: string, fileName?: string, enabled = true) {
  return useQuery<WorldStateSnapshotEntry | null>({
    queryKey: worldStateSnapshotQueryKey(avatarUrl, fileName),
    enabled: enabled && Boolean(avatarUrl) && Boolean(fileName),
    queryFn: async ({ signal }) => {
      const { fetchWorldStateSnapshot } = await import('@yggdrasil/api-client')
      return fetchWorldStateSnapshot({
        avatarUrl,
        csrfToken: 'tauri-local',
        fileName,
        signal,
      })
    },
    staleTime: 10_000,
  })
}

export function useRebuildWorldStateSnapshotMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { avatarUrl?: string; fileName?: string; lorebookName?: string }) => {
      const { rebuildWorldStateSnapshot } = await import('@yggdrasil/api-client')
      return rebuildWorldStateSnapshot({
        ...payload,
        csrfToken: 'tauri-local',
      })
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: worldStateSnapshotQueryKey(variables.avatarUrl, variables.fileName),
      })
    },
  })
}

export function useSaveLibraryDocumentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SaveLibraryDocumentPayload) => {
      const { saveLibraryDocument } = await import('@yggdrasil/api-client')
      return saveLibraryDocument(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: libraryDocumentsQueryKey(variables.domain) })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
      if (variables.domain === 'worlds') {
        void queryClient.invalidateQueries({ queryKey: ['workspace', 'world-state-snapshot'] })
      }
    },
  })
}

export function useDeleteLibraryDocumentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: DeleteLibraryDocumentPayload) => {
      const { deleteLibraryDocument } = await import('@yggdrasil/api-client')
      return deleteLibraryDocument(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: libraryDocumentsQueryKey(variables.domain) })
      void queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey })
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey })
      if (variables.domain === 'worlds') {
        void queryClient.invalidateQueries({ queryKey: ['workspace', 'world-state-snapshot'] })
      }
    },
  })
}

export function useWriteSecretMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: WriteSecretPayload) => {
      const { writeSecret } = await import('@yggdrasil/api-client')
      return writeSecret(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: secretQueryKey(variables.secretKey) })
    },
  })
}

export function useTextGenerationStatusMutation() {
  return useMutation<BackendConnectionStatus, Error, TextGenerationStatusPayload>({
    mutationFn: async (payload) => {
      const { checkTextGenerationStatus } = await import('@yggdrasil/api-client')
      return checkTextGenerationStatus(payload)
    },
  })
}

export function useChatCompletionStatusMutation() {
  return useMutation<BackendConnectionStatus, Error, ChatCompletionStatusPayload>({
    mutationFn: async (payload) => {
      const { checkChatCompletionStatus } = await import('@yggdrasil/api-client')
      return checkChatCompletionStatus(payload)
    },
  })
}

export function useChatCompletionModelsMutation() {
  return useMutation<string[], Error, ChatCompletionModelsPayload>({
    mutationFn: async (payload) => {
      const { fetchChatCompletionModels } = await import('@yggdrasil/api-client')
      return fetchChatCompletionModels(payload)
    },
  })
}

export function useNovelStatusMutation() {
  return useMutation<BackendConnectionStatus, Error, { csrfToken: string }>({
    mutationFn: async ({ csrfToken }) => {
      const { checkNovelStatus } = await import('@yggdrasil/api-client')
      return checkNovelStatus(csrfToken)
    },
  })
}
