import { useCallback, useRef } from 'react'
import {
  BookMarkedIcon,
  BookIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FolderKanbanIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CharacterSummary, WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkspaceAvatar } from '@/components/workspace/WorkspaceAvatar'
import { useI18n } from '@/lib/i18n'
import type { WorkbenchSection } from '@/lib/workbench-layout'
import { useLibraryFilter, type TypeFilter } from './hooks'

export interface LibraryPanelProps {
  characters: CharacterSummary[]
  catalog: WorkspaceCatalogPayload | null
  selectedCharacterAvatar: string
  loading: boolean
  libraryCollapsed: boolean
  variant?: 'panel' | 'dialog'
  onOpenSection?: (section: WorkbenchSection, params?: Record<string, string>) => void
  onSelectCharacter: (avatar: string) => void
  onCreateChat: () => void
  onToggleLibrary: () => void
}

export function LibraryPanel({
  characters,
  catalog,
  selectedCharacterAvatar,
  loading,
  libraryCollapsed,
  variant = 'panel',
  onOpenSection,
  onSelectCharacter,
  onCreateChat,
  onToggleLibrary,
}: LibraryPanelProps) {
  const { t } = useI18n()
  const {
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    currentPage,
    setCurrentPage,
    pageSize,
    items,
    totalItems,
    totalPages,
    stats,
  } = useLibraryFilter(characters, catalog, selectedCharacterAvatar, onSelectCharacter, onOpenSection)

  // Virtual scroller setup
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  })

  const virtualItems = virtualizer.getVirtualItems()

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1))
  }, [setCurrentPage])

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
  }, [setCurrentPage, totalPages])

  const pageItems = buildPaginationItems(currentPage, totalPages)

  const handleTypeFilterChange = useCallback(
    (value: string) => {
      setTypeFilter(value as TypeFilter)
      setCurrentPage(1)
    },
    [setTypeFilter, setCurrentPage],
  )
  const isDialog = variant === 'dialog'
  const isCollapsed = isDialog ? false : libraryCollapsed

  return (
    <div className={`ref-library-layout ${isCollapsed ? 'is-collapsed' : ''} ${isDialog ? 'is-dialog' : ''}`}>
      {!isDialog ? (
        <div className="ref-library-side">
          <div className="ref-library-title">
            <div className="ref-library-title-main">
              <BookMarkedIcon className="size-4" />
              <span>{t('nav.library')}</span>
            </div>
            <div className="ref-library-title-meta">
              {!isCollapsed ? (
                <div className="ref-library-stats">
                  <LibraryStat kind="character" label={t('nav.characters')} value={String(stats.characters)} />
                  <LibraryStat kind="lorebook" label={t('nav.lorebooks')} value={String(stats.lorebooks)} />
                  <LibraryStat kind="preset" label={t('nav.presets')} value={String(stats.presets)} />
                  <LibraryStat kind="group" label={t('nav.groupsLabel')} value={String(stats.groups)} />
                </div>
              ) : null}
              <Button
                className="ref-library-toggle"
                onClick={onToggleLibrary}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {isCollapsed ? (
                  <ChevronUpIcon className="size-4" />
                ) : (
                  <ChevronDownIcon className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!isCollapsed ? (
        <div className="ref-library-table-wrap">
          {isDialog ? (
            <div className="ref-library-dialog-summary" aria-label={t('library.summaryLabel')}>
              <div className="ref-library-stats">
                <LibraryStat kind="character" label={t('nav.characters')} value={String(stats.characters)} />
                <LibraryStat kind="lorebook" label={t('nav.lorebooks')} value={String(stats.lorebooks)} />
                <LibraryStat kind="preset" label={t('nav.presets')} value={String(stats.presets)} />
                <LibraryStat kind="group" label={t('nav.groupsLabel')} value={String(stats.groups)} />
              </div>
            </div>
          ) : null}
          <div className="ref-library-toolbar">
            <div className="ref-library-search">
              <SearchIcon className="size-4" />
              <Input
                placeholder={t('library.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ref-library-search-input border-0 bg-transparent px-0 placeholder:text-muted-foreground focus-visible:ring-0"
              />
            </div>

            <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
              <SelectTrigger className="ref-library-filter w-fit" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('library.allTypes')}</SelectItem>
                <SelectItem value="character">{t('nav.characters')}</SelectItem>
                <SelectItem value="lorebook">{t('nav.lorebooks')}</SelectItem>
                <SelectItem value="preset">{t('nav.presets')}</SelectItem>
                <SelectItem value="group">{t('nav.groupsLabel')}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              className="ref-library-new"
              onClick={onCreateChat}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t('library.createChat')}
            </Button>
          </div>

          <div className="ref-library-table-scroll">
            <div className="ref-library-table">
              <div className="ref-library-head">
                <span className="ref-library-col-name">{t('sectionBrowser.columns.name')}</span>
                <span className="ref-library-col-type">{t('library.type')}</span>
                <span className="ref-library-col-tags">{t('library.tags')}</span>
                <span className="ref-library-head-sort">
                  <span>{t('sectionBrowser.columns.updated')}</span>
                  <ChevronDownIcon className="size-3.5" />
                </span>
              </div>

              {loading ? (
                <div className="grid gap-2 p-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton className="h-11 rounded-none" key={index} />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="ref-library-body">
                  <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(201, 185, 153, 0.84)' }}>
                    {t('library.empty')}
                  </div>
                </div>
              ) : (
                <div className="ref-library-body" ref={parentRef}>
                  <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    {virtualItems.map((virtualItem) => {
                      const item = items[virtualItem.index]
                      if (!item) return null

                      return (
                        <div
                          key={item.id}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <div
                            className={`ref-library-row ${item.selected ? 'is-selected' : ''}`}
                            onClick={item.onSelect}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                item.onSelect?.()
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <span className="ref-library-name-cell">
                              <RowThumb avatar={item.avatar} kind={item.kind} label={item.name} />
                              <span className="ref-library-name-copy">
                                <span>{item.name}</span>
                                {item.featured ? <em className="ref-library-featured">☆</em> : null}
                              </span>
                            </span>
                            <span className="ref-library-type-cell">
                              <em className={`ref-pill ref-type-${item.kind.toLowerCase()}`}>{item.kind}</em>
                            </span>
                            <span className="ref-tag-list">
                              {item.tags.map((tag) => (
                                <em key={tag}>{tag}</em>
                              ))}
                            </span>
                            <span className="ref-library-updated-cell">{item.updated}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="ref-library-foot">
                <span>
                  {items.length === 0
                    ? '0'
                    : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalItems)}`}{' '}
                  {t('library.pagination', { totalItems })}
                </span>
                <span className="ref-library-pagination">
                  <Button
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronLeftIcon className="size-3.5" />
                  </Button>
                  {pageItems.map((item, index) =>
                    item === 'ellipsis' ? (
                      <span className="ref-library-pagination-ellipsis" key={`ellipsis-${index}`}>...</span>
                    ) : (
                      <button
                        className={`ref-library-page-chip ${item === currentPage ? 'is-active' : ''}`}
                        key={item}
                        onClick={() => setCurrentPage(item)}
                        type="button"
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <Button
                    onClick={handleNextPage}
                    disabled={totalPages <= 1 || currentPage === totalPages}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronRightIcon className="size-3.5" />
                  </Button>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 1) return [1]
  if (totalPages <= 6) return Array.from({ length: totalPages }, (_, index) => index + 1)
  if (currentPage <= 3) return [1, 2, 3, 'ellipsis', totalPages]
  if (currentPage >= totalPages - 2) return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages]
  return [1, 'ellipsis', currentPage, currentPage + 1, 'ellipsis', totalPages]
}

function LibraryStat({ kind, label, value }: { kind: 'character' | 'lorebook' | 'preset' | 'group'; label: string; value: string }) {
  const Icon =
    kind === 'character'
      ? UsersIcon
      : kind === 'lorebook'
        ? BookIcon
        : kind === 'preset'
          ? SlidersHorizontalIcon
          : FolderKanbanIcon

  return (
    <div className="ref-library-stat">
      <div className="ref-library-stat-icon">
        <Icon className="size-3.5" />
      </div>
      <div className="ref-library-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function RowThumb({
  avatar,
  kind,
  label,
}: {
  avatar: string | null
  kind: string
  label: string
}) {
  if (kind === 'Character') {
    return (
      <WorkspaceAvatar
        avatar={avatar}
        className="ref-library-avatar"
        fallbackClassName="ref-library-avatar-fallback"
        name={label}
        size="sm"
      />
    )
  }

  const Icon =
    kind === 'Lorebook'
      ? BookIcon
      : kind === 'Preset'
        ? SlidersHorizontalIcon
        : FolderKanbanIcon

  return (
    <span className="ref-library-glyph">
      <Icon className="size-3.5" />
    </span>
  )
}
