import type {
  AppSettings,
  CharacterSummary,
  ChatCompletionMessage,
  ChatMessage,
  DirectiveSnippet,
  LorebookSnippet,
  NarrativeMemoryEntry,
  SessionSnippet,
  WorldStateSnippet,
} from '@yggdrasil/api-client'

import { getCharacterName } from './character'
import {
  buildMessageRenderingInstruction,
  buildMessageRenderingLockInstruction,
} from './chat-rendering'
import { resolveMessageRenderingConfigFromSettings } from './chat-rendering-settings'
import { fitBlocksIntoBudget, resolveContextBudget, type ContextBlock, type ContextBudgetResult } from './context-budget'
import { estimateContextBlockTokens } from './token-estimate'

export type SessionSummary = {
  avatarUrl?: string
  content: string
  fileName?: string
  id: string
  summaryKind: 'open_loops' | 'relationship' | 'scene' | 'session'
  updatedAt: number
}

export type AssemblyDebug = {
  loreCountUsed: number
  memoryCountUsed: number
  recentMessagesKept: number
  retrievalCountUsed: number
  summaryKindsUsed: string[]
}

export type AssembledGenerationContext = {
  blocks: ContextBlock[]
  budget: ContextBudgetResult
  debug: AssemblyDebug
}

export interface AssembleGenerationContextInput {
  character: CharacterSummary
  directiveSnippets?: DirectiveSnippet[]
  lorebookSnippets?: LorebookSnippet[]
  narrativeMemories?: NarrativeMemoryEntry[]
  sessionSnippets?: SessionSnippet[]
  sessionSummaries?: SessionSummary[]
  settings?: AppSettings | null
  transcript: ChatMessage[]
  userName: string
  worldStateSnippets?: WorldStateSnippet[]
}

export function assembleGenerationContext(input: AssembleGenerationContextInput): AssembledGenerationContext {
  const blocks = [
    ...buildSystemBlocks(input.character, input.userName, input.settings),
    ...buildSummaryBlocks(input.sessionSummaries ?? []),
    ...buildMemoryBlocks(input.narrativeMemories ?? []),
    ...buildLoreBlocks(input.lorebookSnippets ?? []),
    ...buildRetrievalBlocks(input.sessionSnippets ?? []),
    ...buildDirectiveBlocks(input.directiveSnippets ?? []),
    ...buildWorldStateBlocks(input.worldStateSnippets ?? []),
    ...buildRecentChatBlocks(input.transcript, input.character, input.userName),
  ]

  const budget = fitBlocksIntoBudget(blocks, resolveContextBudget(input.settings))
  const recentMessagesKept = budget.keptBlocks.filter((block) => block.layer === 'recent').length
  const summaryKindsUsed = budget.keptBlocks
    .filter((block) => block.layer === 'summary')
    .map((block) => block.source.replace('summary.', ''))

  return {
    blocks: budget.keptBlocks,
    budget,
    debug: {
      loreCountUsed: budget.keptBlocks.filter((block) => block.layer === 'lore').length,
      memoryCountUsed: budget.keptBlocks.filter((block) => block.layer === 'memory').length,
      recentMessagesKept,
      retrievalCountUsed: budget.keptBlocks.filter((block) => block.layer === 'retrieval').length,
      summaryKindsUsed,
    },
  }
}

export function buildChatCompletionMessagesFromAssembly(
  assembled: AssembledGenerationContext,
): ChatCompletionMessage[] {
  const messages: ChatCompletionMessage[] = []
  const mergedSystemBlocks: string[] = []
  let renderingLock: string | null = null

  for (const block of assembled.blocks) {
    if (block.layer === 'recent') {
      messages.push({
        content: block.text,
        role: resolveRecentRole(block.id),
      })
      continue
    }

    if (block.source === 'system.rendering-lock') {
      renderingLock = block.text
    } else {
      mergedSystemBlocks.push(block.text)
    }
  }

  if (mergedSystemBlocks.length > 0) {
    messages.unshift({
      role: 'system',
      content: mergedSystemBlocks.join('\n\n'),
    })
  }

  if (renderingLock) {
    messages.splice(1, 0, {
      role: 'system',
      content: renderingLock,
    })
  }

  return messages
}

export function buildTextPromptFromAssembly(
  assembled: AssembledGenerationContext,
  characterName: string,
  userName: string,
): { prompt: string; stopSequences: string[] } {
  const prompt = assembled.blocks
    .map((block) => block.text)
    .concat(`${characterName}:`)
    .join('\n\n')
    .trim()

  return {
    prompt,
    stopSequences: [`\n${userName}:`],
  }
}

function buildSystemBlocks(
  character: CharacterSummary,
  userName: string,
  appSettings?: AppSettings | null,
): ContextBlock[] {
  const renderingConfig = resolveMessageRenderingConfigFromSettings(appSettings)
  const sections: string[] = []
  const customSystemPrompt =
    typeof character.system_prompt === 'string' ? character.system_prompt.trim() : ''

  if (customSystemPrompt) {
    sections.push(customSystemPrompt)
  } else {
    sections.push(
      `You are ${getCharacterName(character)} in a private roleplay chat with ${userName}.`,
      'Stay in character and reply as the character, not as the system.',
    )
  }

  if (typeof character.description === 'string' && character.description.trim()) {
    sections.push(`Character description:\n${character.description.trim()}`)
  }
  if (typeof character.personality === 'string' && character.personality.trim()) {
    sections.push(`Personality:\n${character.personality.trim()}`)
  }
  if (typeof character.scenario === 'string' && character.scenario.trim()) {
    sections.push(`Scenario:\n${character.scenario.trim()}`)
  }
  if (typeof character.mes_example === 'string' && character.mes_example.trim()) {
    sections.push(`Example dialogue:\n${character.mes_example.trim()}`)
  }
  if (typeof character.post_history_instructions === 'string' && character.post_history_instructions.trim()) {
    sections.push(`Post-history instructions:\n${character.post_history_instructions.trim()}`)
  }

  const formattingInstruction = buildMessageRenderingInstruction(renderingConfig)
  if (formattingInstruction) {
    sections.push(`Output formatting:\n${formattingInstruction}`)
  }

  const blocks: ContextBlock[] = [{
    estimatedTokens: estimateContextBlockTokens(sections.join('\n\n')),
    id: 'system.character-core',
    layer: 'system',
    pinned: true,
    priority: 1000,
    source: 'system.character-core',
    text: sections.join('\n\n'),
  }]

  const formattingLock = buildMessageRenderingLockInstruction(renderingConfig)
  if (formattingLock) {
    blocks.push({
      estimatedTokens: estimateContextBlockTokens(formattingLock),
      id: 'system.rendering-lock',
      layer: 'system',
      pinned: true,
      priority: 980,
      source: 'system.rendering-lock',
      text: formattingLock,
    })
  }

  return blocks
}

function buildSummaryBlocks(summaries: SessionSummary[]): ContextBlock[] {
  const priorities: Record<SessionSummary['summaryKind'], number> = {
    open_loops: 920,
    relationship: 950,
    scene: 930,
    session: 900,
  }

  return summaries
    .filter((summary) => summary.content.trim().length > 0)
    .map((summary) => ({
      estimatedTokens: estimateContextBlockTokens(summary.content),
      id: `summary.${summary.summaryKind}.${summary.id}`,
      layer: 'summary' as const,
      priority: priorities[summary.summaryKind],
      source: `summary.${summary.summaryKind}`,
      text: `[${formatSummaryHeading(summary.summaryKind)}]\n${summary.content.trim()}`,
    }))
}

function buildMemoryBlocks(entries: NarrativeMemoryEntry[]): ContextBlock[] {
  return entries
    .filter((entry) => entry.content.trim().length > 0)
    .slice(0, 6)
    .map((entry) => {
      const label = [entry.kind.trim(), entry.tags.slice(0, 3).join(', ')].filter(Boolean).join(' | ')
      const detail = label ? `- ${entry.content.trim()} (${label})` : `- ${entry.content.trim()}`
      return {
        estimatedTokens: estimateContextBlockTokens(detail),
        id: `memory.${entry.id}`,
        layer: 'memory' as const,
        priority: 860,
        source: `memory.narrative.${entry.id}`,
        text: `Relevant narrative memory:\n${detail}`,
      }
    })
}

function buildLoreBlocks(entries: LorebookSnippet[]): ContextBlock[] {
  return entries
    .filter((entry) => entry.content.trim().length > 0)
    .slice(0, 8)
    .map((entry, index) => {
      const text = `Active lorebooks:\n${entry.bookName}:\n${entry.content.trim()}`
      return {
        estimatedTokens: estimateContextBlockTokens(text),
        id: `lore.${entry.bookName}.${index}`,
        layer: 'lore' as const,
        priority: 760,
        source: `lore.${entry.bookName}`,
        text,
      }
    })
}

function buildRetrievalBlocks(entries: SessionSnippet[]): ContextBlock[] {
  return entries
    .filter((entry) => entry.content.trim().length > 0)
    .slice(0, 4)
    .map((entry) => {
      const text = `[Retrieved ${entry.role} turn #${entry.ordinal}]\n${entry.content.trim()}`
      return {
        estimatedTokens: estimateContextBlockTokens(text),
        id: `retrieval.session.${entry.ordinal}`,
        layer: 'retrieval' as const,
        priority: 700,
        source: `retrieval.session.${entry.ordinal}`,
        text,
      }
    })
}

function buildDirectiveBlocks(entries: DirectiveSnippet[]): ContextBlock[] {
  return entries
    .filter((entry) => entry.content.trim().length > 0)
    .slice(0, 6)
    .map((entry, index) => {
      const text = `Global directives:\n[${entry.label} · ${entry.sourceName}] ${entry.content.trim()}`
      return {
        estimatedTokens: estimateContextBlockTokens(text),
        id: `directive.${index}`,
        layer: 'lore' as const,
        priority: 820,
        source: `directive.${entry.label}`,
        text,
      }
    })
}

function buildWorldStateBlocks(entries: WorldStateSnippet[]): ContextBlock[] {
  return entries
    .filter((entry) => entry.entity.trim().length > 0 || entry.detail.trim().length > 0)
    .slice(0, 8)
    .map((entry, index) => {
      const label = [entry.category.trim(), entry.status.trim()].filter(Boolean).join(' | ')
      const body = entry.detail.trim() || entry.entity.trim()
      const text = label
        ? `Current world state:\n- ${entry.entity.trim()}: ${body} (${label})`
        : `Current world state:\n- ${entry.entity.trim()}: ${body}`
      return {
        estimatedTokens: estimateContextBlockTokens(text),
        id: `world-state.${index}`,
        layer: 'lore' as const,
        priority: 840,
        source: `world-state.${entry.entity.trim() || index}`,
        text,
      }
    })
}

function buildRecentChatBlocks(
  transcript: ChatMessage[],
  character: CharacterSummary,
  userName: string,
): ContextBlock[] {
  const characterName = getCharacterName(character)
  const history = transcript
    .filter((message, index) => {
      if (index === 0 && message.chat_metadata) {
        return false
      }

      return Boolean(resolveChatMessageText(message).trim())
    })
    .map((message, index) => ({ index, message }))

  const strictStart = Math.max(0, history.length - 8)
  const softStart = Math.max(0, strictStart - 8)
  const selected = history.slice(softStart)

  return selected.map(({ index, message }) => {
    const text = `${message.is_user ? userName : message.name?.trim() || characterName}: ${resolveChatMessageText(message).trim()}`
    const strict = index >= strictStart
    return {
      estimatedTokens: estimateContextBlockTokens(text),
      id: `recent.${message.is_user ? 'user' : 'assistant'}.${index}`,
      layer: 'recent' as const,
      pinned: strict,
      priority: strict ? 880 : 650,
      source: strict ? `recent.strict.${index}` : `recent.soft.${index}`,
      text,
    }
  })
}

function resolveChatMessageText(message: ChatMessage): string {
  if (message.extra && typeof message.extra === 'object' && 'display_text' in message.extra) {
    const displayText = Reflect.get(message.extra, 'display_text')
    if (typeof displayText === 'string' && displayText.trim()) {
      return displayText
    }
  }

  return typeof message.mes === 'string' ? message.mes : ''
}

function formatSummaryHeading(kind: SessionSummary['summaryKind']): string {
  switch (kind) {
    case 'scene':
      return 'Scene Summary'
    case 'relationship':
      return 'Relationship Summary'
    case 'open_loops':
      return 'Open Loops'
    case 'session':
    default:
      return 'Session Summary'
  }
}

function resolveRecentRole(id: string): ChatCompletionMessage['role'] {
  if (id.includes('.user.')) {
    return 'user'
  }

  return 'assistant'
}
