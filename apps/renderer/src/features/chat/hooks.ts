import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ChatMessage,
  type CharacterChatSummary,
  type DeleteChatPayload,
  type NarrativeMemoryExtractionPayload,
  type GenerateChatReplyPayload,
  type RenameChatPayload,
  type SaveChatPayload,
  type TraceEntriesPayload,
  type TraceEntry,
} from '@yggdrasil/api-client'

import { characterChatsQueryKey } from '@/features/characters/hooks'
import {
  narrativeMemoryCandidatesQueryKey,
  narrativeMemoriesQueryKey,
  retrievalHitsQueryKey,
  retrievalJobsQueryKey,
  sessionSummariesQueryKey,
  workspaceCatalogQueryKey,
} from '@/features/workspace/hooks'
import { getMessageText } from '@/lib/chat'

export const chatQueryKey = (avatarUrl: string, fileName: string) =>
  ['chat', avatarUrl, fileName] as const
export const traceEntriesQueryKey = (avatarUrl?: string, fileName?: string) =>
  ['chat', 'traces', avatarUrl ?? '__all__', fileName ?? '__all__'] as const

export interface UseChatQueryArgs {
  avatarUrl: string
  fileName: string
  enabled: boolean
}

export function useChatQuery({ avatarUrl, fileName, enabled }: UseChatQueryArgs) {
  return useQuery<ChatMessage[]>({
    queryKey: chatQueryKey(avatarUrl, fileName),
    enabled: enabled && Boolean(avatarUrl) && Boolean(fileName),
    queryFn: async ({ signal }) => {
      const { fetchChat } = await import('@yggdrasil/api-client')
      return fetchChat({
        avatarUrl,
        csrfToken: 'tauri-local',
        fileName,
        signal,
      })
    },
  })
}

export type SaveChatMutationArgs = SaveChatPayload
export type GenerateAssistantMutationArgs = GenerateChatReplyPayload
export type ExtractNarrativeMemoryMutationArgs = NarrativeMemoryExtractionPayload

export function useSaveChatMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: SaveChatMutationArgs) => {
      const { saveChat } = await import('@yggdrasil/api-client')
      return saveChat(payload)
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData(
        chatQueryKey(variables.avatarUrl, variables.fileName),
        variables.chat,
      )
      queryClient.setQueryData<CharacterChatSummary[]>(
        characterChatsQueryKey(variables.avatarUrl),
        (current) => {
          const nextList = [...(current ?? [])]
          const preview =
            [...variables.chat]
              .reverse()
              .map((message) => getMessageText(message).trim())
              .find(Boolean) ?? ''
          const messageCount = Math.max(
            0,
            variables.chat.filter((message, index) => {
              if (index === 0 && message.chat_metadata && !getMessageText(message).trim()) {
                return false
              }
              return Boolean(getMessageText(message).trim())
            }).length,
          )
          const fileSize = new Blob([JSON.stringify(variables.chat)]).size.toString()
          const nextSummary: CharacterChatSummary = {
            chat_items: messageCount,
            file_id: variables.fileName,
            file_name: variables.fileName,
            file_size: fileSize,
            last_mes: Date.now(),
            mes: preview,
          }
          const existingIndex = nextList.findIndex((item) => item.file_id === variables.fileName)
          if (existingIndex >= 0) {
            nextList[existingIndex] = {
              ...nextList[existingIndex],
              ...nextSummary,
            }
          } else {
            nextList.unshift(nextSummary)
          }
          return nextList.sort(
            (left, right) => Number(right.last_mes ?? 0) - Number(left.last_mes ?? 0),
          )
        },
      )
      void queryClient.invalidateQueries({
        queryKey: characterChatsQueryKey(variables.avatarUrl),
      })
      void queryClient.invalidateQueries({
        queryKey: workspaceCatalogQueryKey,
      })
      void queryClient.invalidateQueries({
        queryKey: sessionSummariesQueryKey(variables.avatarUrl, variables.fileName),
      })
    },
  })
}

export function useGenerateAssistantMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: GenerateAssistantMutationArgs) => {
      const { generateChatReply } = await import('@yggdrasil/api-client')
      return generateChatReply(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: traceEntriesQueryKey(
          variables.traceContext?.avatarUrl,
          variables.traceContext?.fileName,
        ),
      })
      void queryClient.invalidateQueries({
        queryKey: retrievalJobsQueryKey(variables.traceContext?.fileName),
      })
      void queryClient.invalidateQueries({
        queryKey: retrievalHitsQueryKey(
          variables.traceContext?.generationContext?.query,
        ),
      })
    },
  })
}

export function useExtractNarrativeMemoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: ExtractNarrativeMemoryMutationArgs) => {
      const { extractNarrativeMemory } = await import('@yggdrasil/api-client')
      return extractNarrativeMemory(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoryCandidatesQueryKey(
          variables.traceContext?.avatarUrl,
          variables.traceContext?.fileName,
        ),
      })
      void queryClient.invalidateQueries({
        queryKey: narrativeMemoriesQueryKey(
          variables.traceContext?.avatarUrl,
          variables.traceContext?.fileName,
        ),
      })
    },
  })
}

export function useTraceEntriesQuery({
  avatarUrl,
  fileName,
  limit = 24,
}: Omit<TraceEntriesPayload, 'csrfToken' | 'signal'>) {
  return useQuery<TraceEntry[]>({
    queryKey: traceEntriesQueryKey(avatarUrl, fileName),
    queryFn: async ({ signal }) => {
      const { fetchTraceEntries } = await import('@yggdrasil/api-client')
      return fetchTraceEntries({
        avatarUrl,
        csrfToken: 'tauri-local',
        fileName,
        limit,
        signal,
      })
    },
    staleTime: 10_000,
  })
}

export function useClearTraceEntriesMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: Omit<TraceEntriesPayload, 'signal'>) => {
      const { clearTraceEntries } = await import('@yggdrasil/api-client')
      return clearTraceEntries(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: traceEntriesQueryKey(variables.avatarUrl, variables.fileName),
      })
    },
  })
}

export function useDeleteChatMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: DeleteChatPayload) => {
      const { deleteChat } = await import('@yggdrasil/api-client')
      return deleteChat(payload)
    },
    onSuccess: (_, variables) => {
      queryClient.removeQueries({
        queryKey: chatQueryKey(variables.avatarUrl, variables.fileName),
      })
      queryClient.setQueryData<CharacterChatSummary[]>(
        characterChatsQueryKey(variables.avatarUrl),
        (current) => (current ?? []).filter((item) => item.file_id !== variables.fileName),
      )
      void queryClient.invalidateQueries({
        queryKey: characterChatsQueryKey(variables.avatarUrl),
      })
      void queryClient.invalidateQueries({
        queryKey: workspaceCatalogQueryKey,
      })
      queryClient.removeQueries({
        queryKey: sessionSummariesQueryKey(variables.avatarUrl, variables.fileName),
      })
    },
  })
}

export function useRenameChatMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: RenameChatPayload) => {
      const { renameChat } = await import('@yggdrasil/api-client')
      return renameChat(payload)
    },
    onSuccess: (_, variables) => {
      queryClient.removeQueries({
        queryKey: chatQueryKey(variables.avatarUrl, variables.fileName),
      })
      void queryClient.invalidateQueries({
        queryKey: characterChatsQueryKey(variables.avatarUrl),
      })
      void queryClient.invalidateQueries({
        queryKey: workspaceCatalogQueryKey,
      })
    },
  })
}

export function useDuplicateChatMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: RenameChatPayload) => {
      const { duplicateChat } = await import('@yggdrasil/api-client')
      return duplicateChat(payload)
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: characterChatsQueryKey(variables.avatarUrl),
      })
      void queryClient.invalidateQueries({
        queryKey: sessionSummariesQueryKey(variables.avatarUrl, variables.nextFileName),
      })
    },
  })
}
