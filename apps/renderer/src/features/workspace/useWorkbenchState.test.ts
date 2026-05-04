import { describe, expect, test } from 'vitest'

import type { CharacterSummary, ChatMessage, GenerationContextResult } from '@yggdrasil/api-client'

import {
  buildReplyRetrievalQuery,
  buildContinuationRetrievalQuery,
  buildContinuationTextPrompt,
  buildDraftAssistTextPrompt,
  buildDraftAssistRetrievalQuery,
  buildDraftAssistInstruction,
  buildDraftAssistRequest,
  parseGeneratedSessionSummaryBundle,
  sanitizeDraftSuggestion,
} from './useWorkbenchState'

describe('draft assist helpers', () => {
  const character: CharacterSummary = {
    avatar: 'arcueid.png',
    chat_size: 0,
    description: 'A radiant princess vampire with sudden intensity.',
    first_mes: 'Found you.',
    mes_example: '{{char}}: Hurry.\n{{user}}: I am trying.',
    name: 'Arcueid',
    personality: 'Direct and curious.',
    post_history_instructions: 'Keep the supernatural tension taut.',
    scenario: 'Night streets under pursuit.',
    system_prompt: '',
  }

  const baseChat: ChatMessage[] = [
    { chat_metadata: { integrity: 'test' } },
    { is_user: false, mes: 'Do not slow down now.', name: 'Arcueid' },
    { is_user: true, mes: 'The alley ahead is blocked.', name: 'Shiki' },
  ]

  const generationContext: GenerationContextResult = {
    characterSnippets: [],
    directiveSnippets: [{ content: 'Keep the prose sharp and nocturnal.', label: 'Style', sourceName: 'global' }],
    lorebookSnippets: [{ bookName: 'Tsukihime', content: 'Roa is hunting through the city tonight.', keys: ['Roa'], score: 0.88 }],
    narrativeMemories: [{ id: 'm1', characterName: 'Arcueid', content: 'Shiki already agreed to trust Arcueid.', createdAt: 1, fileName: 'session-1', importance: 0.94, kind: 'relationship', summary: 'Trust established', tags: ['trust'], updatedAt: 1 }],
    retrievalHits: [],
    sessionSnippets: [],
    worldStateSnippets: [{ category: 'scene', detail: 'Moonlit blood mist is rising across the alley mouth.', entity: 'Alley Mouth', status: 'dangerous' }],
  }

  test('builds a draft assist request that carries context, memory, and continuation guidance', () => {
    const request = buildDraftAssistRequest({
      authorName: 'Shiki',
      baseChat,
      character,
      draftMessage: 'I grab your hand and',
      generationContext,
      mode: 'continue',
    })

    expect(request.messages[0]?.role).toBe('system')
    expect(request.messages[0]?.content).toContain('Keep the prose sharp and nocturnal.')
    expect(request.messages[0]?.content).toContain('Roa is hunting through the city tonight.')
    expect(request.messages[0]?.content).toContain('Shiki already agreed to trust Arcueid.')
    expect(request.messages[0]?.content).toContain('Moonlit blood mist is rising across the alley mouth.')
    expect(request.messages.at(-1)?.content).toContain('continue it naturally instead of restarting from scratch')
    expect(request.messages.at(-1)?.content).toContain('I grab your hand and')
    expect(request.prompt.endsWith('\nShiki:')).toBe(true)
    expect(request.prompt).toContain('Drafting instruction:')
    expect(request.stopSequences).toEqual(['\nArcueid:', '\nShiki:'])
    expect(request.traceQuery).toContain('I grab your hand and')
  })

  test('draft assist instruction for continue mode explicitly forbids restarting from scratch', () => {
    const instruction = buildDraftAssistInstruction(
      'continue',
      'Shiki',
      'Current partial draft from Shiki:\nI grab your hand and',
    )

    expect(instruction).toContain('current conversation, character setup, active lorebooks, retrieval context, and narrative memories')
    expect(instruction).toContain('continue it naturally instead of restarting from scratch')
  })

  test('draft assist falls back to fresh scene continuation rules when the draft is empty', () => {
    const instruction = buildDraftAssistInstruction(
      'compress',
      'Shiki',
      'Shiki has not written a draft yet. Write a fresh next contribution that fits the current scene.',
    )

    expect(instruction).toContain('No user draft currently exists.')
    expect(instruction).toContain('Write a fresh next contribution grounded in the latest scene')
    expect(instruction).toContain('continue it naturally instead of restarting from scratch')
    expect(instruction).not.toContain('Make the draft shorter, sharper')
  })

  test('draft assist retrieval query stays anchored to the latest turns instead of the instruction text', () => {
    const query = buildDraftAssistRetrievalQuery(baseChat, 'Shiki', 'Arcueid', '')

    expect(query).toContain('Arcueid: Do not slow down now.')
    expect(query).toContain('Shiki: The alley ahead is blocked.')
    expect(query).not.toContain('You are helping')
  })

  test('draft assist text prompt injects instruction before the final author cue', () => {
    const prompt = buildDraftAssistTextPrompt(
      'System block\n\nArcueid: Found you.\n\nShiki:',
      'Continue it naturally instead of restarting from scratch.',
      'Shiki',
    )

    expect(prompt).toContain('Drafting instruction:\nContinue it naturally instead of restarting from scratch.')
    expect(prompt.endsWith('\n\nShiki:')).toBe(true)
  })

  test('continuation retrieval query stays anchored to current text and latest turns', () => {
    const query = buildContinuationRetrievalQuery(baseChat, 'Shiki', 'Arcueid', 'Found you')

    expect(query).toContain('Found you')
    expect(query).toContain('Arcueid: Do not slow down now.')
    expect(query).toContain('Shiki: The alley ahead is blocked.')
  })

  test('reply retrieval query ignores UI placeholder text and keeps only recent turns', () => {
    const query = buildReplyRetrievalQuery(baseChat, 'Shiki', 'Arcueid')

    expect(query).toContain('Arcueid: Do not slow down now.')
    expect(query).toContain('Shiki: The alley ahead is blocked.')
    expect(query).not.toContain('正在重新生成回复')
  })

  test('continuation text prompt includes instruction and resumes from the partial assistant reply', () => {
    const prompt = buildContinuationTextPrompt(
      'System block\n\nArcueid: Found you.\n\nArcueid:',
      'Continue the last reply exactly where it stops.',
      'Arcueid',
      '*She steps closer* "Found you',
    )

    expect(prompt).toContain('Continuation instruction:\nContinue the last reply exactly where it stops.')
    expect(prompt.endsWith('\n\nArcueid: *She steps closer* "Found you')).toBe(true)
  })

  test('sanitizes fenced and speaker-prefixed draft suggestions into directly usable text', () => {
    expect(sanitizeDraftSuggestion('```txt\nShiki: "Stay behind me."\n```', 'Shiki')).toBe('Stay behind me.')
  })

  test('parses a tagged summary bundle into multiple summary records', () => {
    expect(
      parseGeneratedSessionSummaryBundle([
        '[session]Overall pursuit pressure is rising.[/session]',
        '[scene]They are trapped near the overpass.[/scene]',
        '[relationship]Arcueid is trusting Shiki more openly.[/relationship]',
        '[open_loops]Roa is still somewhere ahead.[/open_loops]',
      ].join('\n')),
    ).toEqual([
      { content: 'Overall pursuit pressure is rising.', summaryKind: 'session' },
      { content: 'They are trapped near the overpass.', summaryKind: 'scene' },
      { content: 'Arcueid is trusting Shiki more openly.', summaryKind: 'relationship' },
      { content: 'Roa is still somewhere ahead.', summaryKind: 'open_loops' },
    ])
  })
})
