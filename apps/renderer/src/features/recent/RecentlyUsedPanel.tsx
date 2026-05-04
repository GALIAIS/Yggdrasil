import { useMemo } from 'react'
import { HistoryIcon } from 'lucide-react'
import type { CharacterSummary, WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { useI18n } from '@/lib/i18n'
import type { WorkbenchSection } from '@/lib/workbench-layout'
import { SectionBrowser } from '@/features/workspace/SectionBrowser'
import {
  buildCatalogEntrySectionParams,
  resolveCatalogEntrySection,
  sortCatalogEntries,
  toCharacterCatalogEntries,
  toSectionActivityItem,
  toSectionRecord,
} from '@/features/workspace/catalog-entry-helpers'

const RECENT_ENTRY_KEYS = ['sessions', 'worlds', 'assets', 'backups', 'extensions', 'groups', 'groupChats'] as const

export interface RecentlyUsedPanelProps {
  catalog: WorkspaceCatalogPayload | null
  sortedCharacters: CharacterSummary[]
  onOpenSectionWith?: (section: WorkbenchSection, params?: Record<string, string>) => void
  onRestoreSession?: (avatar: string, fileId: string) => void
  onSelectCharacter?: (avatar: string) => void
  onSetSection?: (section: WorkbenchSection) => void
}

export function RecentlyUsedPanel({
  catalog,
  sortedCharacters,
  onOpenSectionWith,
  onRestoreSession,
  onSelectCharacter,
  onSetSection,
}: RecentlyUsedPanelProps) {
  const { t } = useI18n()
  const recentEntries = useMemo(() => {
    const characterEntries = toCharacterCatalogEntries(sortedCharacters).slice(0, 8)
    const catalogEntries = RECENT_ENTRY_KEYS.flatMap((key) => catalog?.entries[key] ?? [])
    return sortCatalogEntries([...catalogEntries, ...characterEntries]).slice(0, 24)
  }, [catalog, sortedCharacters])

  const recentTodayCount = recentEntries.filter((entry) => isToday(entry.updatedAt)).length
  const openableCount = recentEntries.filter((entry) => resolveCatalogEntrySection(entry)).length

  return (
    <SectionBrowser
      activity={recentEntries.slice(0, 4).map((entry) => toSectionActivityItem(entry, t))}
      description={t('recentlyUsedPage.description')}
      emptyDescription={t('sectionBrowser.empty.recently-used.description')}
      emptyTitle={t('sectionBrowser.empty.recently-used.title')}
      eyebrow={t('recentlyUsedPage.eyebrow')}
      icon={HistoryIcon}
      layout="single"
      metrics={[
        { label: t('recentlyUsedPage.metrics.touchedToday'), value: String(recentTodayCount), tone: 'good' },
        { label: t('recentlyUsedPage.metrics.pinnedRecents'), value: String(openableCount), tone: 'info' },
        { label: t('recentlyUsedPage.metrics.expiredCache'), value: String(catalog?.warningLines ?? 0), tone: 'accent' },
      ]}
      onOpenRecord={(record) => {
        const entry = recentEntries.find((item) => toSectionRecord(item, t).id === record.id)
        if (!entry) return
        if (entry.kind === 'chat' && entry.sourceAvatar && entry.sourceFileName) {
          onRestoreSession?.(entry.sourceAvatar, entry.sourceFileName)
          return
        }
        if (entry.kind === 'character' && entry.sourceAvatar) {
          if (onOpenSectionWith) {
            onOpenSectionWith('characters', {
              avatar: entry.sourceAvatar,
              name: entry.name,
            })
            return
          }
          onSelectCharacter?.(entry.sourceAvatar)
          onSetSection?.('characters')
          return
        }
        const targetSection = resolveCatalogEntrySection(entry)
        if (targetSection) {
          if (onOpenSectionWith) {
            onOpenSectionWith(targetSection, buildCatalogEntrySectionParams(entry))
            return
          }
          onSetSection?.(targetSection)
        }
      }}
      openActionLabel={t('sectionBrowser.actions.open')}
      records={recentEntries.map((entry) => {
        const record = toSectionRecord(entry, t)
        return {
          ...record,
          status: truncateStatus(record.status, 18),
        }
      })}
      title={t('nav.recentlyUsed')}
    />
  )
}

function truncateStatus(value: string, maxChars: number): string {
  const text = value.trim()
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function isToday(value: number | undefined): boolean {
  if (!value) return false
  const stamp = new Date(value)
  const now = new Date()
  return stamp.getFullYear() === now.getFullYear()
    && stamp.getMonth() === now.getMonth()
    && stamp.getDate() === now.getDate()
}
