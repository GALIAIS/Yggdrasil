import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { LibraryDocument } from '@yggdrasil/api-client'
import {
  DownloadIcon,
  PencilLineIcon,
  PlusIcon,
  ScrollTextIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useDeleteLibraryDocumentMutation,
  useSaveLibraryDocumentMutation,
} from '@/features/workspace/hooks'
import { useStoredState } from '@/hooks/useStoredState'
import { formatDateTime } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'
import { parsePresetImport } from '@/lib/library-import'
import { toast } from 'sonner'
import { WorkspaceEditorDialog } from '@/components/ui/workspace-editor-dialog'

import {
  PRESET_DOMAIN_CONFIGS,
  type PresetDomain,
  type PresetScope,
  getPresetDomainConfig,
  resolvePresetDomainFromKind,
} from './preset-domains'

interface PresetRow extends LibraryDocument {
  domainLabel: string
}

type EditorState = {
  mode: 'create' | 'edit'
  domain: PresetDomain
  originalDomain?: PresetDomain
  originalName?: string
  name: string
  tagsText: string
  contentText: string
}

const DEFAULT_DOMAIN: PresetDomain = 'textgenPresets'

export function PresetManagerPanel({
  csrfToken,
  initialSelectedDomain,
  initialSelectedKind,
  initialSelectedName,
}: {
  csrfToken: string
  initialSelectedDomain?: string
  initialSelectedKind?: string
  initialSelectedName?: string
}) {
  const { t } = useI18n()
  const saveMutation = useSaveLibraryDocumentMutation()
  const deleteMutation = useDeleteLibraryDocumentMutation()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [searchQuery, setSearchQuery] = useStoredState('st.panel.presets.searchQuery', '')
  const [scope, setScope] = useStoredState<PresetScope>('st.panel.presets.scope', 'all')
  const [selectedId, setSelectedId] = useStoredState('st.panel.presets.selectedId', '')
  const [editorState, setEditorState] = useState<EditorState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PresetRow | null>(null)

  const queries = useQueries({
    queries: PRESET_DOMAIN_CONFIGS.map((config) => ({
      queryKey: ['workspace', 'library-documents', config.domain],
      queryFn: async ({ signal }: { signal?: AbortSignal }) => {
        const { fetchLibraryDocuments } = await import('@yggdrasil/api-client')
        return fetchLibraryDocuments(config.domain, signal)
      },
      staleTime: 30_000,
    })),
  })

  const rows = useMemo<PresetRow[]>(() => {
    return PRESET_DOMAIN_CONFIGS.flatMap((config, index) => {
      const documents = (queries[index]?.data ?? []) as LibraryDocument[]
      return documents.map((document) => ({
        ...document,
        domainLabel: t(config.labelKey),
      }))
    }).sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || left.name.localeCompare(right.name, 'zh-CN'))
  }, [queries, t])

  const effectiveInitialDomain = useMemo(() => {
    if (initialSelectedDomain && getPresetDomainConfig(initialSelectedDomain)) {
      return initialSelectedDomain as PresetDomain
    }
    if (initialSelectedKind) {
      return resolvePresetDomainFromKind(initialSelectedKind) ?? undefined
    }
    return undefined
  }, [initialSelectedDomain, initialSelectedKind])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return rows.filter((row) => {
      if (scope !== 'all' && row.domain !== scope) {
        return false
      }

      if (!query) {
        return true
      }

      return [row.name, row.kind, row.domainLabel, ...(row.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [rows, scope, searchQuery])

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
  }, [filteredRows, selectedId, setSelectedId])

  useEffect(() => {
    if (!initialSelectedName) {
      return
    }

    const matched = rows.find((row) =>
      row.name === initialSelectedName
      && (!effectiveInitialDomain || row.domain === effectiveInitialDomain),
    )

    if (matched) {
      setSelectedId(rowId(matched))
      if (scope !== 'all' && matched.domain !== scope) {
        setScope(matched.domain as PresetScope)
      }
    }
  }, [effectiveInitialDomain, initialSelectedName, rows, scope, setScope, setSelectedId])

  const activeId = filteredRows.some((row) => rowId(row) === selectedId)
    ? selectedId
    : (filteredRows[0] ? rowId(filteredRows[0]) : '')
  const selectedRow = filteredRows.find((row) => rowId(row) === activeId) ?? null
  const activeDomain = scope === 'all'
    ? ((selectedRow?.domain as PresetDomain | undefined) ?? effectiveInitialDomain ?? DEFAULT_DOMAIN)
    : scope

  const handleCreate = () => {
    const domain = activeDomain
    setEditorState({
      mode: 'create',
      domain,
      name: buildDefaultPresetName(domain, rows.length + 1, t),
      tagsText: '',
      contentText: buildDefaultPresetContent(domain),
    })
  }

  const handleEdit = (row: PresetRow) => {
    setEditorState({
      mode: 'edit',
      domain: row.domain as PresetDomain,
      originalDomain: row.domain as PresetDomain,
      originalName: row.name,
      name: row.name,
      tagsText: row.tags.join(', '),
      contentText: formatPresetContent(row.contentText),
    })
  }

  const handleSave = async () => {
    if (!editorState) {
      return
    }

    const name = editorState.name.trim()
    if (!name) {
      toast.error(t('presetsPanel.feedback.saveFailed'))
      return
    }

    const config = getPresetDomainConfig(editorState.domain)
    if (!config) {
      toast.error(t('presetsPanel.feedback.saveFailed'))
      return
    }

    const tags = editorState.tagsText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    try {
      await saveMutation.mutateAsync({
        csrfToken,
        contentText: editorState.contentText,
        domain: config.domain,
        kind: config.kind,
        name,
        tags,
      })

      if (
        editorState.mode === 'edit'
        && editorState.originalName
        && editorState.originalDomain
        && (editorState.originalName !== name || editorState.originalDomain !== editorState.domain)
      ) {
        await deleteMutation.mutateAsync({
          csrfToken,
          domain: editorState.originalDomain,
          name: editorState.originalName,
        })
      }

      setSelectedId(`${config.domain}::${name}`)
      setEditorState(null)
      toast.success(t('presetsPanel.feedback.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('presetsPanel.feedback.saveFailed'))
    }
  }

  const handleImport = async (file: File) => {
    const domain = activeDomain
    const config = getPresetDomainConfig(domain)
    if (!config) {
      return
    }

    try {
      const text = await file.text()
      const payload =
        domain === 'textgenPresets'
          ? (() => {
              const preset = parsePresetImport(text, file.name)
              return {
                contentText: JSON.stringify(preset, null, 2),
                name: preset.name.trim() || buildDefaultPresetName(domain, rows.length + 1, t),
                tags: ['textgen'],
              }
            })()
          : {
              contentText: text,
              name: inferPresetNameFromFile(file.name),
              tags: [],
            }

      await saveMutation.mutateAsync({
        csrfToken,
        contentText: payload.contentText,
        domain: config.domain,
        kind: config.kind,
        name: payload.name,
        tags: payload.tags,
      })
      setSelectedId(`${config.domain}::${payload.name}`)
      toast.success(t('presetsPanel.feedback.imported'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('presetsPanel.feedback.importFailed'))
    }
  }

  const handleDelete = async (row: PresetRow) => {
    try {
      await deleteMutation.mutateAsync({
        csrfToken,
        domain: row.domain,
        name: row.name,
      })
      setPendingDelete(null)
      toast.success(t('presetsPanel.feedback.deleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('presetsPanel.feedback.deleteFailed'))
    }
  }

  const handleExport = async (row: PresetRow) => {
    try {
      const { exportLibraryDocument } = await import('@yggdrasil/api-client')
      const exportPath = await exportLibraryDocument({
        csrfToken,
        domain: row.domain,
        name: row.name,
      })
      toast.success(t('presetsPanel.feedback.exported', { path: exportPath }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('presetsPanel.feedback.exportFailed'))
    }
  }

  return (
    <>
      <input
        accept=".json,.txt,.md"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void handleImport(file)
          }
          event.target.value = ''
        }}
        ref={importInputRef}
        type="file"
      />

      <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="min-h-0 rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
          <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                  <ScrollTextIcon className="size-4" />
                  <span>{t('nav.presets')}</span>
                </CardTitle>
                <CardDescription className="text-xs text-stone-400/80">
                  {t('presetsPanel.description')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button className="gap-2 rounded-sm" onClick={() => importInputRef.current?.click()} size="sm" type="button" variant="outline">
                  <UploadIcon className="size-4" />
                  <span>{t('common.import')}</span>
                </Button>
                <Button className="gap-2 rounded-sm" onClick={handleCreate} size="sm" type="button">
                  <PlusIcon className="size-4" />
                  <span>{t('presetsPanel.createAction')}</span>
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="ref-section-search">
                <SearchIcon className="size-4" />
                <Input
                  className="ref-section-search-input"
                  placeholder={t('sectionBrowser.searchPlaceholder', { title: t('nav.presets') })}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <Select value={scope} onValueChange={(value) => setScope(value as PresetScope)}>
                <SelectTrigger className="rounded-sm">
                  <SelectValue placeholder={t('presetsPanel.scopeLabel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('presetsPanel.scopes.all')}</SelectItem>
                  {PRESET_DOMAIN_CONFIGS.map((config) => (
                    <SelectItem key={config.domain} value={config.domain}>
                      {t(config.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 p-0">
            {filteredRows.length === 0 ? (
              <div className="p-4">
                <Empty className="rounded-sm border-[rgba(194,154,89,0.16)] bg-[rgba(255,245,222,0.02)]">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ScrollTextIcon />
                    </EmptyMedia>
                    <EmptyTitle>{t('presetsPanel.emptyTitle')}</EmptyTitle>
                    <EmptyDescription>{t('presetsPanel.emptyDescription')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-2 p-3">
                  {filteredRows.map((row) => (
                    <button
                      className={`rounded-sm border px-3 py-3 text-left ${
                        rowId(row) === activeId
                          ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                          : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)]'
                      }`}
                      key={rowId(row)}
                      onClick={() => setSelectedId(rowId(row))}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="truncate text-sm text-stone-100">{row.name}</strong>
                        <Badge className="rounded-sm" variant="outline">{row.domainLabel}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs leading-5 text-stone-400/85">
                        {summarizePresetRow(row, t)}
                      </p>
                      <p className="mt-1 text-[11px] text-stone-500">
                        {row.updatedAt ? formatDateTime(row.updatedAt) : t('common.unavailable')}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0 rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
          <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold text-stone-100">{selectedRow?.name ?? t('nav.presets')}</CardTitle>
                <CardDescription className="text-xs text-stone-400/80">
                  {selectedRow ? `${selectedRow.domainLabel} · ${selectedRow.kind}` : t('presetsPanel.emptySelection')}
                </CardDescription>
              </div>
              {selectedRow ? (
                <div className="flex items-center gap-2">
                  <Button onClick={() => void handleExport(selectedRow)} size="icon-sm" type="button" variant="ghost">
                    <DownloadIcon className="size-4" />
                  </Button>
                  <Button onClick={() => handleEdit(selectedRow)} size="icon-sm" type="button" variant="ghost">
                    <PencilLineIcon className="size-4" />
                  </Button>
                  <Button onClick={() => setPendingDelete(selectedRow)} size="icon-sm" type="button" variant="ghost">
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
                    <InfoField label={t('presetsPanel.domainLabel')} value={selectedRow.domainLabel} />
                    <InfoField label={t('library.type')} value={selectedRow.kind} />
                    <InfoField label={t('library.tags')} value={selectedRow.tags.length > 0 ? selectedRow.tags.join(', ') : t('common.unavailable')} />
                    <InfoField label={t('sectionBrowser.columns.updated')} value={selectedRow.updatedAt ? formatDateTime(selectedRow.updatedAt) : t('common.unavailable')} />
                  </div>
                  <div className="grid gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-stone-500">{t('presetsPanel.contentLabel')}</span>
                    <pre className="overflow-x-auto rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3 font-mono text-xs leading-6 text-stone-200">
                      {formatPresetContent(selectedRow.contentText)}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="px-4 py-6 text-sm text-stone-400/85">{t('presetsPanel.emptySelection')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <WorkspaceEditorDialog
        bodyClassName="max-h-[72vh] overflow-y-auto"
        description={
          editorState?.mode === 'edit'
            ? t('presetsPanel.editorDescriptionEdit')
            : t('presetsPanel.editorDescriptionCreate')
        }
        footer={(
          <>
            <Button onClick={() => setEditorState(null)} type="button" variant="outline">
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleSave()} type="button">
              {editorState?.mode === 'edit' ? t('common.save') : t('presetsPanel.createAction')}
            </Button>
          </>
        )}
        onOpenChange={(open) => !open && setEditorState(null)}
        open={Boolean(editorState)}
        showCloseButton
        style={{ width: 'min(1120px, calc(100vw - 40px))', maxWidth: 'min(1120px, calc(100vw - 40px))' }}
        title={editorState?.mode === 'edit' ? t('presetsPanel.editorTitleEdit') : t('presetsPanel.editorTitleCreate')}
      >
        {editorState ? (
          <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{t('presetsPanel.domainLabel')}</span>
                  <Select
                    disabled={editorState.mode === 'edit'}
                    value={editorState.domain}
                    onValueChange={(value) => setEditorState((current) => current ? { ...current, domain: value as PresetDomain } : current)}
                  >
                    <SelectTrigger className="rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESET_DOMAIN_CONFIGS.map((config) => (
                        <SelectItem key={config.domain} value={config.domain}>
                          {t(config.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{t('sectionBrowser.columns.name')}</span>
                  <Input
                    className="rounded-sm"
                    value={editorState.name}
                    onChange={(event) => setEditorState((current) => current ? { ...current, name: event.target.value } : current)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{t('presetsPanel.tagsLabel')}</span>
                <Input
                  className="rounded-sm"
                  placeholder={t('presetsPanel.tagsPlaceholder')}
                  value={editorState.tagsText}
                  onChange={(event) => setEditorState((current) => current ? { ...current, tagsText: event.target.value } : current)}
                />
              </div>
              <div className="grid gap-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{t('presetsPanel.contentLabel')}</span>
                <Textarea
                  className="min-h-[420px] rounded-sm border-[rgba(194,154,89,0.16)] bg-[rgba(10,8,7,0.72)] font-mono text-xs leading-6 text-stone-200"
                  placeholder={t('presetsPanel.contentPlaceholder')}
                  value={editorState.contentText}
                  onChange={(event) => setEditorState((current) => current ? { ...current, contentText: event.target.value } : current)}
                />
              </div>
          </div>
        ) : null}
      </WorkspaceEditorDialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(nextOpen) => !nextOpen && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('presetsPanel.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? t('presetsPanel.deleteConfirm', { name: pendingDelete.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  void handleDelete(pendingDelete)
                }
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

function rowId(row: PresetRow) {
  return `${row.domain}::${row.name}`
}

function inferPresetNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, '').trim() || 'Imported Preset'
}

function buildDefaultPresetName(
  domain: PresetDomain,
  count: number,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const config = getPresetDomainConfig(domain)
  const prefix = config ? t(config.labelKey) : t('nav.presets')
  return `${prefix} ${count}`
}

function buildDefaultPresetContent(domain: PresetDomain): string {
  if (domain === 'textgenPresets') {
    return JSON.stringify({
      temperature: 1,
      top_p: 1,
      top_k: 40,
      repetition_penalty: 1,
      max_tokens: 2048,
      system_prompt: '',
      instruct_template: '',
    }, null, 2)
  }

  return ''
}

function formatPresetContent(contentText?: string | null): string {
  if (!contentText?.trim()) {
    return '{}'
  }

  try {
    return JSON.stringify(JSON.parse(contentText), null, 2)
  } catch {
    return contentText
  }
}

function summarizePresetRow(
  row: PresetRow,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (row.kind === 'textgen-preset') {
    try {
      const parsed = JSON.parse(row.contentText ?? '{}') as Record<string, unknown>
      return `T=${Number(parsed.temperature ?? 1).toFixed(2)} · P=${Number(parsed.top_p ?? 1).toFixed(2)} · K=${Number(parsed.top_k ?? 40)}`
    } catch {
      return t('presetsPanel.corruptedSummary')
    }
  }

  const text = row.contentText?.trim() ?? ''
  if (!text) {
    return t('common.unconfigured')
  }

  const compact = text.replace(/\s+/gu, ' ').trim()
  return compact.length > 72 ? `${compact.slice(0, 71).trimEnd()}…` : compact
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3">
      <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{label}</span>
      <strong className="text-sm font-medium text-stone-100">{value}</strong>
    </div>
  )
}
