import type { CharacterSummary, SettingsPayload, WorkspaceCatalogEntry, WorkspaceCatalogPayload } from '@yggdrasil/api-client'
import {
  BookOpenIcon,
  DatabaseIcon,
  ImageIcon,
  LayoutGridIcon,
  PuzzleIcon,
  ScrollTextIcon,
  SlidersHorizontalIcon,
  ServerIcon,
  SquareLibraryIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react'

import { toTimestamp } from '@/lib/formatters'
import type { WorkbenchSection } from '@/lib/workbench-layout'
import type { SectionActivityItem, SectionBrowserProps, SectionRecord } from './SectionBrowser'
import {
  sortCatalogEntries,
  toCharacterCatalogEntries,
  toSectionActivityItem,
  toSectionRecord,
} from './catalog-entry-helpers'

type Translator = (key: string, params?: Record<string, string | number>) => string

type BrowserSection = Exclude<WorkbenchSection, 'workbench' | 'settings' | 'system'>

interface SectionDataArgs {
  catalog: WorkspaceCatalogPayload | null
  section: BrowserSection
  settings: SettingsPayload | null
  sortedCharacters: CharacterSummary[]
  t: Translator
}

const EMPTY_TITLE = {
  assets: 'sectionBrowser.empty.assets.title',
  backups: 'sectionBrowser.empty.backups.title',
  characters: 'sectionBrowser.empty.characters.title',
  extensions: 'sectionBrowser.empty.extensions.title',
  groups: 'sectionBrowser.empty.groups.title',
  library: 'sectionBrowser.empty.library.title',
  lorebooks: 'sectionBrowser.empty.lorebooks.title',
  logs: 'sectionBrowser.empty.logs.title',
  presets: 'sectionBrowser.empty.presets.title',
  projects: 'sectionBrowser.empty.library.title',
  providers: 'sectionBrowser.empty.providers.title',
  'recently-used': 'sectionBrowser.empty.recently-used.title',
  sessions: 'sectionBrowser.empty.sessions.title',
  story: 'sectionBrowser.empty.library.title',
  templates: 'sectionBrowser.empty.templates.title',
} as const

const EMPTY_DESCRIPTION = {
  assets: 'sectionBrowser.empty.assets.description',
  backups: 'sectionBrowser.empty.backups.description',
  characters: 'sectionBrowser.empty.characters.description',
  extensions: 'sectionBrowser.empty.extensions.description',
  groups: 'sectionBrowser.empty.groups.description',
  library: 'sectionBrowser.empty.library.description',
  lorebooks: 'sectionBrowser.empty.lorebooks.description',
  logs: 'sectionBrowser.empty.logs.description',
  presets: 'sectionBrowser.empty.presets.description',
  projects: 'sectionBrowser.empty.library.description',
  providers: 'sectionBrowser.empty.providers.description',
  'recently-used': 'sectionBrowser.empty.recently-used.description',
  sessions: 'sectionBrowser.empty.sessions.description',
  story: 'sectionBrowser.empty.library.description',
  templates: 'sectionBrowser.empty.templates.description',
} as const

export function buildSectionBrowserData({
  catalog,
  section,
  settings,
  sortedCharacters,
  t,
}: SectionDataArgs): SectionBrowserProps {
  switch (section) {
    case 'sessions':
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.chatFiles'), value: String(catalog?.totalChats ?? 0), tone: 'good' },
          { label: t('sectionBrowser.metrics.messages'), value: String(catalog?.totalMessages ?? 0), tone: 'info' },
          { label: t('sectionBrowser.metrics.recentUpdates'), value: String(countRecentEntries(catalog?.entries.sessions ?? [])), tone: 'accent' },
        ],
        records: toRecords(catalog?.entries.sessions ?? [], t),
        activity: toActivity(catalog?.entries.sessions ?? [], t),
      })
    case 'templates': {
      const templateEntries = mergeCatalogEntries(catalog, ['sysprompts', 'contexts', 'instructs', 'reasonings', 'quickReplies'])
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(templateEntries.length), tone: 'good' },
          { label: t('sectionBrowser.metrics.quickReplies'), value: String(catalog?.counts.quickReplies ?? 0), tone: 'info' },
          { label: t('sectionBrowser.metrics.themes'), value: String(catalog?.counts.themes ?? 0), tone: 'accent' },
        ],
        records: toRecords(templateEntries, t),
        activity: toActivity(templateEntries, t),
      })
    }
    case 'recently-used': {
      const recentEntries = mergeCatalogEntries(catalog, ['sessions', 'worlds', 'assets', 'backups', 'extensions', 'groups'])
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(recentEntries.length), tone: 'good' },
          { label: t('sectionBrowser.metrics.recentUpdates'), value: String(countRecentEntries(recentEntries)), tone: 'info' },
          { label: t('sectionBrowser.metrics.warnings'), value: String(catalog?.warningLines ?? 0), tone: 'accent' },
        ],
        records: toRecords(recentEntries, t),
        activity: toActivity(recentEntries, t),
      })
    }
    case 'library': {
      const libraryEntries = [
        ...toCharacterCatalogEntries(sortedCharacters),
        ...mergeCatalogEntries(catalog, ['worlds', 'openaiPresets', 'novelPresets', 'textgenPresets', 'koboldPresets', 'quickReplies', 'assets', 'groups']),
      ]
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(libraryEntries.length), tone: 'good' },
          { label: t('sectionBrowser.metrics.taggedItems'), value: String(countTagged(libraryEntries)), tone: 'info' },
          { label: t('sectionBrowser.metrics.warnings'), value: String(catalog?.warningLines ?? 0), tone: 'accent' },
        ],
        records: toRecords(libraryEntries, t),
        activity: toActivity(libraryEntries, t),
      })
    }
    case 'characters': {
      const characterEntries = toCharacterCatalogEntries(sortedCharacters)
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(sortedCharacters.length), tone: 'good' },
          { label: t('sectionBrowser.metrics.chatFiles'), value: String(sortedCharacters.filter((item) => (item.chat_size ?? 0) > 0).length), tone: 'info' },
          { label: t('sectionBrowser.metrics.recentUpdates'), value: String(sortedCharacters.filter((item) => isRecent(item.date_added)).length), tone: 'accent' },
        ],
        records: toRecords(characterEntries, t),
        activity: toActivity(characterEntries, t),
      })
    }
    case 'story':
      return withSharedChrome(section, t, {
        metrics: [],
        records: [],
        activity: [],
      })
    case 'projects':
      return withSharedChrome(section, t, {
        metrics: [],
        records: [],
        activity: [],
      })
    case 'lorebooks':
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(catalog?.counts.worlds ?? 0), tone: 'good' },
          { label: t('sectionBrowser.metrics.entries'), value: String(sumItemCount(catalog?.entries.worlds ?? [])), tone: 'info' },
          { label: t('sectionBrowser.metrics.activeWorlds'), value: String(settings?.world_names?.length ?? 0), tone: 'accent' },
        ],
        records: toRecords(catalog?.entries.worlds ?? [], t),
        activity: toActivity(catalog?.entries.worlds ?? [], t),
      })
    case 'presets': {
      const presetEntries = mergeCatalogEntries(catalog, ['openaiPresets', 'novelPresets', 'textgenPresets', 'koboldPresets', 'quickReplies', 'themes'])
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(presetEntries.length), tone: 'good' },
          { label: t('sectionBrowser.metrics.quickReplies'), value: String(catalog?.counts.quickReplies ?? 0), tone: 'info' },
          { label: t('sectionBrowser.metrics.themes'), value: String(catalog?.counts.themes ?? 0), tone: 'accent' },
        ],
        records: toRecords(presetEntries, t),
        activity: toActivity(presetEntries, t),
      })
    }
    case 'assets': {
      const assetEntries = mergeCatalogEntries(catalog, ['assets', 'backgrounds'])
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String((catalog?.counts.assets ?? 0) + (catalog?.counts.backgrounds ?? 0)), tone: 'good' },
          { label: t('sectionBrowser.metrics.folders'), value: String(catalog?.counts.backgrounds ?? 0), tone: 'info' },
          { label: t('sectionBrowser.metrics.recentUpdates'), value: String(countRecentEntries(assetEntries)), tone: 'accent' },
        ],
        records: toRecords(assetEntries, t),
        activity: toActivity(assetEntries, t),
      })
    }
    case 'groups': {
      const groupEntries = mergeCatalogEntries(catalog, ['groups', 'groupChats'])
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(catalog?.counts.groups ?? 0), tone: 'good' },
          { label: t('sectionBrowser.metrics.chatFiles'), value: String(catalog?.counts.groupChats ?? 0), tone: 'info' },
          { label: t('sectionBrowser.metrics.recentUpdates'), value: String(countRecentEntries(groupEntries)), tone: 'accent' },
        ],
        records: toRecords(groupEntries, t),
        activity: toActivity(groupEntries, t),
      })
    }
    case 'extensions':
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(catalog?.counts.extensions ?? 0), tone: 'good' },
          { label: t('sectionBrowser.metrics.disabledItems'), value: String(catalog?.disabledExtensions.length ?? 0), tone: 'info' },
          { label: t('sectionBrowser.metrics.warnings'), value: String(catalog?.warningLines ?? 0), tone: 'accent' },
        ],
        records: toRecords(catalog?.entries.extensions ?? [], t),
        activity: toActivity(catalog?.entries.extensions ?? [], t),
      })
    case 'backups':
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.totalItems'), value: String(catalog?.counts.backups ?? 0), tone: 'good' },
          { label: t('sectionBrowser.metrics.archives'), value: String((catalog?.entries.backups ?? []).filter((item) => item.kind === 'archive').length), tone: 'info' },
          { label: t('sectionBrowser.metrics.recentUpdates'), value: String(countRecentEntries(catalog?.entries.backups ?? [])), tone: 'accent' },
        ],
        records: toRecords(catalog?.entries.backups ?? [], t),
        activity: toActivity(catalog?.entries.backups ?? [], t),
      })
    case 'logs':
      return withSharedChrome(section, t, {
        metrics: [
          { label: t('sectionBrowser.metrics.lines'), value: String(sumItemCount(catalog?.entries.logs ?? [])), tone: 'good' },
          { label: t('sectionBrowser.metrics.totalItems'), value: String(catalog?.counts.logs ?? 0), tone: 'info' },
          { label: t('sectionBrowser.metrics.warnings'), value: String(catalog?.warningLines ?? 0), tone: 'accent' },
        ],
        records: toRecords(catalog?.entries.logs ?? [], t),
        activity: toActivity(catalog?.entries.logs ?? [], t),
      })
    case 'providers':
      return withSharedChrome(section, t, {
        metrics: [],
        records: [],
        activity: [],
      })
    default:
      return withSharedChrome(section, t, {
        metrics: [],
        records: [],
        activity: [],
      })
  }
}

function withSharedChrome(
  section: BrowserSection,
  t: Translator,
  data: Pick<SectionBrowserProps, 'activity' | 'metrics' | 'records'>,
): SectionBrowserProps {
  return {
    ...data,
    description: t(`${sectionKey(section)}.description`),
    eyebrow: t(`${sectionKey(section)}.eyebrow`),
    icon: sectionIcon(section),
    title: titleKey(section, t),
    emptyTitle: t(EMPTY_TITLE[section]),
    emptyDescription: t(EMPTY_DESCRIPTION[section]),
  }
}

function titleKey(section: BrowserSection, t: Translator): string {
  switch (section) {
    case 'groups':
      return t('nav.groupsLabel')
    case 'recently-used':
      return t('nav.recentlyUsed')
    default:
      return t(`nav.${section}`)
  }
}

function sectionKey(section: BrowserSection): string {
  switch (section) {
    case 'templates':
      return 'templatesPage'
    case 'recently-used':
      return 'recentlyUsedPage'
    case 'library':
      return 'libraryPage'
    case 'characters':
      return 'charactersPage'
    case 'story':
      return 'storyPage'
    case 'projects':
      return 'projectsPage'
    case 'lorebooks':
      return 'lorebooksPage'
    case 'presets':
      return 'presetsPage'
    case 'assets':
      return 'assetsPage'
    case 'groups':
      return 'groupsPage'
    case 'extensions':
      return 'extensionsPage'
    case 'backups':
      return 'backups'
    case 'logs':
      return 'logs'
    case 'providers':
      return 'providersPage'
    default:
      return 'sessions'
  }
}

function sectionIcon(section: BrowserSection) {
  const icons = {
    sessions: ScrollTextIcon,
    templates: ScrollTextIcon,
    'recently-used': ScrollTextIcon,
    library: SquareLibraryIcon,
    characters: UserRoundIcon,
    story: ScrollTextIcon,
    projects: LayoutGridIcon,
    lorebooks: BookOpenIcon,
    presets: SlidersHorizontalIcon,
    assets: ImageIcon,
    groups: UsersIcon,
    extensions: PuzzleIcon,
    backups: DatabaseIcon,
    logs: LayoutGridIcon,
    providers: ServerIcon,
  } satisfies Record<BrowserSection, typeof ScrollTextIcon>

  return icons[section]
}

function toRecords(entries: WorkspaceCatalogEntry[], t: Translator): SectionRecord[] {
  return entries.slice(0, 8).map((entry) => toSectionRecord(entry, t))
}

function toActivity(entries: WorkspaceCatalogEntry[], t: Translator): SectionActivityItem[] {
  return entries.slice(0, 4).map((entry) => toSectionActivityItem(entry, t))
}

function mergeCatalogEntries(
  catalog: WorkspaceCatalogPayload | null,
  keys: string[],
): WorkspaceCatalogEntry[] {
  return sortCatalogEntries(keys.flatMap((key) => catalog?.entries[key] ?? [])).slice(0, 16)
}

function sumItemCount(entries: WorkspaceCatalogEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.itemCount ?? 0), 0)
}

function isRecent(value: number | string | undefined): boolean {
  const stamp = typeof value === 'number' ? value : toTimestamp(value)
  if (!stamp) return false
  return Date.now() - stamp <= 7 * 24 * 60 * 60 * 1000
}

function countTagged(entries: WorkspaceCatalogEntry[]): number {
  return entries.filter((entry) => (entry.tags?.length ?? 0) > 0).length
}

function countRecentEntries(entries: WorkspaceCatalogEntry[]): number {
  return entries.filter((entry) => isRecent(entry.updatedAt)).length
}
