import type { CharacterSummary, WorkspaceCatalogEntry } from '@yggdrasil/api-client'

import { resolvePresetDomainFromKind } from '@/features/presets/preset-domains'
import { getCharacterName } from '@/lib/character'
import { formatDateTime, toTimestamp } from '@/lib/formatters'
import type { WorkbenchSection } from '@/lib/workbench-layout'
import type { SectionActivityItem, SectionRecord } from './SectionBrowser'

type Translator = (key: string, params?: Record<string, string | number>) => string

export function describeCatalogEntryCategory(entry: WorkspaceCatalogEntry, t: Translator): string {
  switch (entry.kind) {
    case 'chat':
      return t('nav.sessions')
    case 'world':
      return t('nav.lorebooks')
    case 'context':
    case 'instruct':
    case 'sysprompt':
    case 'reasoning':
    case 'openai-preset':
    case 'novel-preset':
    case 'textgen-preset':
    case 'kobold-preset':
    case 'quick-reply':
    case 'theme':
      return t('nav.presets')
    case 'image':
    case 'audio':
    case 'video':
    case 'background':
    case 'asset':
      return t('nav.assets')
    case 'group':
    case 'group-chat':
      return t('nav.groupsLabel')
    case 'extension':
      return t('nav.extensions')
    case 'backup':
    case 'archive':
      return t('nav.backups')
    case 'log':
      return t('nav.logs')
    case 'character':
      return t('nav.characters')
    default:
      return t('common.unknown')
  }
}

export function describeCatalogEntryStatus(entry: WorkspaceCatalogEntry, t: Translator): string {
  if (entry.disabled) return t('common.disabled')
  if (entry.note?.trim()) return entry.note
  if (entry.kind === 'chat' && typeof entry.itemCount === 'number') {
    return t('sectionBrowser.sessionItems', { count: entry.itemCount })
  }
  if (typeof entry.itemCount === 'number') return `${entry.itemCount} ${t('common.items')}`
  if (typeof entry.sizeBytes === 'number') return formatBytes(entry.sizeBytes)
  return t('common.ready')
}

export function toSectionRecord(entry: WorkspaceCatalogEntry, t: Translator): SectionRecord {
  const sessionOwner = entry.kind === 'chat' ? entry.tags?.[0] : undefined
  return {
    id: [entry.kind, entry.sourceAvatar ?? '', entry.sourceFileName ?? entry.name, entry.updatedAt ?? ''].join('::'),
    name: entry.name,
    category: sessionOwner || describeCatalogEntryCategory(entry, t),
    detail: entry.note?.trim() || undefined,
    status: describeCatalogEntryStatus(entry, t),
    sourceAvatar: entry.sourceAvatar,
    sourceFileName: entry.sourceFileName,
    updated: entry.updatedAt ? formatDateTime(entry.updatedAt) : t('common.unavailable'),
    tags: entry.kind === 'chat' ? [] : (entry.tags ?? []).slice(0, 3),
  }
}

export function toSectionActivityItem(entry: WorkspaceCatalogEntry, t: Translator): SectionActivityItem {
  return {
    label: entry.name,
    detail: entry.note ?? describeCatalogEntryStatus(entry, t),
    time: entry.updatedAt ? formatDateTime(entry.updatedAt) : t('common.unavailable'),
  }
}

export function toCharacterCatalogEntries(characters: CharacterSummary[]): WorkspaceCatalogEntry[] {
  return characters.map((character) => ({
    kind: 'character',
    name: getCharacterName(character),
    itemCount: typeof character.chat_size === 'number' ? character.chat_size : 0,
    note: character.description?.trim() || undefined,
    sourceAvatar: typeof character.avatar === 'string' ? character.avatar : undefined,
    tags: character.tags ?? [],
    updatedAt: toTimestamp(character.date_last_chat),
  }))
}

export function resolveCatalogEntrySection(entry: WorkspaceCatalogEntry): WorkbenchSection | null {
  switch (entry.kind) {
    case 'chat':
      return 'sessions'
    case 'world':
      return 'lorebooks'
    case 'context':
    case 'instruct':
    case 'sysprompt':
    case 'reasoning':
    case 'openai-preset':
    case 'novel-preset':
    case 'textgen-preset':
    case 'kobold-preset':
    case 'quick-reply':
    case 'theme':
      return 'presets'
    case 'image':
    case 'audio':
    case 'video':
    case 'background':
    case 'asset':
      return 'assets'
    case 'group':
    case 'group-chat':
      return 'groups'
    case 'extension':
      return 'extensions'
    case 'backup':
    case 'archive':
      return 'backups'
    case 'log':
      return 'logs'
    case 'character':
      return 'characters'
    default:
      return null
  }
}

export function buildCatalogEntrySectionParams(entry: WorkspaceCatalogEntry): Record<string, string> {
  const params: Record<string, string> = { name: entry.name }

  if (entry.kind === 'chat') {
    if (entry.sourceAvatar) {
      params.avatar = entry.sourceAvatar
    }
    if (entry.sourceFileName) {
      params.fileId = entry.sourceFileName
    }
    return params
  }

  const presetDomain = resolvePresetDomainFromKind(entry.kind)
  if (presetDomain) {
    params.kind = entry.kind
    params.domain = presetDomain
    return params
  }

  if (entry.kind === 'group' || entry.kind === 'group-chat') {
    params.kind = entry.kind
    params.domain = entry.kind === 'group-chat' ? 'groupChats' : 'groups'
    return params
  }

  if (
    entry.kind === 'image'
    || entry.kind === 'audio'
    || entry.kind === 'video'
    || entry.kind === 'background'
    || entry.kind === 'asset'
  ) {
    params.kind = entry.kind
    params.domain = entry.kind === 'background' ? 'backgrounds' : 'assets'
    return params
  }

  if (entry.kind === 'character' && entry.sourceAvatar) {
    params.avatar = entry.sourceAvatar
    return params
  }

  return params
}

export function resolveCatalogEntryActionLabel(entry: WorkspaceCatalogEntry, t: Translator): string {
  return entry.kind === 'chat' ? t('sectionBrowser.actions.restore') : t('sectionBrowser.actions.open')
}

export function sortCatalogEntries(entries: WorkspaceCatalogEntry[]): WorkspaceCatalogEntry[] {
  return entries
    .slice()
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || left.name.localeCompare(right.name, 'zh-CN'))
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
