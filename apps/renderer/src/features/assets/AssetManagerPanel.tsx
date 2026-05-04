import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import type { LibraryDocument } from '@yggdrasil/api-client'
import {
  DownloadIcon,
  ImageIcon,
  Music4Icon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  WallpaperIcon,
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
import { importAssetFile } from '@/lib/asset-import'

interface AssetRow extends LibraryDocument {
  domainLabel: string
}

export function AssetManagerPanel({
  csrfToken,
  initialSelectedDomain,
  initialSelectedName,
}: {
  csrfToken: string
  initialSelectedDomain?: string
  initialSelectedName?: string
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const assetInputRef = useRef<HTMLInputElement | null>(null)
  const backgroundInputRef = useRef<HTMLInputElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AssetRow | null>(null)

  const queries = useQueries({
    queries: [
      {
        queryKey: ['workspace', 'library-documents', 'assets'],
        queryFn: async ({ signal }: { signal?: AbortSignal }) => {
          const { fetchLibraryDocuments } = await import('@yggdrasil/api-client')
          return fetchLibraryDocuments('assets', signal)
        },
        staleTime: 30_000,
      },
      {
        queryKey: ['workspace', 'library-documents', 'backgrounds'],
        queryFn: async ({ signal }: { signal?: AbortSignal }) => {
          const { fetchLibraryDocuments } = await import('@yggdrasil/api-client')
          return fetchLibraryDocuments('backgrounds', signal)
        },
        staleTime: 30_000,
      },
    ],
  })

  const rows = useMemo<AssetRow[]>(() => {
    const assets = (queries[0]?.data ?? []).map((item) => ({ ...item, domainLabel: t('nav.assets') }))
    const backgrounds = (queries[1]?.data ?? []).map((item) => ({ ...item, domainLabel: t('assetsPanel.backgroundsLabel') }))
    return [...assets, ...backgrounds].sort(
      (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || left.name.localeCompare(right.name, 'zh-CN'),
    )
  }, [queries, t])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) =>
      [row.name, row.kind, row.domainLabel, ...(row.tags ?? [])].join(' ').toLowerCase().includes(query),
    )
  }, [rows, searchQuery])

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedId) {
        setSelectedId('')
      }
      return
    }

    if (!filteredRows.some((row) => rowId(row) === selectedId)) {
      setSelectedId(rowId(filteredRows[0]))
    }
  }, [filteredRows, selectedId])

  useEffect(() => {
    if (!initialSelectedName) {
      return
    }
    const matched = rows.find((row) =>
      row.name === initialSelectedName && (!initialSelectedDomain || row.domain === initialSelectedDomain),
    )
    if (matched) {
      setSelectedId(rowId(matched))
    }
  }, [initialSelectedDomain, initialSelectedName, rows])

  const activeId = filteredRows.some((row) => rowId(row) === selectedId)
    ? selectedId
    : (filteredRows[0] ? rowId(filteredRows[0]) : '')
  const selectedRow = filteredRows.find((row) => rowId(row) === activeId) ?? null

  const saveMutation = useMutation({
    mutationFn: async ({ file, domain }: { file: File; domain: 'assets' | 'backgrounds' }) => {
      const { saveLibraryDocument } = await import('@yggdrasil/api-client')
      const payload = await importAssetFile(file, domain)
      return saveLibraryDocument({
        csrfToken,
        ...payload,
      })
    },
    onSuccess: async (saved) => {
      setSelectedId(`${saved.domain}::${saved.name}`)
      await refreshAssets(queryClient)
      toast.success(t('assetsPanel.feedback.imported'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('assetsPanel.feedback.importFailed'))
    },
  })

  const exportMutation = useMutation({
    mutationFn: async (row: AssetRow) => {
      const { exportLibraryDocument } = await import('@yggdrasil/api-client')
      return exportLibraryDocument({
        csrfToken,
        domain: row.domain,
        name: row.name,
      })
    },
    onSuccess: (path) => {
      toast.success(t('assetsPanel.feedback.exported', { path }))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('assetsPanel.feedback.exportFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (row: AssetRow) => {
      const { deleteLibraryDocument } = await import('@yggdrasil/api-client')
      return deleteLibraryDocument({
        csrfToken,
        domain: row.domain,
        name: row.name,
      })
    },
    onSuccess: async (_, deletedRow) => {
      if (selectedId === rowId(deletedRow)) {
        const fallbackRow = filteredRows.find((row) => rowId(row) !== rowId(deletedRow))
        setSelectedId(fallbackRow ? rowId(fallbackRow) : '')
      }
      await refreshAssets(queryClient)
      toast.success(t('assetsPanel.feedback.deleted'))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('assetsPanel.feedback.deleteFailed'))
    },
  })

  return (
    <>
      <input
        ref={assetInputRef}
        type="file"
        className="hidden"
        accept="image/*,audio/*,video/*,.json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void saveMutation.mutateAsync({ file, domain: 'assets' })
          }
          event.target.value = ''
        }}
      />
      <input
        ref={backgroundInputRef}
        type="file"
        className="hidden"
        accept="image/*,.json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void saveMutation.mutateAsync({ file, domain: 'backgrounds' })
          }
          event.target.value = ''
        }}
      />

      <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="min-h-0 rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
          <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                  <ImageIcon className="size-4" />
                  <span>{t('nav.assets')}</span>
                </CardTitle>
                <CardDescription className="text-xs text-stone-400/80">{t('assetsPanel.description')}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button className="gap-2 rounded-sm" size="sm" type="button" onClick={() => assetInputRef.current?.click()}>
                <PlusIcon className="size-4" />
                <span>{t('assetsPanel.importAsset')}</span>
              </Button>
              <Button className="gap-2 rounded-sm" size="sm" type="button" variant="outline" onClick={() => backgroundInputRef.current?.click()}>
                <WallpaperIcon className="size-4" />
                <span>{t('assetsPanel.importBackground')}</span>
              </Button>
            </div>
            <div className="ref-section-search">
              <SearchIcon className="size-4" />
              <Input
                className="ref-section-search-input"
                placeholder={t('sectionBrowser.searchPlaceholder', { title: t('nav.assets') })}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="min-h-0 p-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-2 p-3">
                {filteredRows.map((row) => (
                  <button
                    key={rowId(row)}
                    type="button"
                    onClick={() => setSelectedId(rowId(row))}
                    className={`rounded-sm border px-3 py-3 text-left ${
                      rowId(row) === activeId
                        ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                        : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm text-stone-100">{row.name}</strong>
                      <Badge className="rounded-sm" variant="outline">{row.domainLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-stone-400/85">{row.kind}</p>
                    <p className="mt-1 text-[11px] text-stone-500">{row.updatedAt ? formatDateTime(row.updatedAt) : t('common.unavailable')}</p>
                  </button>
                ))}
                {filteredRows.length === 0 ? (
                  <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-6 text-sm text-stone-400/85">
                    {t('assetsPanel.empty')}
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
                <CardTitle className="text-sm font-semibold text-stone-100">{selectedRow?.name ?? t('nav.assets')}</CardTitle>
                <CardDescription className="text-xs text-stone-400/80">
                  {selectedRow ? `${selectedRow.domainLabel} · ${selectedRow.kind}` : t('assetsPanel.emptySelection')}
                </CardDescription>
              </div>
              {selectedRow ? (
                <div className="flex items-center gap-2">
                  <Button size="icon-sm" type="button" variant="ghost" title={t('common.export')} onClick={() => void exportMutation.mutateAsync(selectedRow)}>
                    <DownloadIcon className="size-4" />
                  </Button>
                  <Button size="icon-sm" type="button" variant="ghost" title={t('sectionBrowser.actions.delete')} onClick={() => setPendingDelete(selectedRow)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 p-0">
            {selectedRow ? (
              <ScrollArea className="h-full">
                <div className="grid gap-4 px-4 py-4">
                  <div className="grid gap-2 md:grid-cols-2">
                    <InfoField label={t('sectionBrowser.columns.category')} value={selectedRow.domainLabel} />
                    <InfoField label={t('library.type')} value={selectedRow.kind} />
                    <InfoField label={t('sectionBrowser.columns.updated')} value={selectedRow.updatedAt ? formatDateTime(selectedRow.updatedAt) : t('common.unavailable')} />
                    <InfoField label={t('library.tags')} value={selectedRow.tags.length > 0 ? selectedRow.tags.join(', ') : t('common.unavailable')} />
                  </div>
                  <div className="grid gap-3">
                    {renderAssetPreview(selectedRow, t)}
                    <pre className="overflow-x-auto rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3 font-mono text-xs leading-6 text-stone-200">
                      {formatAssetPayload(selectedRow.contentText)}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="px-4 py-6 text-sm text-stone-400/85">{t('assetsPanel.emptySelection')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sectionBrowser.actions.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? t('assetsPanel.deleteConfirm', { name: pendingDelete.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  void deleteMutation.mutateAsync(pendingDelete)
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

async function refreshAssets(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['workspace', 'catalog'] }),
    queryClient.invalidateQueries({ queryKey: ['workspace', 'library-documents', 'assets'] }),
    queryClient.invalidateQueries({ queryKey: ['workspace', 'library-documents', 'backgrounds'] }),
  ])
}

function rowId(row: AssetRow) {
  return `${row.domain}::${row.name}`
}

function formatAssetPayload(contentText?: string | null): string {
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

function readAssetPayload(contentText?: string | null): { dataUrl?: string; mimeType?: string } | null {
  if (!contentText?.trim()) return null
  try {
    const parsed = JSON.parse(contentText) as { dataUrl?: string; mimeType?: string }
    return parsed
  } catch {
    return null
  }
}

function renderAssetPreview(row: AssetRow, t: (key: string, params?: Record<string, string | number>) => string) {
  const previewLabel = row.kind === 'background' ? t('assetsPanel.previewBackground') : t('assetsPanel.preview')
  const payload = readAssetPayload(row.contentText)
  if (!payload?.dataUrl) {
    return null
  }

  if (row.kind === 'image' || row.kind === 'background') {
    return (
      <div className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-stone-500">{previewLabel}</span>
        <img
          alt={row.name}
          className="max-h-[360px] w-full rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] object-contain"
          src={payload.dataUrl}
        />
      </div>
    )
  }

  if (row.kind === 'audio') {
    return (
      <div className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-stone-500">{previewLabel}</span>
        <div className="flex items-center gap-3 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3 text-stone-200">
          <Music4Icon className="size-4" />
          <audio controls className="w-full" src={payload.dataUrl} />
        </div>
      </div>
    )
  }

  if (row.kind === 'video') {
    return (
      <div className="grid gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-stone-500">{previewLabel}</span>
        <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] p-3">
          <video controls className="max-h-[360px] w-full rounded-sm" src={payload.dataUrl} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3 text-sm text-stone-300">
      <ImageIcon className="size-4" />
      <span>{payload.mimeType ?? 'application/octet-stream'}</span>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3">
      <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{label}</span>
      <strong className="text-sm font-medium text-stone-100">{value}</strong>
    </div>
  )
}
