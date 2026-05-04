import { useCallback, useMemo, useState } from 'react'
import {
  DownloadIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  SearchIcon,
} from 'lucide-react'
import type { WorkspaceCatalogEntry } from '@yggdrasil/api-client'

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
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { WorkspaceDataTable, type WorkspaceDataTableColumn } from '@/components/workspace/WorkspaceDataTable'
import { useI18n } from '@/lib/i18n'
import { useStoredState } from '@/hooks/useStoredState'

export interface SessionManagerPanelProps {
  sessions: WorkspaceCatalogEntry[]
  onDeleteSession?: (avatar: string, fileId: string) => void
  onDuplicateSession?: (avatar: string, fileId: string, nextName: string) => void
  onExportSession?: (avatar: string, fileId: string) => void
  onRenameSession?: (avatar: string, fileId: string, nextName: string) => void
  onRestoreSession?: (avatar: string, fileId: string) => void
}

export function SessionManagerPanel({
  sessions,
  onDeleteSession,
  onDuplicateSession,
  onExportSession,
  onRenameSession,
  onRestoreSession,
}: SessionManagerPanelProps) {
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useStoredState('st.panel.sessions.searchQuery', '')
  const [pendingDelete, setPendingDelete] = useState<WorkspaceCatalogEntry | null>(null)
  const [nameDialog, setNameDialog] = useState<{
    mode: 'duplicate' | 'rename'
    record: WorkspaceCatalogEntry
  } | null>(null)
  const [nextName, setNextName] = useState('')
  const [currentPage, setCurrentPage] = useStoredState('st.panel.sessions.currentPage', 1)
  const pageSize = 10

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter((entry) =>
      [
        entry.name,
        entry.note ?? '',
        ...(entry.tags ?? []),
      ].join(' ').toLowerCase().includes(query),
    )
  }, [searchQuery, sessions])

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize))
  const clampedPage = Math.min(currentPage, totalPages)
  const pagedSessions = useMemo(() => {
    const startIndex = (clampedPage - 1) * pageSize
    return filteredSessions.slice(startIndex, startIndex + pageSize)
  }, [clampedPage, filteredSessions])

  const openNameDialog = useCallback((mode: 'duplicate' | 'rename', record: WorkspaceCatalogEntry) => {
    setNameDialog({ mode, record })
    setNextName(mode === 'rename' ? record.name : t('sectionBrowser.dialogs.copySuffix', { name: record.name }))
  }, [t])

  const tableColumns = useMemo<WorkspaceDataTableColumn<WorkspaceCatalogEntry>[]>(() => [
    {
      key: 'name',
      header: t('sectionBrowser.columns.name'),
      cellClassName: 'is-name',
      cell: (record) => (
        <div className="ref-section-record-main">
          <strong>{record.name}</strong>
          {record.note?.trim() ? <p className="ref-section-record-detail">{record.note.trim()}</p> : null}
          <div className="ref-section-record-tags">
            {(record.tags ?? []).map((tag) => (
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
      cell: () => <span title={t('nav.sessions')}>{t('nav.sessions')}</span>,
    },
    {
      key: 'status',
      header: t('sectionBrowser.columns.status'),
      width: '13rem',
      cellClassName: 'is-meta',
      cell: (record) => {
        const status =
          typeof record.itemCount === 'number'
            ? t('sectionBrowser.sessionItems', { count: record.itemCount })
            : t('common.ready')
        return <span title={status}>{status}</span>
      },
    },
    {
      key: 'updated',
      header: t('sectionBrowser.columns.updated'),
      width: '14rem',
      cellClassName: 'is-meta is-updated',
      cell: (record) => {
        const updated = typeof record.updatedAt === 'number'
          ? new Date(record.updatedAt).toLocaleString()
          : t('common.unavailable')
        return <span title={updated}>{updated}</span>
      },
    },
    {
      key: 'actions',
      header: t('sectionBrowser.columns.actions'),
      width: '10.5rem',
      align: 'right',
      cellClassName: 'is-actions',
      cell: (record) => (
        <div className="ref-section-table-actions">
          <Button
            className="ref-section-open-action"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              if (record.sourceAvatar && record.sourceFileName) {
                onRestoreSession?.(record.sourceAvatar, record.sourceFileName)
              }
            }}
          >
            {t('sectionBrowser.actions.restore')}
          </Button>
          <Button
            className="ref-section-more-action"
            size="icon-sm"
            type="button"
            variant="ghost"
            title={t('common.export')}
            onClick={() => {
              if (record.sourceAvatar && record.sourceFileName) {
                void onExportSession?.(record.sourceAvatar, record.sourceFileName)
              }
            }}
          >
            <DownloadIcon className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="ref-section-more-action" size="icon-sm" type="button" variant="ghost">
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => openNameDialog('rename', record)}>
                {t('sectionBrowser.actions.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNameDialog('duplicate', record)}>
                {t('sectionBrowser.actions.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-300 focus:text-red-200"
                onClick={() => setPendingDelete(record)}
              >
                {t('sectionBrowser.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [onExportSession, onRestoreSession, openNameDialog, t])

  return (
    <>
      <div className="ref-section-browser">
        <section className="ref-section-hero">
          <div className="ref-section-hero-copy">
            <span className="ref-section-eyebrow">{t('sessions.eyebrow')}</span>
            <div className="ref-section-title-row">
              <div className="ref-section-title-mark">
                <HistoryIcon className="size-4.5" />
              </div>
              <div className="min-w-0">
                <h2>{t('nav.sessions')}</h2>
                <p>{t('sessions.description')}</p>
              </div>
            </div>
          </div>
          <div className="ref-section-hero-actions">
            <div className="ref-section-activity-pulse">
              <HistoryIcon className="size-4" />
              <span>{t('sectionBrowser.indexedItems', { count: sessions.length })}</span>
            </div>
          </div>
        </section>

        <section className="ref-section-content is-single">
          <div className="ref-section-main">
            <div className="ref-section-toolbar">
              <div className="ref-section-search">
                <SearchIcon className="size-4" />
                <Input
                  className="ref-section-search-input"
                  placeholder={t('sectionBrowser.searchPlaceholder', { title: t('nav.sessions') })}
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
                <div className="ref-section-empty is-centered">
                  <strong>{t('sectionBrowser.empty.sessions.title')}</strong>
                  <p>{t('sectionBrowser.empty.sessions.description')}</p>
                </div>
              }
              getRowKey={(record) => `${record.name}-${record.updatedAt ?? 0}`}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              rows={pagedSessions}
              totalCount={filteredSessions.length}
            />
          </div>
        </section>
      </div>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sectionBrowser.actions.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? t('sessions.deleteConfirm', { name: pendingDelete.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete?.sourceAvatar && pendingDelete.sourceFileName) {
                  onDeleteSession?.(pendingDelete.sourceAvatar, pendingDelete.sourceFileName)
                }
                setPendingDelete(null)
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(nameDialog)} onOpenChange={(open) => !open && setNameDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {nameDialog?.mode === 'rename'
                ? t('sectionBrowser.dialogs.renameTitle')
                : t('sectionBrowser.dialogs.duplicateTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {nameDialog
                ? nameDialog.mode === 'rename'
                  ? t('sectionBrowser.dialogs.renameDescription', { name: nameDialog.record.name })
                  : t('sectionBrowser.dialogs.duplicateDescription', { name: nameDialog.record.name })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input autoFocus value={nextName} onChange={(event) => setNextName(event.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!nameDialog?.record.sourceAvatar || !nameDialog.record.sourceFileName) {
                  return
                }
                if (nameDialog.mode === 'rename') {
                  onRenameSession?.(nameDialog.record.sourceAvatar, nameDialog.record.sourceFileName, nextName)
                } else {
                  onDuplicateSession?.(nameDialog.record.sourceAvatar, nameDialog.record.sourceFileName, nextName)
                }
                setNameDialog(null)
              }}
            >
              {nameDialog?.mode === 'rename'
                ? t('sectionBrowser.actions.rename')
                : t('sectionBrowser.actions.duplicate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
