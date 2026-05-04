import { describe, expect, test } from 'vitest'

import type { CharacterSummary, ChatMessage } from '@yggdrasil/api-client'

import {
  buildChatCompletionMessages,
  buildTextGenerationPrompt,
  removeChatMessage,
  resolveSelectedChatId,
  truncateChatTranscript,
  updateChatMessageText,
} from './chat'
import {
  BUILT_IN_MESSAGE_RENDER_TEMPLATES,
  normalizeStrictMessageRenderingOutput,
  parseMessageSegments,
} from './chat-rendering'

describe('buildTextGenerationPrompt', () => {
  test('builds a legacy text-generation prompt with speaker lines and stop sequences', () => {
    const character: CharacterSummary = {
      name: 'Seraphina',
      description: 'A gentle forest guardian.',
      personality: 'Warm and protective.',
      scenario: 'A quiet glade after a battle.',
      mes_example: '{{user}}: Hello\n{{char}}: Welcome back.',
    }

    const transcript: ChatMessage[] = [
      {
        chat_metadata: {
          integrity: 'test',
        },
      },
      {
        is_user: false,
        mes: 'You are safe now.',
        name: 'Seraphina',
      },
      {
        is_user: true,
        mes: 'Can you tell me where I am?',
        name: 'User',
      },
    ]

    const result = buildTextGenerationPrompt(character, transcript, 'User')

    expect(result.prompt).toContain('You are Seraphina in a private roleplay chat with User.')
    expect(result.prompt).toContain('Seraphina: You are safe now.')
    expect(result.prompt).toContain('User: Can you tell me where I am?')
    expect(result.prompt.endsWith('Seraphina:')).toBe(true)
    expect(result.stopSequences).toEqual(['\nUser:'])
  })

  test('injects directive, lorebook, and narrative memory context into prompts', () => {
    const character: CharacterSummary = {
      name: 'Arcueid',
      description: 'A powerful vampire princess.',
      personality: 'Direct, curious, intense.',
      scenario: 'Night city pursuit.',
      mes_example: '',
    }

    const transcript: ChatMessage[] = [
      { chat_metadata: { integrity: 'test' } },
      { is_user: false, mes: 'Found you.', name: 'Arcueid' },
      { is_user: true, mes: 'Who is after us?', name: 'Shiki' },
    ]

    const messages = buildChatCompletionMessages(
      character,
      transcript,
      'Shiki',
      undefined,
      [{ bookName: 'Tsukihime', content: '[Ancestors] Dead Apostles hunt rare bloodlines.', keys: ['Ancestors'], score: 7 }],
      [{ id: 'm1', characterName: 'Arcueid', content: 'Shiki witnessed Roa near the station.', importance: 0.9, kind: 'event', summary: 'Roa sighting', tags: ['Roa'], createdAt: 1, updatedAt: 1 }],
      [{ label: 'System prompt', sourceName: 'Moonlit Hunt', content: 'Lean into gothic suspense.' }],
      [{ category: 'scene', detail: 'The station platform is filling with crimson mist.', entity: 'Station Platform', status: 'unstable' }],
    )

    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toContain('Global directives:')
    expect(messages[0]?.content).toContain('Lean into gothic suspense.')
    expect(messages[0]?.content).toContain('Active lorebooks:')
    expect(messages[0]?.content).toContain('Dead Apostles hunt rare bloodlines.')
    expect(messages[0]?.content).toContain('Relevant narrative memory:')
    expect(messages[0]?.content).toContain('Shiki witnessed Roa near the station.')
    expect(messages[0]?.content).toContain('Current world state:')
    expect(messages[0]?.content).toContain('The station platform is filling with crimson mist.')
  })

  test('injects the active rendering format contract into the system prompt', () => {
    const character: CharacterSummary = {
      name: 'Arcueid',
      description: 'A powerful vampire princess.',
      personality: 'Direct, curious, intense.',
      scenario: 'Night city pursuit.',
      mes_example: '',
    }

    const messages = buildChatCompletionMessages(
      character,
      [{ chat_metadata: { integrity: 'test' } }],
      'Shiki',
      {
        message_rendering: {
          activeTemplateId: 'classic-novel',
          formatGuide: {
            customInstruction: 'Keep actions concise.',
            enabled: true,
            mode: 'strict',
          },
          overrides: {},
          renderNestedSegments: false,
          sampleText: '',
        },
      },
    )

    expect(messages[0]?.content).toContain('Output formatting:')
    expect(messages[0]?.content).toContain('Spoken dialogue uses matching wrappers “...”')
    expect(messages[0]?.content).toContain('Keep actions concise.')
  })

  test('adds a dedicated strict formatting lock system message when strict mode is enabled', () => {
    const character: CharacterSummary = {
      name: 'Arcueid',
      description: 'A powerful vampire princess.',
      personality: 'Direct, curious, intense.',
      scenario: 'Night city pursuit.',
      mes_example: '',
    }

    const messages = buildChatCompletionMessages(
      character,
      [{ chat_metadata: { integrity: 'test' } }],
      'Shiki',
      {
        message_rendering: {
          activeTemplateId: 'classic-novel',
          formatGuide: {
            customInstruction: '',
            enabled: true,
            mode: 'strict',
          },
          overrides: {},
          renderNestedSegments: false,
          sampleText: '',
        },
      },
    )

    expect(messages[1]).toEqual(
      expect.objectContaining({
        role: 'system',
      }),
    )
    expect(messages[1]?.content).toContain('Final reply format lock for this turn:')
    expect(messages[1]?.content).toContain('Do not output bare dialogue')
  })

  test('injects the strict formatting lock near the bottom of text generation prompts', () => {
    const character: CharacterSummary = {
      name: 'Arcueid',
      description: 'A powerful vampire princess.',
      personality: 'Direct, curious, intense.',
      scenario: 'Night city pursuit.',
      mes_example: '',
    }

    const prompt = buildTextGenerationPrompt(
      character,
      [{ chat_metadata: { integrity: 'test' } }],
      'Shiki',
      {
        message_rendering: {
          activeTemplateId: 'classic-novel',
          formatGuide: {
            customInstruction: '',
            enabled: true,
            mode: 'strict',
          },
          overrides: {},
          renderNestedSegments: false,
          sampleText: '',
        },
      },
    )

    expect(prompt.prompt).toContain('Final reply format lock for this turn:')
    expect(prompt.prompt).toContain('If any content does not fit dialogue, action, or thought')
  })
})

describe('transcript helpers', () => {
  test('updates message text and mirrored display_text when present', () => {
    const transcript: ChatMessage[] = [
      { chat_metadata: { integrity: 'test' } },
      { mes: 'Original', extra: { display_text: 'Original' } },
    ]

    const result = updateChatMessageText(transcript, 1, 'Updated')

    expect(result[1]?.mes).toBe('Updated')
    expect(result[1]?.extra?.display_text).toBe('Updated')
    expect(transcript[1]?.mes).toBe('Original')
  })

  test('removes the requested message and preserves the rest', () => {
    const transcript: ChatMessage[] = [
      { chat_metadata: { integrity: 'test' } },
      { mes: 'One' },
      { mes: 'Two' },
    ]

    const result = removeChatMessage(transcript, 1)

    expect(result).toHaveLength(2)
    expect(result[1]?.mes).toBe('Two')
  })

  test('truncates transcript through the selected message', () => {
    const transcript: ChatMessage[] = [
      { chat_metadata: { integrity: 'test' } },
      { mes: 'One' },
      { mes: 'Two' },
      { mes: 'Three' },
    ]

    const result = truncateChatTranscript(transcript, 2)

    expect(result.map((message) => message.mes ?? 'meta')).toEqual(['meta', 'One', 'Two'])
  })

  test('keeps the persisted selected chat when it still exists and falls back to the first item otherwise', () => {
    const chats = [
      { file_id: 'chat-a', file_name: 'Chat A' },
      { file_id: 'chat-b', file_name: 'Chat B' },
    ] as const

    expect(resolveSelectedChatId([...chats], 'chat-b')).toBe('chat-b')
    expect(resolveSelectedChatId([...chats], 'missing-chat')).toBe('chat-a')
    expect(resolveSelectedChatId([], 'missing-chat')).toBe('')
  })
})

describe('normalizeStrictMessageRenderingOutput', () => {
  test('normalizes common alternative markers into the active strict template', () => {
    const normalized = normalizeStrictMessageRenderingOutput(
      ['「嗯。」', '她应了一声。', '*她抬眸看向你。*', '（不能再拖下去了。）'].join('\n\n'),
      {
        activeTemplateId: 'classic-novel',
        formatGuide: {
          customInstruction: '',
          enabled: true,
          mode: 'strict' as const,
        },
        overrides: {},
        renderNestedSegments: false,
        sampleText: '',
      },
    )

    expect(normalized).toContain('“嗯。”')
    expect(normalized).toContain('> 她应了一声。')
    expect(normalized).toContain('*她抬眸看向你。*')
    expect(normalized).toContain('（不能再拖下去了。）')
  })

  test('normalizes partial and mixed dialogue wrappers into the active strict template', () => {
    const normalized = normalizeStrictMessageRenderingOutput(
      ['「带路吧。”', '“你先说。', '解释清楚。”'].join('\n\n'),
      {
        activeTemplateId: 'classic-novel',
        formatGuide: {
          customInstruction: '',
          enabled: true,
          mode: 'strict' as const,
        },
        overrides: {},
        renderNestedSegments: false,
        sampleText: '',
      },
    )

    expect(normalized).toContain('“带路吧。”')
    expect(normalized).toContain('“你先说。”')
    expect(normalized).toContain('“解释清楚。”')
  })
})

describe('parseMessageSegments', () => {
  test('keeps dialogue wrappers visible while hiding action and thought wrappers', () => {
    const segments = parseMessageSegments('“你好。” *她看着你。* （要冷静。）', {
      renderNestedSegments: false,
      template: BUILT_IN_MESSAGE_RENDER_TEMPLATES[0],
    })

    expect(segments).toEqual([
      expect.objectContaining({ kind: 'dialogue', text: '“你好。”' }),
      expect.objectContaining({ kind: 'plain', text: ' ' }),
      expect.objectContaining({ kind: 'action', text: '她看着你。' }),
      expect.objectContaining({ kind: 'plain', text: ' ' }),
      expect.objectContaining({ kind: 'thought', text: '要冷静。' }),
    ])
  })
})
