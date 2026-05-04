import type {
  AppSettings,
  CharacterChatSummary,
  CharacterSummary,
  ChatCompletionMessage,
  ChatMessage,
  DirectiveSnippet,
  LorebookSnippet,
  NarrativeMemoryEntry,
  WorldStateSnippet,
} from '@yggdrasil/api-client'

import { getCharacterName } from './character'
import {
  assembleGenerationContext,
  buildChatCompletionMessagesFromAssembly,
  buildTextPromptFromAssembly,
  type SessionSummary,
} from './context-assembly'
import { formatChatStamp } from './formatters'

export function getChatPreview(chat: CharacterChatSummary): string {
  return typeof chat.mes === 'string' && chat.mes.trim() ? chat.mes.trim() : '[空消息]'
}

export function getChatDisplayName(chat: CharacterChatSummary): string {
  const rawName =
    (typeof chat.file_name === 'string' && chat.file_name.trim()) ||
    (typeof chat.file_id === 'string' && chat.file_id.trim()) ||
    ''

  if (!rawName) {
    return 'Chat'
  }

  const withoutExtension = rawName.replace(/\.[a-z0-9]+$/i, '').trim()
  const withoutGeneratedStamp = withoutExtension
    .replace(/\s-\s\d{4}-\d{2}-\d{2}\s\d{2}-\d{2}-\d{2}$/, '')
    .trim()

  return withoutGeneratedStamp || withoutExtension || rawName
}

export function getMessageText(message: ChatMessage): string {
  const displayText = message.extra?.display_text

  if (typeof displayText === 'string' && displayText.trim()) {
    return displayText
  }

  return typeof message.mes === 'string' ? message.mes : ''
}

export function resolveSelectedChatId(chats: CharacterChatSummary[], current: string): string {
  if (current && chats.some((chat) => chat.file_id === current)) {
    return current
  }

  return chats[0]?.file_id ?? ''
}

export function createChatHeader(metadata: Record<string, unknown> = {}): ChatMessage {
  const nextMetadata = { ...metadata }

  if (typeof nextMetadata.integrity !== 'string' || !nextMetadata.integrity) {
    nextMetadata.integrity = crypto.randomUUID()
  }

  return {
    chat_metadata: nextMetadata,
    character_name: 'unused',
    user_name: 'unused',
  }
}

export function buildPersistedChat(chat: ChatMessage[]): ChatMessage[] {
  const [firstMessage, ...rest] = chat

  if (
    firstMessage &&
    firstMessage.chat_metadata &&
    typeof firstMessage.chat_metadata === 'object'
  ) {
    return [createChatHeader(firstMessage.chat_metadata), ...rest]
  }

  return [createChatHeader(), ...chat]
}

export function createChatFileName(character: CharacterSummary): string {
  const invalidCharacters = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
  const sanitizedName = Array.from(getCharacterName(character))
    .map((characterPart) => {
      if (invalidCharacters.has(characterPart)) {
        return '_'
      }

      return characterPart.charCodeAt(0) < 32 ? '' : characterPart
    })
    .join('')
    .trim()
  const name = sanitizedName || 'Chat'

  return `${name} - ${formatChatStamp(new Date())}`
}

export function createInitialChatTranscript(character: CharacterSummary): ChatMessage[] {
  const firstMessage = typeof character.first_mes === 'string' ? character.first_mes.trim() : ''
  const fallbackGreeting = Array.isArray(character.alternate_greetings)
    ? character.alternate_greetings.find(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      ) ?? ''
    : ''
  const openingMessage = firstMessage || fallbackGreeting
  const transcript: ChatMessage[] = [createChatHeader()]

  if (openingMessage) {
    transcript.push({
      extra: {},
      is_system: false,
      is_user: false,
      mes: openingMessage,
      name: getCharacterName(character),
      send_date: new Date().toISOString(),
    })
  }

  return transcript
}

export function createUserChatMessage(name: string, text: string): ChatMessage {
  return {
    extra: {
      isSmallSys: false,
      render_id: crypto.randomUUID(),
    },
    is_system: false,
    is_user: true,
    mes: text,
    name,
    send_date: new Date().toISOString(),
  }
}

export function createAssistantChatMessage(
  name: string,
  text: string,
  options?: {
    extra?: Record<string, unknown>
    sendDate?: string
  },
): ChatMessage {
  return {
    extra: {
      ...(options?.extra ?? {}),
      render_id:
        typeof options?.extra?.render_id === 'string' && options.extra.render_id
          ? options.extra.render_id
          : crypto.randomUUID(),
    },
    is_system: false,
    is_user: false,
    mes: text,
    name,
    send_date: options?.sendDate ?? new Date().toISOString(),
  }
}

export function updateChatMessageText(
  transcript: ChatMessage[],
  index: number,
  text: string,
): ChatMessage[] {
  const nextTranscript = transcript.slice()
  const target = nextTranscript[index]
  if (!target) {
    return transcript
  }

  const nextMessage: ChatMessage = {
    ...target,
    mes: text,
  }

  if (target.extra && typeof target.extra === 'object') {
    nextMessage.extra = {
      ...target.extra,
      ...(typeof target.extra.display_text === 'string'
        ? { display_text: text }
        : {}),
      render_id:
        typeof target.extra.render_id === 'string' && target.extra.render_id
          ? target.extra.render_id
          : crypto.randomUUID(),
    }
  }

  nextTranscript[index] = nextMessage
  return nextTranscript
}

export function removeChatMessage(
  transcript: ChatMessage[],
  index: number,
): ChatMessage[] {
  if (index < 0 || index >= transcript.length) {
    return transcript
  }

  return transcript.filter((_, currentIndex) => currentIndex !== index)
}

export function truncateChatTranscript(
  transcript: ChatMessage[],
  lastInclusiveIndex: number,
): ChatMessage[] {
  if (lastInclusiveIndex < 0) {
    return []
  }

  if (lastInclusiveIndex >= transcript.length) {
    return transcript.slice()
  }

  return transcript.slice(0, lastInclusiveIndex + 1)
}

export function buildChatCompletionMessages(
  character: CharacterSummary,
  transcript: ChatMessage[],
  userName: string,
  appSettings: AppSettings | null | undefined = undefined,
  lorebookSnippets: LorebookSnippet[] = [],
  narrativeMemories: NarrativeMemoryEntry[] = [],
  directiveSnippets: DirectiveSnippet[] = [],
  worldStateSnippets: WorldStateSnippet[] = [],
  sessionSummaries: SessionSummary[] = [],
): ChatCompletionMessage[] {
  const assembled = assembleGenerationContext({
    character,
    directiveSnippets,
    lorebookSnippets,
    narrativeMemories,
    sessionSummaries,
    settings: appSettings,
    transcript,
    userName,
    worldStateSnippets,
  })

  return buildChatCompletionMessagesFromAssembly(assembled)
}

export function buildTextGenerationPrompt(
  character: CharacterSummary,
  transcript: ChatMessage[],
  userName: string,
  appSettings: AppSettings | null | undefined = undefined,
  lorebookSnippets: LorebookSnippet[] = [],
  narrativeMemories: NarrativeMemoryEntry[] = [],
  directiveSnippets: DirectiveSnippet[] = [],
  worldStateSnippets: WorldStateSnippet[] = [],
  sessionSummaries: SessionSummary[] = [],
): { prompt: string; stopSequences: string[] } {
  const assembled = assembleGenerationContext({
    character,
    directiveSnippets,
    lorebookSnippets,
    narrativeMemories,
    sessionSummaries,
    settings: appSettings,
    transcript,
    userName,
    worldStateSnippets,
  })

  return buildTextPromptFromAssembly(assembled, getCharacterName(character), userName)
}
