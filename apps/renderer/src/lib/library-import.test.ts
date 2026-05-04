import { describe, expect, test } from 'vitest'

import { parseLorebookImport, parsePresetImport, parseStoryImport } from './library-import'

describe('library-import', () => {
  test('parses lorebook entry arrays from json', () => {
    const result = parseLorebookImport(JSON.stringify([
      {
        id: 'entry-1',
        keys: ['tavern'],
        content: 'Lore content',
        comment: 'Note',
        enabled: true,
        selective: false,
        scanDepth: 2,
        tokenBudget: 300,
      },
    ]), 'eldoria.json')

    expect(result.name).toBe('eldoria')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.keys).toEqual(['tavern'])
  })

  test('parses exported lorebook documents', () => {
    const result = parseLorebookImport(JSON.stringify({
      domain: 'worlds',
      name: '月姬世界观设定',
      kind: 'world',
      content: [
        {
          id: 'entry-1',
          keys: ['千年城'],
          content: '城堡在月下沉默伫立。',
          comment: 'location',
          enabled: true,
        },
      ],
    }), 'wrapped-world.json')

    expect(result.name).toBe('月姬世界观设定')
    expect(result.entries[0]?.keys).toEqual(['千年城'])
  })

  test('parses preset json payloads', () => {
    const result = parsePresetImport(JSON.stringify({
      name: 'Balanced',
      temperature: 0.8,
      top_p: 0.95,
      top_k: 30,
      repetition_penalty: 1.1,
      max_tokens: 1024,
      system_prompt: 'Stay steady.',
      instruct_template: '{{input}}',
    }), 'balanced.json')

    expect(result.name).toBe('Balanced')
    expect(result.temperature).toBe(0.8)
    expect(result.max_tokens).toBe(1024)
  })

  test('parses exported preset documents', () => {
    const result = parsePresetImport(JSON.stringify({
      domain: 'openaiPresets',
      name: 'Moonlit Balance',
      kind: 'openaiPreset',
      content: {
        temperature: 0.72,
        top_p: 0.93,
        max_tokens: 1536,
      },
    }), 'wrapped-preset.json')

    expect(result.name).toBe('Moonlit Balance')
    expect(result.temperature).toBe(0.72)
    expect(result.max_tokens).toBe(1536)
  })

  test('parses exported story asset documents', () => {
    const result = parseStoryImport(JSON.stringify({
      domain: 'story',
      name: 'Moonlit Promise',
      kind: 'scenes',
      tags: ['moon', 'promise'],
      content: {
        title: 'Moonlit Promise',
        status: 'active',
        summary: 'A quiet exchange beneath the moon.',
        notes: 'Remember the earlier vow.',
        tags: ['moon', 'promise'],
        linkedSession: {
          avatar: 'arcueid-brunestud.png',
          fileId: 'Moonlit Promise.jsonl',
          fileName: 'Moonlit Promise.jsonl',
        },
      },
    }), 'moonlit-promise.json')

    expect(result.kind).toBe('scenes')
    expect(result.name).toBe('Moonlit Promise')
    expect(result.tags).toEqual(['moon', 'promise'])
    expect(result.payload.status).toBe('active')
    expect(result.payload.linkedSession?.fileId).toBe('Moonlit Promise.jsonl')
  })
})
