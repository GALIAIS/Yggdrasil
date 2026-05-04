import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import type { LibraryDocument } from '@yggdrasil/api-client'
import {
  ArchiveRestoreIcon,
  DownloadIcon,
  FolderArchiveIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDateTime } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'

export interface BackupsPanelProps {
  csrfToken: string
  initialSelectedName?: string
}

export function BackupsPanel({ csrfToken, initialSelectedName }: BackupsPanelProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<LibraryDocument | null>(null)
  const [pendingRestore, setPendingRestore] = useState<LibraryDocument | null>(null)

  const [backupsQuery] = useQueries({
    queries: [{
      queryKey: ['workspace', 'library-documents', 'backups'],
      queryFn: async ({ signal }: { signal?: AbortSignal }) => {
        const { fetchLibraryDocuments } = await import('@yggdrasil/api-client')
        return fetchLibraryDocuments('backups', signal)
      },
      staleTime: 30_000,
    }],
  })

  const backups = useMemo(() => backupsQuery.data ?? [], [backupsQuery.data])
  const filteredBackups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return backups
    return backups.filter((backup) =>
      [backup.name, backup.kind, ...(backup.tags ?? [])].join(' ').toLowerCase().includes(query),
    )
  }, [backups, searchQuery])

  useEffect(() => {
    if (filteredBackups.length === 0) {
      if (selectedName) {
        setSelectedName('')
      }
      return
    }

    if (!filteredBackups.some((backup) => backup.name === selectedName)) {
      setSelectedName(filteredBackups[0]?.name ?? '')
    }
  }, [filteredBackups, selectedName])

  useEffect(() => {
    if (initialSelectedName && backups.some((backup) => backup.name === initialSelectedName)) {
      setSelectedName(initialSelectedName)
    }
  }, [backups, initialSelectedName])

  const activeName = filteredBackups.some((backup) => backup.name === selectedName)
    ? selectedName
    : filteredBackups[0]?.name ?? ''
  const selectedBackup = filteredBackups.find((backup) => backup.name === activeName) ?? null

  const createMutation = useMutation({
    mutationFn: async () => {
      const { createBackup } = await import('@yggdrasil/api-client')
      return createBackup({ csrfToken })
    },
    onSuccess: async (backup) => {
      setSelectedName(backup.name)
      await refreshAll(queryClient)
      toast.success(t('backupsPanel.feedback.created'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('backupsPanel.feedback.createFailed'))
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async (name: string) => {
      const { restoreBackup } = await import('@yggdrasil/api-client')
      return restoreBackup({ csrfToken, name })
    },
    onSuccess: async () => {
      await refreshAll(queryClient)
      toast.success(t('backupsPanel.feedback.restored'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('backupsPanel.feedback.restoreFailed'))
    },
  })

  const exportMutation = useMutation({
    mutationFn: async (name: string) => {
      const { exportLibraryDocument } = await import('@yggdrasil/api-client')
      return exportLibraryDocument({ csrfToken, domain: 'backups', name })
    },
    onSuccess: (path) => {
      toast.success(t('backupsPanel.feedback.exported', { path }))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('backupsPanel.feedback.exportFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      const { deleteLibraryDocument } = await import('@yggdrasil/api-client')
      return deleteLibraryDocument({ csrfToken, domain: 'backups', name })
    },
    onSuccess: async (_, name) => {
      if (selectedName === name) {
        setSelectedName('')
      }
      await refreshAll(queryClient)
      toast.success(t('backupsPanel.feedback.deleted'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('backupsPanel.feedback.deleteFailed'))
    },
  })

  return (
    <>
      <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="min-h-0 rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
          <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                  <FolderArchiveIcon className="size-4" />
                  <span>{t('nav.backups')}</span>
                </CardTitle>
                <CardDescription className="text-xs text-stone-400/80">{t('backupsPanel.description')}</CardDescription>
              </div>
              <Button className="gap-2 rounded-sm" size="sm" type="button" onClick={() => void createMutation.mutateAsync()} disabled={createMutation.isPending}>
                <PlusIcon className="size-4" />
                <span>{t('backupsPanel.createAction')}</span>
              </Button>
            </div>
            <div className="ref-section-search">
              <SearchIcon className="size-4" />
              <Input
                className="ref-section-search-input"
                placeholder={t('sectionBrowser.searchPlaceholder', { title: t('nav.backups') })}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="min-h-0 p-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-2 p-3">
                {filteredBackups.map((backup) => (
                  <button
                    key={backup.name}
                    type="button"
                    onClick={() => setSelectedName(backup.name)}
                    className={`rounded-sm border px-3 py-3 text-left ${
                      backup.name === activeName
                        ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                        : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm text-stone-100">{backup.name}</strong>
                      <Badge className="rounded-sm" variant="outline">{backup.kind}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-stone-400/85">{formatBackupNote(backup.contentText, t)}</p>
                    <p className="mt-1 text-[11px] text-stone-500">{backup.updatedAt ? formatDateTime(backup.updatedAt) : t('common.unavailable')}</p>
                  </button>
                ))}
                {!backupsQuery.isPending && filteredBackups.length === 0 ? (
                  <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-6 text-sm text-stone-400/85">
                    {t('backupsPanel.empty')}
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="min-h-0 rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
          <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold text-stone-100">{selectedBackup?.name ?? t('nav.backups')}</CardTitle>
                <CardDescription className="text-xs text-stone-400/80">
                  {selectedBackup ? t('backupsPanel.selectedDescription') : t('backupsPanel.emptySelection')}
                </CardDescription>
              </div>
              {selectedBackup ? (
                <div className="flex items-center gap-2">
                  <Button size="icon-sm" type="button" variant="ghost" title={t('common.export')} onClick={() => void exportMutation.mutateAsync(selectedBackup.name)}>
                    <DownloadIcon className="size-4" />
                  </Button>
                  <Button size="icon-sm" type="button" variant="ghost" title={t('backupsPanel.restoreAction')} onClick={() => setPendingRestore(selectedBackup)}>
                    <ArchiveRestoreIcon className="size-4" />
                  </Button>
                  <Button size="icon-sm" type="button" variant="ghost" title={t('sectionBrowser.actions.delete')} onClick={() => setPendingDelete(selectedBackup)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 p-0">
            {selectedBackup ? (
              <ScrollArea className="h-full">
                <pre className="min-h-full whitespace-pre-wrap break-words px-4 py-4 font-mono text-xs leading-6 text-stone-200">
                  {formatBackupManifest(selectedBackup.contentText)}
                </pre>
              </ScrollArea>
            ) : (
              <div className="px-4 py-6 text-sm text-stone-400/85">
                {backupsQuery.isPending ? t('common.loading') : t('backupsPanel.emptySelection')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingRestore)} onOpenChange={(open) => !open && setPendingRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('backupsPanel.restoreAction')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRestore ? t('backupsPanel.restoreConfirm', { name: pendingRestore.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRestore) {
                  void restoreMutation.mutateAsync(pendingRestore.name)
                }
                setPendingRestore(null)
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sectionBrowser.actions.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? t('backupsPanel.deleteConfirm', { name: pendingDelete.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  void deleteMutation.mutateAsync(pendingDelete.name)
                }
                setPendingDelete(null)
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

async function refreshAll(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['workspace'] }),
    queryClient.invalidateQueries({ queryKey: ['workspace', 'catalog'] }),
    queryClient.invalidateQueries({ queryKey: ['workspace', 'library-documents', 'backups'] }),
  ])
}

function formatBackupManifest(contentText?: string | null): string {
  if (!contentText?.trim()) {
    return '{}'
  }

  try {
    const parsed = JSON.parse(contentText)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return contentText
  }
}

function formatBackupNote(
  contentText: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!contentText?.trim()) {
    return t('backupsPanel.noteSummary', { files: 0, avatars: 0 })
  }

  try {
    const parsed = JSON.parse(contentText) as { db_files?: unknown[]; character_files?: number }
    const dbCount = Array.isArray(parsed.db_files) ? parsed.db_files.length : 0
    const characterFiles = typeof parsed.character_files === 'number' ? parsed.character_files : 0
    return t('backupsPanel.noteSummary', { files: dbCount, avatars: characterFiles })
  } catch {
    return t('backupsPanel.noteFallback')
  }
}
