import type { ChatMessage } from '@yggdrasil/api-client'

export const SESSION_SUMMARY_SOURCE_WINDOW = 24

export function buildSessionSummarySourceSignature(
  messages: ChatMessage[],
  authorName: string,
  characterName: string,
  sourceWindow = SESSION_SUMMARY_SOURCE_WINDOW,
): string {
  const normalizedWindow = Number.isFinite(sourceWindow)
    ? Math.max(1, Math.trunc(sourceWindow))
    : SESSION_SUMMARY_SOURCE_WINDOW
  const normalized = messages
    .filter((message, index) => {
      if (index === 0 && message.chat_metadata) {
        return false
      }

      return Boolean((message.mes ?? '').trim())
    })
    .slice(-normalizedWindow)
    .map((message) => {
      const speaker = message.is_user ? authorName : message.name || characterName
      return `${speaker}\u241f${(message.mes ?? '').trim()}`
    })
    .join('\u241e')

  let hash = 2166136261
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `v1:${normalized.length}:${(hash >>> 0).toString(16)}`
}
