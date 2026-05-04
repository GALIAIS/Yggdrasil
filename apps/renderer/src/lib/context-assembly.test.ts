import { describe, expect, test } from 'vitest'
import type { CharacterSummary, ChatMessage } from '@yggdrasil/api-client'

import {
  assembleGenerationContext,
  buildChatCompletionMessagesFromAssembly,
  buildTextPromptFromAssembly,
} from './context-assembly'

const character: CharacterSummary = {
  description: 'A bright vampire princess.',
  mes_example: '{{char}}: Move.\n{{user}}: Why?',
  name: 'Arcueid',
  personality: 'Direct and curious.',
  post_history_instructions: 'Keep the supernatural tension taut.',
  scenario: 'Night streets under pursuit.',
}

const transcript: ChatMessage[] = [
  { chat_metadata: { integrity: 'test' } },
  { is_user: false, mes: 'Found you.', name: 'Arcueid' },
  { is_user: true, mes: 'Who is after us?', name: 'Shiki' },
]

describe('context assembly', () => {
  test('includes summaries and retrieval blocks in the assembled system context', () => {
    const assembled = assembleGenerationContext({
      character,
      directiveSnippets: [{ content: 'Keep the prose sharp and nocturnal.', label: 'Style', sourceName: 'Moonlit Hunt' }],
      lorebookSnippets: [{ bookName: 'Tsukihime', content: 'Roa is hunting through the city.', keys: ['Roa'], score: 0.9 }],
      narrativeMemories: [{ characterName: 'Arcueid', content: 'Shiki already agreed to help.', createdAt: 1, id: 'm1', importance: 0.8, kind: 'event', summary: 'promise', tags: ['promise'], updatedAt: 1 }],
      sessionSnippets: [{ content: 'The alley already smells like iron.', ordinal: 4, role: 'assistant', score: 0.6 }],
      sessionSummaries: [{ content: 'They are already cornered near the overpass.', id: 's1', summaryKind: 'scene', updatedAt: 1 }],
      transcript,
      userName: 'Shiki',
      worldStateSnippets: [{ category: 'scene', detail: 'Red mist fills the platform.', entity: 'Platform', status: 'unstable' }],
    })

    const messages = buildChatCompletionMessagesFromAssembly(assembled)
    expect(messages[0]?.content).toContain('Scene Summary')
    expect(messages[0]?.content).toContain('Global directives:')
    expect(messages[0]?.content).toContain('Active lorebooks:')
    expect(messages[0]?.content).toContain('Relevant narrative memory:')
    expect(messages[1]?.content).toContain('Final reply format lock for this turn:')
    expect(messages.some((message) => message.role === 'user')).toBe(true)
  })

  test('builds a prompt that ends with the character cue', () => {
    const assembled = assembleGenerationContext({
      character,
      transcript,
      userName: 'Shiki',
    })

    const prompt = buildTextPromptFromAssembly(assembled, 'Arcueid', 'Shiki')
    expect(prompt.prompt.endsWith('Arcueid:')).toBe(true)
    expect(prompt.stopSequences).toEqual(['\nShiki:'])
  })
})
