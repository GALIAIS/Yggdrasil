import { useMemo } from 'react'
import { ScrollTextIcon } from 'lucide-react'
import type { WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { useI18n } from '@/lib/i18n'
import type { WorkbenchSection } from '@/lib/workbench-layout'
import { SectionBrowser } from '@/features/workspace/SectionBrowser'
import {
  buildCatalogEntrySectionParams,
  resolveCatalogEntrySection,
  sortCatalogEntries,
  toSectionActivityItem,
  toSectionRecord,
} from '@/features/workspace/catalog-entry-helpers'

const TEMPLATE_ENTRY_KEYS = ['sysprompts', 'contexts', 'instructs', 'reasonings', 'quickReplies', 'themes'] as const

export interface TemplatesManagerPanelProps {
  catalog: WorkspaceCatalogPayload | null
  onOpenSectionWith?: (section: WorkbenchSection, params?: Record<string, string>) => void
  onSetSection?: (section: WorkbenchSection) => void
}

export function TemplatesManagerPanel({ catalog, onOpenSectionWith, onSetSection }: TemplatesManagerPanelProps) {
  const { t } = useI18n()
  const templateEntries = useMemo(
    () => sortCatalogEntries(TEMPLATE_ENTRY_KEYS.flatMap((key) => catalog?.entries[key] ?? [])),
    [catalog],
  )
  const openableCount = templateEntries.filter((entry) => resolveCatalogEntrySection(entry)).length
  const kinds = new Set(templateEntries.map((entry) => entry.kind))

  return (
    <SectionBrowser
      activity={templateEntries.slice(0, 4).map((entry) => toSectionActivityItem(entry, t))}
      description={t('templatesPage.description')}
      emptyDescription={t('sectionBrowser.empty.templates.description')}
      emptyTitle={t('sectionBrowser.empty.templates.title')}
      eyebrow={t('templatesPage.eyebrow')}
      icon={ScrollTextIcon}
      layout="single"
      metrics={[
        { label: t('templatesPage.metrics.publishedTemplates'), value: String(templateEntries.length), tone: 'good' },
        { label: t('templatesPage.metrics.draftVariants'), value: String(kinds.size), tone: 'info' },
        { label: t('templatesPage.metrics.sharedPacks'), value: String(openableCount), tone: 'accent' },
      ]}
      onOpenRecord={(record) => {
        const entry = templateEntries.find((item) => toSectionRecord(item, t).id === record.id)
        const targetSection = entry ? resolveCatalogEntrySection(entry) : null
        if (targetSection) {
          if (onOpenSectionWith) {
            onOpenSectionWith(targetSection, entry ? buildCatalogEntrySectionParams(entry) : { name: record.name })
            return
          }
          onSetSection?.(targetSection)
        }
      }}
      openActionLabel={t('sectionBrowser.actions.open')}
      records={templateEntries.map((entry) => toSectionRecord(entry, t))}
      title={t('nav.templates')}
    />
  )
}
