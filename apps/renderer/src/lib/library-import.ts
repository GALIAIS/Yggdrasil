import type { LorebookEntry } from '@/features/lorebooks/LorebookEditor'
import type { PresetData } from '@/features/presets/PresetEditor'
import type { StoryAssetKind, StoryAssetPayload } from '@/features/story/hooks'

export function parseLorebookImport(raw: string, fileName = 'lorebook.json'): { name: string; entries: LorebookEntry[] } {
  const parsed = parseJson(raw, fileName)
  const exportRecord = readLibraryExportRecord(parsed)
  const entries = normalizeLorebookEntries(exportRecord?.content ?? parsed)
  return {
    name: exportRecord?.name || stripExtension(fileName),
    entries,
  }
}

export function parsePresetImport(raw: string, fileName = 'preset.json'): PresetData {
  const parsed = parseJson(raw, fileName)
  const exportRecord = readLibraryExportRecord(parsed)
  return normalizePresetData(exportRecord?.content ?? parsed, exportRecord?.name || stripExtension(fileName))
}

export function parseStoryImport(
  raw: string,
  fileName = 'story.json',
): {
  kind: StoryAssetKind
  name: string
  payload: StoryAssetPayload
  tags: string[]
} {
  const parsed = parseJson(raw, fileName)
  const record = asRecord(parsed, '故事资产')

  const content = record.content
  const payloadSource =
    content && typeof content === 'object' && !Array.isArray(content) ? content : record
  const kind = normalizeStoryKind(record.kind)
  const name =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : stripExtension(fileName)

  return {
    kind,
    name,
    payload: normalizeStoryPayload(name, payloadSource),
    tags: normalizeStringArray(record.tags),
  }
}

function parseJson(raw: string, fileName: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${fileName} 不是有效的 JSON 文件。`)
  }
}

function readLibraryExportRecord(data: unknown): {
  content?: unknown
  name?: string
} | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }

  const record = data as Record<string, unknown>
  if (!('content' in record)) {
    return null
  }

  return {
    content: record.content,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : undefined,
  }
}

function normalizeLorebookEntries(data: unknown): LorebookEntry[] {
  if (!Array.isArray(data)) {
    throw new Error('世界书导入失败：内容必须是条目数组。')
  }

  return data.map((entry, index) => {
    const record = asRecord(entry, `世界书第 ${index + 1} 条`)
    const content = typeof record.content === 'string' ? record.content : ''

    return {
      id: typeof record.id === 'string' && record.id.trim() ? record.id : `entry-import-${Date.now()}-${index}`,
      keys: Array.isArray(record.keys)
        ? record.keys.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
      content,
      comment: typeof record.comment === 'string' ? record.comment : '',
      enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      selective: typeof record.selective === 'boolean' ? record.selective : false,
      scanDepth: typeof record.scanDepth === 'number' ? record.scanDepth : 2,
      tokenBudget: typeof record.tokenBudget === 'number' ? record.tokenBudget : 400,
    }
  })
}

function normalizePresetData(data: unknown, fallbackName: string): PresetData {
  const record = asRecord(data, '预设')

  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : fallbackName,
    temperature: toNumber(record.temperature, 1),
    top_p: toNumber(record.top_p, 1),
    top_k: toNumber(record.top_k, 40),
    repetition_penalty: toNumber(record.repetition_penalty, 1),
    max_tokens: toNumber(record.max_tokens, 2048),
    system_prompt: typeof record.system_prompt === 'string' ? record.system_prompt : '',
    instruct_template: typeof record.instruct_template === 'string' ? record.instruct_template : '',
  }
}

function normalizeStoryPayload(name: string, value: unknown): StoryAssetPayload {
  const source = asLooseRecord(value)
  return {
    title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : name,
    status: coerceStoryAssetStatus(source.status),
    summary: typeof source.summary === 'string' ? source.summary : '',
    notes: typeof source.notes === 'string' ? source.notes : '',
    tags: normalizeStringArray(source.tags),
    chapterId: typeof source.chapterId === 'string' && source.chapterId.trim() ? source.chapterId.trim() : null,
    linkedSession: normalizeLinkedSession(source.linkedSession),
    priority: typeof source.priority === 'string' ? source.priority : '',
    type: typeof source.type === 'string' ? source.type : '',
    sceneIds: normalizeStringArray(source.sceneIds),
  }
}

function normalizeStoryKind(value: unknown): StoryAssetKind {
  switch (value) {
    case 'chapters':
    case 'scenes':
    case 'story_cards':
    case 'plot_threads':
      return value
    default:
      throw new Error('故事资产导入失败：kind 不符合预期。')
  }
}

function coerceStoryAssetStatus(value: unknown): StoryAssetPayload['status'] {
  switch (value) {
    case 'idea':
    case 'draft':
    case 'active':
    case 'paused':
    case 'complete':
    case 'archived':
      return value
    default:
      return 'draft'
  }
}

function normalizeLinkedSession(value: unknown): StoryAssetPayload['linkedSession'] {
  const source = asLooseRecord(value)
  const avatar = typeof source.avatar === 'string' && source.avatar.trim() ? source.avatar.trim() : null
  const fileId = typeof source.fileId === 'string' && source.fileId.trim() ? source.fileId.trim() : null
  const fileName = typeof source.fileName === 'string' && source.fileName.trim() ? source.fileName.trim() : null

  if (!avatar && !fileId && !fileName) {
    return null
  }

  return { avatar, fileId, fileName }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}导入失败：文件结构不符合预期。`)
  }
  return value as Record<string, unknown>
}

function asLooseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim()
}
