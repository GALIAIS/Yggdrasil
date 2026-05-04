import { useCallback, useMemo, useState, type ComponentType } from 'react'
import {
  Clock3Icon,
  MoreHorizontalIcon,
  type LucideIcon,
  SearchIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { WorkspaceDataTable, type WorkspaceDataTableColumn } from '@/components/workspace/WorkspaceDataTable'
import { useI18n } from '@/lib/i18n'

export interface SectionMetric {
  label: string
  value: string
  tone?: 'default' | 'good' | 'info' | 'accent'
}

export interface SectionRecord {
  id?: string
  name: string
  category: string
  detail?: string
  status: string
  sourceAvatar?: string
  sourceFileName?: string
  updated: string
  tags: string[]
}

export interface SectionActivityItem {
  label: string
  detail: string
  time: string
}

export interface SectionBrowserProps {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  metrics: SectionMetric[]
  records: SectionRecord[]
  activity: SectionActivityItem[]
  emptyTitle?: string
  emptyDescription?: string
  openActionLabel?: string
  layout?: 'default' | 'single'
  pageSize?: number
  onDeleteRecord?: (record: SectionRecord) => void
  onDuplicateRecord?: (record: SectionRecord, nextName: string) => void
  onOpenRecord?: (record: SectionRecord) => void
  onRenameRecord?: (record: SectionRecord, nextName: string) => void
}

export function SectionBrowser({
  eyebrow,
  title,
  description,
  icon: Icon,
  metrics,
  records,
  activity,
  emptyTitle,
  emptyDescription,
  openActionLabel,
  layout = 'default',
  pageSize = 10,
  onDeleteRecord,
  onDuplicateRecord,
  onOpenRecord,
  onRenameRecord,
}: SectionBrowserProps) {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<SectionRecord | null>(null)
  const [nameDialog, setNameDialog] = useState<{
    initialValue: string
    mode: 'duplicate' | 'rename'
    record: SectionRecord
  } | null>(null)
  const [nameValue, setNameValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return records
    return records.filter((record) =>
      [record.name, record.category, record.status, ...record.tags].join(' ').toLowerCase().includes(query),
    )
  }, [records, searchQuery])

  const filteredActivity = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return activity
    return activity.filter((item) =>
      [item.label, item.detail, item.time].join(' ').toLowerCase().includes(query),
    )
  }, [activity, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const clampedPage = Math.min(currentPage, totalPages)
  const pagedRecords = useMemo(() => {
    const startIndex = (clampedPage - 1) * pageSize
    return filteredRecords.slice(startIndex, startIndex + pageSize)
  }, [clampedPage, filteredRecords, pageSize])

  const indexedCount = records.length
  const visibleCount = filteredRecords.length
  const activityCount = filteredActivity.length
  const hasRecordActions = Boolean(onOpenRecord || onRenameRecord || onDuplicateRecord || onDeleteRecord)

  const openNameDialog = useCallback((mode: 'duplicate' | 'rename', record: SectionRecord) => {
    const initialValue = mode === 'rename' ? record.name : t('sectionBrowser.dialogs.copySuffix', { name: record.name })
    setNameDialog({ initialValue, mode, record })
    setNameValue(initialValue)
  }, [t])

  const tableColumns = useMemo<WorkspaceDataTableColumn<SectionRecord>[]>(() => {
    const columns: WorkspaceDataTableColumn<SectionRecord>[] = [
      {
        key: 'name',
        header: t('sectionBrowser.columns.name'),
        cellClassName: 'is-name',
        cell: (record) => (
          <div className="ref-section-record-main">
            <strong>{record.name}</strong>
            {record.detail ? <p className="ref-section-record-detail">{record.detail}</p> : null}
            <div className="ref-section-record-tags">
              {record.tags.map((tag) => (
                <em key={tag}>{tag}</em>
              ))}
            </div>
          </div>
        ),
      },
      {
        key: 'category',
        header: t('sectionBrowser.columns.category'),
        width: '11rem',
        cellClassName: 'is-meta',
        cell: (record) => <span title={record.category}>{record.category}</span>,
      },
      {
        key: 'status',
        header: t('sectionBrowser.columns.status'),
        width: '13rem',
        cellClassName: 'is-meta',
        cell: (record) => <span title={record.status}>{record.status}</span>,
      },
      {
        key: 'updated',
        header: t('sectionBrowser.columns.updated'),
        width: '14rem',
        cellClassName: 'is-meta is-updated',
        cell: (record) => <span title={record.updated}>{record.updated}</span>,
      },
    ]

    if (hasRecordActions) {
      columns.push({
        key: 'actions',
        header: t('sectionBrowser.columns.actions'),
        width: '10.5rem',
        align: 'right',
        cellClassName: 'is-actions',
        cell: (record) => (
          <div className="ref-section-table-actions">
            {onOpenRecord ? (
              <Button
                className="ref-section-open-action"
                onClick={() => onOpenRecord(record)}
                size="sm"
                type="button"
                variant="outline"
              >
                {openActionLabel ?? t('sectionBrowser.actions.restore')}
              </Button>
            ) : null}
            {onRenameRecord || onDuplicateRecord || onDeleteRecord ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="ref-section-more-action" size="icon-sm" type="button" variant="ghost">
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {onRenameRecord ? (
                    <DropdownMenuItem onClick={() => openNameDialog('rename', record)}>
                      {t('sectionBrowser.actions.rename')}
                    </DropdownMenuItem>
                  ) : null}
                  {onDuplicateRecord ? (
                    <DropdownMenuItem onClick={() => openNameDialog('duplicate', record)}>
                      {t('sectionBrowser.actions.duplicate')}
                    </DropdownMenuItem>
                  ) : null}
                  {onDeleteRecord ? (
                    <DropdownMenuItem
                      className="text-red-300 focus:text-red-200"
                      onClick={() => setPendingDeleteRecord(record)}
                    >
                      {t('sectionBrowser.actions.delete')}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ),
      })
    }

    return columns
  }, [
    hasRecordActions,
    onDeleteRecord,
    onDuplicateRecord,
    onOpenRecord,
    onRenameRecord,
    openNameDialog,
    openActionLabel,
    t,
  ])

  return (
    <>
      <div className="ref-section-browser">
        <section className="ref-section-hero">
          <div className="ref-section-hero-copy">
            <span className="ref-section-eyebrow">{eyebrow}</span>
            <div className="ref-section-title-row">
              <div className="ref-section-title-mark">
                <Icon className="size-4.5" />
              </div>
              <div className="min-w-0">
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            </div>
          </div>
          <div className="ref-section-hero-actions">
            <div className="ref-section-activity-pulse">
              <Clock3Icon className="size-4" />
              <span>{t('sectionBrowser.indexedItems', { count: indexedCount })}</span>
            </div>
          </div>
        </section>

        <section className="ref-section-metrics">
          {metrics.map((metric) => (
            <div className={`ref-section-metric is-${metric.tone ?? 'default'}`} key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </section>

        <section className={`ref-section-content ${layout === 'single' ? 'is-single' : ''}`}>
          <div className="ref-section-main">
            <div className="ref-section-toolbar">
              <div className="ref-section-search">
                <SearchIcon className="size-4" />
                <Input
                  className="ref-section-search-input"
                  placeholder={t('sectionBrowser.searchPlaceholder', { title })}
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setCurrentPage(1)
                  }}
                />
              </div>
            </div>

            <WorkspaceDataTable
              columns={tableColumns}
              currentPage={clampedPage}
              emptyState={
                <div className={`ref-section-empty ${layout === 'single' ? 'is-centered' : ''}`}>
                  <strong>{emptyTitle ?? t('library.empty')}</strong>
                  <p>{emptyDescription ?? t('sectionBrowser.queueDescription')}</p>
                </div>
              }
              getRowKey={(record) => record.id ?? `${record.name}-${record.updated}`}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              rows={pagedRecords}
              totalCount={filteredRecords.length}
            />
          </div>

          {layout === 'single' ? null : (
            <aside className="ref-section-side">
            <div className="ref-section-side-block">
              <div className="ref-section-side-head">
                <span>{t('sectionBrowser.overview')}</span>
                <strong>{t('sectionBrowser.visibleItems', { count: visibleCount })}</strong>
              </div>
              <p>
                {searchQuery.trim()
                  ? t('sectionBrowser.filteredDescription', { count: visibleCount, total: indexedCount })
                  : t('sectionBrowser.indexDescription', { count: indexedCount })}
              </p>
            </div>

            <div className="ref-section-side-block">
              <div className="ref-section-side-head">
                <span>{t('sectionBrowser.recentActivity')}</span>
                <strong>{t('sectionBrowser.activityItems', { count: activityCount })}</strong>
              </div>
              <div className="ref-section-activity-list">
                {filteredActivity.map((item) => (
                  <div className="ref-section-activity-row" key={`${item.label}-${item.time}`}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <em>{item.time}</em>
                  </div>
                ))}
                {filteredActivity.length === 0 ? (
                  <div className="ref-section-empty">
                    <strong>{emptyTitle ?? t('library.empty')}</strong>
                    <p>{emptyDescription ?? t('sectionBrowser.queueDescription')}</p>
                  </div>
                ) : null}
              </div>
            </div>
            </aside>
          )}
        </section>
      </div>

      <Dialog
        open={Boolean(nameDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setNameDialog(null)
            setNameValue('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === 'rename'
                ? t('sectionBrowser.dialogs.renameTitle')
                : t('sectionBrowser.dialogs.duplicateTitle')}
            </DialogTitle>
            <DialogDescription>
              {nameDialog
                ? nameDialog.mode === 'rename'
                  ? t('sectionBrowser.dialogs.renameDescription', { name: nameDialog.record.name })
                  : t('sectionBrowser.dialogs.duplicateDescription', { name: nameDialog.record.name })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            placeholder={t('sectionBrowser.dialogs.namePlaceholder')}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNameDialog(null)
                setNameValue('')
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!nameDialog) return
                if (nameDialog.mode === 'rename') {
                  onRenameRecord?.(nameDialog.record, nameValue)
                } else {
                  onDuplicateRecord?.(nameDialog.record, nameValue)
                }
                setNameDialog(null)
                setNameValue('')
              }}
            >
              {nameDialog?.mode === 'rename'
                ? t('sectionBrowser.actions.rename')
                : t('sectionBrowser.actions.duplicate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteRecord)} onOpenChange={(open) => !open && setPendingDeleteRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sectionBrowser.actions.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteRecord
                ? t('sectionBrowser.dialogs.deleteDescription', { name: pendingDeleteRecord.name })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteRecord) {
                  onDeleteRecord?.(pendingDeleteRecord)
                }
                setPendingDeleteRecord(null)
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export interface SectionBrowserConfig {
  eyebrow: string
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  metrics: SectionMetric[]
  records: SectionRecord[]
  activity: SectionActivityItem[]
}
