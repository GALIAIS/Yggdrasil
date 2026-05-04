import type { ChatCompletionMessage } from '@yggdrasil/api-client'

export function estimateTextTokens(value: string | null | undefined): number {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    return 0
  }

  return Math.max(1, Math.ceil(text.length / 3.2))
}

export function estimateMessageTokens(message: Pick<ChatCompletionMessage, 'content' | 'role'>): number {
  const roleOverhead = message.role === 'system' ? 10 : 8
  return roleOverhead + estimateTextTokens(message.content)
}

export function estimateMessagesTokens(messages: ChatCompletionMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
}

export function estimateContextBlockTokens(text: string): number {
  return estimateTextTokens(text)
}
