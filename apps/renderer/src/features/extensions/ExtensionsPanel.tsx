import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AppSettings, LibraryDocument, SettingsPayload, WorkspaceCatalogPayload } from '@yggdrasil/api-client'
import {
  DownloadIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  PlugZapIcon,
  PlusIcon,
  SearchIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
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
import { useDeleteLibraryDocumentMutation, useLibraryDocumentsQuery, useSaveLibraryDocumentMutation, useSaveSettingsMutation, workspaceCatalogQueryKey, workspaceQueryKey } from '@/features/workspace/hooks'
import { formatDateTime } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'
import { parseExtensionImport } from '@/lib/extension-import'
import { openExternalUrl } from '@/lib/open-external'

interface ExtensionRow extends LibraryDocument {
  author?: string
  description?: string
  disabledBySettings: boolean
  homepage?: string
  version?: string
}

const TAURI_LOCAL_TOKEN = 'tauri-local'

export function ExtensionsPanel({
  catalog,
  initialSelectedName,
  settings,
}: {
  catalog?: WorkspaceCatalogPayload | null
  initialSelectedName?: string
  settings: SettingsPayload | null
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ExtensionRow | null>(null)

  const extensionsQuery = useLibraryDocumentsQuery('extensions')
  const saveLibraryMutation = useSaveLibraryDocumentMutation()
  const deleteLibraryMutation = useDeleteLibraryDocumentMutation()
  const saveSettingsMutation = useSaveSettingsMutation()

  const disabledExtensions = useMemo(
    () => new Set(catalog?.disabledExtensions ?? []),
    [catalog?.disabledExtensions],
  )

  const rows = useMemo<ExtensionRow[]>(() => {
    return (extensionsQuery.data ?? []).map((document) => {
      const parsed = parseExtensionContent(document.contentText)
      return {
        ...document,
        author: parsed.author,
        description: parsed.description,
        disabledBySettings: disabledExtensions.has(document.name),
        homepage: parsed.homepage,
        version: parsed.version,
      }
    }).sort(
      (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || left.name.localeCompare(right.name, 'zh-CN'),
    )
  }, [disabledExtensions, extensionsQuery.data])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) =>
      [
        row.name,
        row.author ?? '',
        row.description ?? '',
        row.version ?? '',
        ...(row.tags ?? []),
      ].join(' ').toLowerCase().includes(query),
    )
  }, [rows, searchQuery])

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedName) {
        setSelectedName('')
      }
      return
    }

    if (!filteredRows.some((row) => row.name === selectedName)) {
      setSelectedName(filteredRows[0]?.name ?? '')
    }
  }, [filteredRows, selectedName])

  useEffect(() => {
    if (initialSelectedName && rows.some((row) => row.name === initialSelectedName)) {
      setSelectedName(initialSelectedName)
    }
  }, [initialSelectedName, rows])

  const activeRow = filteredRows.find((row) => row.name === selectedName) ?? filteredRows[0] ?? null

  const enabledCount = rows.filter((row) => !row.disabledBySettings).length

  async function updateDisabledExtensions(nextDisabledNames: string[]) {
    if (!settings?.settings) {
      throw new Error(t('extensionsPanel.feedback.settingsUnavailable'))
    }

    const currentSettings = settings.settings
    const extensionSettings =
      currentSettings.extension_settings && typeof currentSettings.extension_settings === 'object'
        ? currentSettings.extension_settings
        : {}

    const nextSettings: AppSettings = {
      ...currentSettings,
      extension_settings: {
        ...extensionSettings,
        disabledExtensions: Array.from(new Set(nextDisabledNames)).sort((left, right) =>
          left.localeCompare(right, 'zh-CN'),
        ),
      },
    }

    await saveSettingsMutation.mutateAsync({
      csrfToken: TAURI_LOCAL_TOKEN,
      settings: nextSettings,
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceQueryKey }),
      queryClient.invalidateQueries({ queryKey: workspaceCatalogQueryKey }),
    ])
  }

  const toggleMutation = useMutation({
    mutationFn: async (row: ExtensionRow) => {
      const nextDisabled = new Set(disabledExtensions)
      if (row.disabledBySettings) {
        nextDisabled.delete(row.name)
      } else {
        nextDisabled.add(row.name)
      }
      await updateDisabledExtensions(Array.from(nextDisabled))
    },
    onSuccess: (_, row) => {
      toast.success(
        row.disabledBySettings
          ? t('extensionsPanel.feedback.enabled', { name: row.name })
          : t('extensionsPanel.feedback.disabled', { name: row.name }),
      )
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('extensionsPanel.feedback.toggleFailed'))
    },
  })

  const exportMutation = useMutation({
    mutationFn: async (row: ExtensionRow) => {
      const { exportLibraryDocument } = await import('@yggdrasil/api-client')
      return exportLibraryDocument({
        csrfToken: TAURI_LOCAL_TOKEN,
        domain: row.domain,
        name: row.name,
      })
    },
    onSuccess: (path) => {
      toast.success(t('extensionsPanel.feedback.exported', { path }))
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('extensionsPanel.feedback.exportFailed'))
    },
  })

  return (
    <>
      <input
        ref={importInputRef}
        accept=".json"
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) {
            return
          }

          void file.text()
            .then((raw) => parseExtensionImport(raw, file.name))
            .then((payload) =>
              saveLibraryMutation.mutateAsync({
                csrfToken: TAURI_LOCAL_TOKEN,
                domain: 'extensions',
                ...payload,
              }),
            )
            .then((saved) => {
              toast.success(t('extensionsPanel.feedback.imported', { name: saved.name }))
              setSelectedName(saved.name)
            })
            .catch((error) => {
              toast.error(error instanceof Error ? error.message : t('extensionsPanel.feedback.importFailed'))
            })
            .finally(() => {
              event.target.value = ''
            })
        }}
      />

      <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="min-h-0 rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
          <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                  <PlugZapIcon className="size-4" />
                  <span>{t('nav.extensions')}</span>
                </CardTitle>
                <CardDescription className="text-xs text-stone-400/80">
                  {t('extensionsPanel.description')}
                </CardDescription>
              </div>
              <Badge className="rounded-sm" variant="outline">
                {t('extensionsPanel.summary', { enabled: enabledCount, total: rows.length })}
              </Badge>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button className="gap-2 rounded-sm" size="sm" type="button" onClick={() => importInputRef.current?.click()}>
                <PlusIcon className="size-4" />
                <span>{t('extensionsPanel.importAction')}</span>
              </Button>
            </div>
            <div className="ref-section-search">
              <SearchIcon className="size-4" />
              <Input
                className="ref-section-search-input"
                placeholder={t('sectionBrowser.searchPlaceholder', { title: t('nav.extensions') })}
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
                    key={row.name}
                    type="button"
                    onClick={() => setSelectedName(row.name)}
                    className={`rounded-sm border px-3 py-3 text-left ${
                      row.name === activeRow?.name
                        ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                        : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm text-stone-100">{row.name}</strong>
                      <Badge className="rounded-sm" variant={row.disabledBySettings ? 'secondary' : 'outline'}>
                        {row.disabledBySettings ? t('common.disabled') : t('common.ready')}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-stone-400/85">
                      {row.version ? `v${row.version}` : t('common.unavailable')}
                      {row.author ? ` · ${row.author}` : ''}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-stone-500">
                      {row.description || t('extensionsPanel.noDescription')}
                    </p>
                  </button>
                ))}
                {!extensionsQuery.isPending && filteredRows.length === 0 ? (
                  <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-6 text-sm text-stone-400/85">
                    {t('extensionsPanel.empty')}
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
                <CardTitle className="text-sm font-semibold text-stone-100">
                  {activeRow?.name ?? t('nav.extensions')}
                </CardTitle>
                <CardDescription className="text-xs text-stone-400/80">
                  {activeRow
                    ? activeRow.description || t('extensionsPanel.noDescription')
                    : t('extensionsPanel.emptySelection')}
                </CardDescription>
              </div>
              {activeRow ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    title={activeRow.disabledBySettings ? t('extensionsPanel.enableAction') : t('extensionsPanel.disableAction')}
                    onClick={() => void toggleMutation.mutateAsync(activeRow)}
                  >
                    {activeRow.disabledBySettings ? <ToggleLeftIcon className="size-4" /> : <ToggleRightIcon className="size-4" />}
                  </Button>
                  {activeRow.homepage ? (
                    <Button
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      title={t('extensionsPanel.openHomepage')}
                      onClick={() => openExternalUrl(activeRow.homepage ?? '')}
                    >
                      <ExternalLinkIcon className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    title={t('common.export')}
                    onClick={() => void exportMutation.mutateAsync(activeRow)}
                  >
                    <DownloadIcon className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    title={t('sectionBrowser.actions.delete')}
                    onClick={() => setPendingDelete(activeRow)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 p-0">
            {activeRow ? (
              <ScrollArea className="h-full">
                <div className="grid gap-4 px-4 py-4">
                  <div className="grid gap-2 md:grid-cols-2">
                    <InfoField label={t('library.type')} value={activeRow.kind} />
                    <InfoField label={t('extensionsPanel.fields.status')} value={activeRow.disabledBySettings ? t('common.disabled') : t('common.ready')} />
                    <InfoField label={t('extensionsPanel.fields.version')} value={activeRow.version || t('common.unavailable')} />
                    <InfoField label={t('extensionsPanel.fields.author')} value={activeRow.author || t('common.unavailable')} />
                    <InfoField label={t('sectionBrowser.columns.updated')} value={activeRow.updatedAt ? formatDateTime(activeRow.updatedAt) : t('common.unavailable')} />
                    <InfoField label={t('library.tags')} value={activeRow.tags.length > 0 ? activeRow.tags.join(', ') : t('common.unavailable')} />
                  </div>
                  {activeRow.homepage ? (
                    <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3 text-sm text-stone-300">
                      <span className="mr-2 text-[11px] uppercase tracking-[0.2em] text-stone-500">{t('extensionsPanel.fields.homepage')}</span>
                      <span className="break-all">{activeRow.homepage}</span>
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-stone-500">
                      <EyeOffIcon className="size-4" />
                      <span>{t('extensionsPanel.fields.manifest')}</span>
                    </div>
                    <pre className="overflow-x-auto rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3 font-mono text-xs leading-6 text-stone-200">
                      {formatManifest(activeRow.contentText)}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="px-4 py-6 text-sm text-stone-400/85">{t('extensionsPanel.emptySelection')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sectionBrowser.actions.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? t('extensionsPanel.deleteConfirm', { name: pendingDelete.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) {
                  return
                }

                void deleteLibraryMutation
                  .mutateAsync({
                    csrfToken: TAURI_LOCAL_TOKEN,
                    domain: 'extensions',
                    name: pendingDelete.name,
                  })
                  .then(async () => {
                    if (selectedName === pendingDelete.name) {
                      const fallbackRow = filteredRows.find((item) => item.name !== pendingDelete.name)
                      setSelectedName(fallbackRow?.name ?? '')
                    }
                    if (disabledExtensions.has(pendingDelete.name)) {
                      await updateDisabledExtensions(
                        Array.from(disabledExtensions).filter((item) => item !== pendingDelete.name),
                      )
                    }
                    toast.success(t('extensionsPanel.feedback.deleted', { name: pendingDelete.name }))
                  })
                  .catch((error) => {
                    toast.error(error instanceof Error ? error.message : t('extensionsPanel.feedback.deleteFailed'))
                  })
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

function parseExtensionContent(contentText?: string | null): {
  author?: string
  description?: string
  homepage?: string
  version?: string
} {
  if (!contentText?.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(contentText) as Record<string, unknown>
    return {
      version: typeof parsed.version === 'string' ? parsed.version : undefined,
      author: typeof parsed.author === 'string' ? parsed.author : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      homepage:
        typeof parsed.homepage === 'string'
          ? parsed.homepage
          : typeof parsed.url === 'string'
            ? parsed.url
            : undefined,
    }
  } catch {
    return {}
  }
}

function formatManifest(contentText?: string | null): string {
  if (!contentText?.trim()) {
    return '{}'
  }

  try {
    return JSON.stringify(JSON.parse(contentText), null, 2)
  } catch {
    return contentText
  }
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3">
      <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{label}</span>
      <strong className="text-sm font-medium text-stone-100">{value}</strong>
    </div>
  )
}
