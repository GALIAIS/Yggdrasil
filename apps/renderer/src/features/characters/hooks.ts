import { useQuery } from '@tanstack/react-query'
import type { CharacterChatSummary } from '@yggdrasil/api-client'

import { toTimestamp } from '@/lib/formatters'

export const characterChatsQueryKey = (avatarUrl: string) =>
  ['characterChats', avatarUrl] as const

export interface UseCharacterChatsQueryArgs {
  avatarUrl: string
  enabled: boolean
}

export function useCharacterChatsQuery({
  avatarUrl,
  enabled,
}: UseCharacterChatsQueryArgs) {
  return useQuery<CharacterChatSummary[]>({
    queryKey: characterChatsQueryKey(avatarUrl),
    enabled: enabled && Boolean(avatarUrl),
    queryFn: async ({ signal }) => {
      const { fetchCharacterChats } = await import('@yggdrasil/api-client')
      const chats = await fetchCharacterChats({
        avatarUrl,
        csrfToken: 'tauri-local',
        metadata: true,
        signal,
      })

      return [...chats].sort(
        (left, right) => toTimestamp(right.last_mes) - toTimestamp(left.last_mes),
      )
    },
  })
}
