import { describe, expect, test } from 'vitest'

import { fitBlocksIntoBudget, resolveContextBudget, type ContextBlock } from './context-budget'

describe('context budget helpers', () => {
  test('resolves a conservative input budget from settings', () => {
    expect(resolveContextBudget({
      amount_gen: 1200,
      max_context: 10000,
    })).toEqual({
      maxContext: 10000,
      reservedOutput: 1200,
      usableInputBudget: 7920,
    })
  })

  test('keeps pinned and higher priority blocks before lower priority blocks', () => {
    const blocks: ContextBlock[] = [
      { estimatedTokens: 300, id: 'lore.1', layer: 'lore', priority: 100, source: 'lore.1', text: 'lore' },
      { estimatedTokens: 300, id: 'system.1', layer: 'system', pinned: true, priority: 1000, source: 'system.1', text: 'system' },
      { estimatedTokens: 300, id: 'recent.1', layer: 'recent', priority: 800, source: 'recent.1', text: 'recent' },
    ]

    const result = fitBlocksIntoBudget(blocks, {
      maxContext: 4000,
      reservedOutput: 800,
      usableInputBudget: 650,
    })

    expect(result.keptBlocks.map((block) => block.id)).toEqual(['system.1', 'recent.1'])
    expect(result.droppedBlocks.map((block) => block.id)).toEqual(['lore.1'])
  })

  test('preserves original transcript order after selecting blocks by priority', () => {
    const blocks: ContextBlock[] = [
      { estimatedTokens: 100, id: 'system.1', layer: 'system', pinned: true, priority: 1000, source: 'system.1', text: 'system' },
      { estimatedTokens: 100, id: 'recent.strict.2', layer: 'recent', pinned: true, priority: 880, source: 'recent.strict.2', text: 'assistant turn 2' },
      { estimatedTokens: 100, id: 'recent.strict.10', layer: 'recent', pinned: true, priority: 880, source: 'recent.strict.10', text: 'assistant turn 10' },
      { estimatedTokens: 100, id: 'recent.strict.11', layer: 'recent', pinned: true, priority: 880, source: 'recent.strict.11', text: 'user turn 11' },
    ]

    const result = fitBlocksIntoBudget(blocks, {
      maxContext: 4000,
      reservedOutput: 800,
      usableInputBudget: 450,
    })

    expect(result.keptBlocks.map((block) => block.id)).toEqual([
      'system.1',
      'recent.strict.2',
      'recent.strict.10',
      'recent.strict.11',
    ])
  })
})
