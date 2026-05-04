import type { AppSettings } from '@yggdrasil/api-client'

export type ContextLayer = 'system' | 'recent' | 'summary' | 'memory' | 'lore' | 'retrieval'

export type ContextBlock = {
  estimatedTokens: number
  id: string
  layer: ContextLayer
  pinned?: boolean
  priority: number
  source: string
  text: string
}

export type ContextBudget = {
  maxContext: number
  reservedOutput: number
  usableInputBudget: number
}

export type ContextBudgetDebugEntry = {
  estimatedTokens: number
  layer: ContextLayer
  preview: string
  reason?: string
  source: string
}

export type ContextBudgetResult = ContextBudget & {
  droppedBlocks: ContextBlock[]
  droppedDebug: ContextBudgetDebugEntry[]
  keptBlocks: ContextBlock[]
  keptDebug: ContextBudgetDebugEntry[]
  usedTokens: number
}

export function resolveContextBudget(settings: AppSettings | null | undefined): ContextBudget {
  const maxContext = resolvePositiveNumber(settings?.max_context, 12_000)
  const reservedOutput = Math.max(
    256,
    resolvePositiveNumber(settings?.amount_gen, 0),
    resolvePositiveNumber(settings?.openai_max_tokens, 0),
  )
  const usableInputBudget = Math.max(
    512,
    Math.floor((maxContext - reservedOutput) * 0.9),
  )

  return {
    maxContext,
    reservedOutput,
    usableInputBudget,
  }
}

export function fitBlocksIntoBudget(
  blocks: ContextBlock[],
  budget: ContextBudget,
): ContextBudgetResult {
  const normalized = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.text.trim().length > 0 && block.estimatedTokens > 0)

  const ranked = [...normalized].sort((left, right) => {
    if (Boolean(left.block.pinned) !== Boolean(right.block.pinned)) {
      return left.block.pinned ? -1 : 1
    }

    if (left.block.priority !== right.block.priority) {
      return right.block.priority - left.block.priority
    }

    return left.index - right.index
  })

  const keptEntries: Array<(typeof normalized)[number]> = []
  const droppedEntries: Array<(typeof normalized)[number]> = []
  let usedTokens = 0

  for (const entry of ranked) {
    const { block } = entry
    const canFit = usedTokens + block.estimatedTokens <= budget.usableInputBudget
    if (canFit || (keptEntries.length === 0 && block.layer === 'system')) {
      keptEntries.push(entry)
      usedTokens += block.estimatedTokens
    } else {
      droppedEntries.push(entry)
    }
  }

  const keptBlocks = keptEntries
    .sort((left, right) => left.index - right.index)
    .map(({ block }) => block)
  const droppedBlocks = droppedEntries
    .sort((left, right) => left.index - right.index)
    .map(({ block }) => block)

  return {
    ...budget,
    droppedBlocks,
    droppedDebug: droppedBlocks.map((block) => ({
      estimatedTokens: block.estimatedTokens,
      layer: block.layer,
      preview: block.text.slice(0, 120),
      reason: 'budget',
      source: block.source,
    })),
    keptBlocks,
    keptDebug: keptBlocks.map((block) => ({
      estimatedTokens: block.estimatedTokens,
      layer: block.layer,
      preview: block.text.slice(0, 120),
      source: block.source,
    })),
    usedTokens,
  }
}

function resolvePositiveNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.round(parsed)
}
