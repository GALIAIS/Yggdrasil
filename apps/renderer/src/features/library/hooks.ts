import { useMemo, useState, useDeferredValue } from 'react'
import type { CharacterSummary, WorkspaceCatalogPayload } from '@yggdrasil/api-client'
import { resolvePresetDomainFromKind } from '@/features/presets/preset-domains'
import { getCharacterName } from '@/lib/character'
import { formatDateTime, toTimestamp } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'
import type { WorkbenchSection } from '@/lib/workbench-layout'

export type TypeFilter = 'all' | 'character' | 'lorebook' | 'preset' | 'group'

export interface LibraryFilterState {
  searchQuery: string
  typeFilter: TypeFilter
  currentPage: number
  pageSize: number
}

export interface LibraryItem {
  id: string
  kind: 'Character' | 'Lorebook' | 'Preset' | 'Group'
  avatar: string | null
  featured: boolean
  name: string
  tags: string[]
  updated: string
  updatedAt: number
  selected: boolean
  onSelect?: () => void
}

export function useLibraryFilter(
  characters: CharacterSummary[],
  catalog: WorkspaceCatalogPayload | null,
  selectedCharacterAvatar: string,
  onSelectCharacter: (avatar: string) => void,
  onOpenSection?: (section: WorkbenchSection, params?: Record<string, string>) => void,
) {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  const deferredSearchQuery = useDeferredValue(searchQuery)

  const allItems: LibraryItem[] = useMemo(() => {
    const items: LibraryItem[] = []

    // Add characters
    characters.forEach((character) => {
      const avatar = typeof character.avatar === 'string' ? character.avatar : null
      const updatedAt = toTimestamp(character.date_last_chat)
      const characterName = getCharacterName(character)
      items.push({
        id: `character-${avatar || characterName}`,
        kind: 'Character',
        avatar,
        featured: avatar === selectedCharacterAvatar,
        name: characterName,
        tags: Array.isArray(character.tags) ? character.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 3) : [],
        updated: formatDateTime(character.date_last_chat),
        updatedAt,
        selected: avatar === selectedCharacterAvatar,
        onSelect: avatar ? () => onSelectCharacter(avatar) : undefined,
      })
    })

    items.push(
      ...(catalog?.entries.worlds ?? []).map((entry) => ({
        id: `lorebook-${entry.name}`,
        kind: 'Lorebook' as const,
        avatar: null,
        featured: false,
        name: entry.name,
        tags: (entry.tags ?? []).slice(0, 3),
        updated: entry.updatedAt ? formatDateTime(entry.updatedAt) : t('common.unavailable'),
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
        selected: false,
        onSelect: () => onOpenSection?.('lorebooks', { name: entry.name }),
      })),
      ...[
        ...(catalog?.entries.openaiPresets ?? []),
        ...(catalog?.entries.novelPresets ?? []),
        ...(catalog?.entries.textgenPresets ?? []),
        ...(catalog?.entries.koboldPresets ?? []),
        ...(catalog?.entries.quickReplies ?? []),
        ...(catalog?.entries.sysprompts ?? []),
        ...(catalog?.entries.contexts ?? []),
        ...(catalog?.entries.instructs ?? []),
        ...(catalog?.entries.reasonings ?? []),
        ...(catalog?.entries.themes ?? []),
      ].map((entry) => ({
        id: `preset-${entry.kind}-${entry.name}`,
        kind: 'Preset' as const,
        avatar: null,
        featured: false,
        name: entry.name,
        tags: (entry.tags ?? []).slice(0, 3),
        updated: entry.updatedAt ? formatDateTime(entry.updatedAt) : t('common.unavailable'),
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
        selected: false,
        onSelect: () =>
          onOpenSection?.('presets', {
            name: entry.name,
            kind: entry.kind,
            domain: resolvePresetDomainFromKind(entry.kind) ?? 'textgenPresets',
          }),
      })),
      ...[
        ...(catalog?.entries.groups ?? []),
        ...(catalog?.entries.groupChats ?? []),
      ].map((entry) => ({
        id: `group-${entry.kind}-${entry.name}`,
        kind: 'Group' as const,
        avatar: null,
        featured: false,
        name: entry.name,
        tags: (entry.tags ?? []).slice(0, 3),
        updated: entry.updatedAt ? formatDateTime(entry.updatedAt) : t('common.unavailable'),
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
        selected: false,
        onSelect: () =>
          onOpenSection?.('groups', {
            name: entry.name,
            kind: entry.kind,
            domain: entry.kind === 'group-chat' ? 'groupChats' : 'groups',
          }),
      })),
    )

    return items.sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt
      }
      return left.name.localeCompare(right.name, 'zh-CN')
    })
  }, [catalog, characters, onOpenSection, selectedCharacterAvatar, onSelectCharacter, t])

  // Filter items based on search and type
  const filteredItems: LibraryItem[] = useMemo(() => {
    return allItems.filter((item) => {
      // Apply type filter
      if (typeFilter !== 'all') {
        if (typeFilter === 'character' && item.kind !== 'Character') return false
        if (typeFilter === 'lorebook' && item.kind !== 'Lorebook') return false
        if (typeFilter === 'preset' && item.kind !== 'Preset') return false
        if (typeFilter === 'group' && item.kind !== 'Group') return false
      }

      // Apply search filter (case-insensitive)
      if (deferredSearchQuery) {
        const query = deferredSearchQuery.toLowerCase()
        return (
          item.name.toLowerCase().includes(query) ||
          item.tags.some((tag) => tag.toLowerCase().includes(query))
        )
      }

      return true
    })
  }, [allItems, typeFilter, deferredSearchQuery])

  // Paginate items
  const totalPages = Math.ceil(filteredItems.length / pageSize)
  const resolvedCurrentPage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1
  const startIndex = (resolvedCurrentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedItems = filteredItems.slice(startIndex, endIndex)

  return {
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    currentPage: resolvedCurrentPage,
    setCurrentPage,
    pageSize,
    items: paginatedItems,
    totalItems: filteredItems.length,
    totalPages,
    stats: {
      characters: characters.length,
      lorebooks: catalog?.counts.worlds ?? 0,
      presets:
        (catalog?.counts.openaiPresets ?? 0) +
        (catalog?.counts.novelPresets ?? 0) +
        (catalog?.counts.textgenPresets ?? 0) +
        (catalog?.counts.koboldPresets ?? 0) +
        (catalog?.counts.quickReplies ?? 0) +
        (catalog?.counts.sysprompts ?? 0) +
        (catalog?.counts.contexts ?? 0) +
        (catalog?.counts.instructs ?? 0) +
        (catalog?.counts.reasonings ?? 0) +
        (catalog?.counts.themes ?? 0),
      groups: (catalog?.counts.groups ?? 0) + (catalog?.counts.groupChats ?? 0),
    },
  }
}
