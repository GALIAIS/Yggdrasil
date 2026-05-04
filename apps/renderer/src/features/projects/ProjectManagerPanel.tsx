import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  DownloadIcon,
  FolderKanbanIcon,
  PaperclipIcon,
  PencilLineIcon,
  PlugZapIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import type { ProjectManifestRecord, WorkspaceCatalogEntry, WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  useDeleteProjectManifestMutation,
  useProjectManifestsQuery,
  useSaveProjectManifestMutation,
  useSetProjectPluginBindingMutation,
} from '@/features/workspace/hooks'
import { useStoredState } from '@/hooks/useStoredState'
import { formatDateTime } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'
import { toast } from 'sonner'

type ProjectDraft = {
  name: string
  description: string
  themeName: string
  characterAvatars: string[]
  lorebookNames: string[]
  storyAssetNames: string[]
  sessionNames: string[]
  pluginBindings: string[]
}

export function ProjectManagerPanel({
  csrfToken,
  catalog,
  initialSelectedName,
}: {
  csrfToken: string
  catalog: WorkspaceCatalogPayload | null
  initialSelectedName?: string
}) {
  const { t } = useI18n()
  const manifestsQuery = useProjectManifestsQuery()
  const saveMutation = useSaveProjectManifestMutation()
  const deleteMutation = useDeleteProjectManifestMutation()
  const setPluginBindingMutation = useSetProjectPluginBindingMutation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedName, setSelectedName] = useStoredState<string | null>('st.panel.projects.selectedName', null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<ProjectDraft | null>(null)
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null)

  const manifests = useMemo(
    () =>
      [...(manifestsQuery.data ?? [])].sort(
        (left, right) =>
          (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || left.name.localeCompare(right.name, 'zh-CN'),
      ),
    [manifestsQuery.data],
  )

  const extensionEntries = useMemo<WorkspaceCatalogEntry[]>(
    () => [...(catalog?.entries.extensions ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [catalog?.entries.extensions],
  )

  useEffect(() => {
    if (initialSelectedName && manifests.some((manifest) => manifest.name === initialSelectedName)) {
      setSelectedName(initialSelectedName)
      return
    }

    if (manifests.length === 0) {
      if (selectedName !== null) {
        setSelectedName(null)
      }
      return
    }

    if (!selectedName || !manifests.some((manifest) => manifest.name === selectedName)) {
      setSelectedName(manifests[0]?.name ?? null)
    }
  }, [initialSelectedName, manifests, selectedName, setSelectedName])

  const selectedManifest = manifests.find((manifest) => manifest.name === selectedName) ?? null
  const themedCount = manifests.filter((manifest) => manifest.themeName.trim().length > 0).length
  const linkedSessionsCount = manifests.reduce((count, manifest) => count + manifest.sessionNames.length, 0)

  const openCreate = () => {
    setDraft({
      name: `${t('projectsPanel.createAction')} ${manifests.length + 1}`,
      description: '',
      themeName: '',
      characterAvatars: [],
      lorebookNames: [],
      storyAssetNames: [],
      sessionNames: [],
      pluginBindings: [],
    })
    setEditorOpen(true)
  }

  const openEdit = () => {
    if (!selectedManifest) {
      return
    }

    setDraft(toProjectDraft(selectedManifest))
    setEditorOpen(true)
  }

  const handleSave = async (project: ProjectDraft) => {
    const name = project.name.trim()
    if (!name) {
      return
    }

    try {
      await saveMutation.mutateAsync({
        csrfToken,
        name,
        description: project.description,
        themeName: project.themeName,
        characterAvatars: project.characterAvatars,
        lorebookNames: project.lorebookNames,
        storyAssetNames: project.storyAssetNames,
        sessionNames: project.sessionNames,
        pluginBindings: project.pluginBindings,
      })
      setSelectedName(name)
      setDraft(null)
      setEditorOpen(false)
      toast.success(t('projectsPanel.feedback.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('projectsPanel.feedback.saveFailed'))
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteMutation.mutateAsync({
        csrfToken,
        name,
      })
      if (selectedName === name) {
        setSelectedName(null)
      }
      toast.success(t('projectsPanel.feedback.deleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('projectsPanel.feedback.deleteFailed'))
    }
  }

  const handleExport = async (name: string) => {
    try {
      const { exportProjectManifest } = await import('@yggdrasil/api-client')
      const path = await exportProjectManifest({
        csrfToken,
        name,
      })
      toast.success(t('projectsPanel.feedback.exported', { path }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('projectsPanel.feedback.exportFailed'))
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const rawJson = await file.text()
      const { importProjectManifest } = await import('@yggdrasil/api-client')
      const saved = await importProjectManifest({
        csrfToken,
        rawJson,
      })
      toast.success(t('projectsPanel.feedback.imported', { name: saved.name }))
      setSelectedName(saved.name)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('projectsPanel.feedback.importFailed'))
    } finally {
      event.target.value = ''
    }
  }

  const handlePluginBindingToggle = async (pluginId: string, enabled: boolean) => {
    if (!selectedManifest) {
      return
    }

    try {
      await setPluginBindingMutation.mutateAsync({
        csrfToken,
        projectName: selectedManifest.name,
        pluginId,
        enabled,
      })
      toast.success(
        enabled
          ? t('projectsPanel.feedback.pluginEnabled', { name: pluginId })
          : t('projectsPanel.feedback.pluginDisabled', { name: pluginId }),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('projectsPanel.feedback.pluginToggleFailed'))
    }
  }

  return (
    <>
      <input
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleImportChange(event)}
        ref={fileInputRef}
        type="file"
      />

      <Card className="h-full rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
        <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-stone-100">{t('nav.projects')}</CardTitle>
              <CardDescription className="mt-1 text-xs text-stone-400/80">
                {t('projectsPanel.description')}
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-2 xl:flex xl:flex-wrap xl:items-center">
              <MetricChip label={t('projectsPage.metrics.projects')} value={manifests.length} />
              <MetricChip label={t('projectsPage.metrics.themed')} value={themedCount} />
              <MetricChip label={t('projectsPage.metrics.linkedSessions')} value={linkedSessionsCount} />
              <Button className="gap-2 rounded-sm" onClick={handleImportClick} size="sm" type="button" variant="outline">
                <UploadIcon className="size-4" />
                <span>{t('common.import')}</span>
              </Button>
              <Button className="gap-2 rounded-sm" onClick={openCreate} size="sm" type="button">
                <PlusIcon className="size-4" />
                <span>{t('projectsPanel.createAction')}</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[calc(100%-92px)] min-h-0 p-0">
          <div className="grid h-full min-h-0 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
            <div className="border-b border-[rgba(194,154,89,0.12)] xl:border-r xl:border-b-0">
              {manifests.length === 0 ? (
                <div className="p-4">
                  <Empty className="rounded-sm border-[rgba(194,154,89,0.16)] bg-[rgba(255,245,222,0.02)]">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FolderKanbanIcon />
                      </EmptyMedia>
                      <EmptyTitle>{t('projectsPanel.emptyTitle')}</EmptyTitle>
                      <EmptyDescription>{t('projectsPanel.emptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-2 p-3">
                    {manifests.map((manifest) => (
                      <button
                        className={`rounded-sm border px-3 py-3 text-left transition-colors ${
                          manifest.name === selectedName
                            ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                            : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] hover:bg-[rgba(255,245,222,0.04)]'
                        }`}
                        key={manifest.name}
                        onClick={() => setSelectedName(manifest.name)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <strong className="truncate text-sm font-medium text-stone-100">{manifest.name}</strong>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-400/85">
                              {manifest.description || t('common.unconfigured')}
                            </p>
                            <p className="mt-2 text-[11px] leading-5 text-stone-500">
                              {manifest.updatedAt ? formatDateTime(manifest.updatedAt) : t('common.unavailable')}
                            </p>
                          </div>
                          <Badge className="rounded-sm" variant="outline">
                            {manifest.pluginBindings.length}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="min-h-0">
              {selectedManifest ? (
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <FolderKanbanIcon className="size-4 text-[rgba(212,180,131,0.82)]" />
                          <h3 className="text-base font-semibold text-stone-100">{selectedManifest.name}</h3>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-stone-300/90">
                          {selectedManifest.description || t('common.unconfigured')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button className="gap-2 rounded-sm" onClick={openEdit} size="sm" type="button" variant="outline">
                          <PencilLineIcon className="size-4" />
                          <span>{t('projectsPanel.editAction')}</span>
                        </Button>
                        <Button
                          className="gap-2 rounded-sm"
                          onClick={() => void handleExport(selectedManifest.name)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <DownloadIcon className="size-4" />
                          <span>{t('common.export')}</span>
                        </Button>
                        <Button
                          className="rounded-sm"
                          onClick={() => setPendingDeleteName(selectedManifest.name)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <DetailBlock label={t('projectsPanel.fields.theme')} value={selectedManifest.themeName} />
                      <DetailBlock label={t('projectsPanel.fields.sessions')} value={selectedManifest.sessionNames.join(', ')} />
                      <DetailBlock label={t('projectsPanel.fields.characters')} value={selectedManifest.characterAvatars.join(', ')} />
                      <DetailBlock label={t('projectsPanel.fields.lorebooks')} value={selectedManifest.lorebookNames.join(', ')} />
                      <DetailBlock label={t('projectsPanel.fields.storyAssets')} value={selectedManifest.storyAssetNames.join(', ')} />
                      <DetailBlock label={t('projectsPanel.fields.plugins')} value={selectedManifest.pluginBindings.join(', ')} />
                    </div>

                    <DetailBlock label={t('projectsPanel.fields.description')} multiline value={selectedManifest.description} />

                    <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(15,11,9,0.42)] p-3">
                      <div className="flex items-center gap-2">
                        <PlugZapIcon className="size-4 text-[rgba(212,180,131,0.82)]" />
                        <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">
                          {t('projectsPanel.pluginBindingsTitle')}
                        </p>
                      </div>
                      {extensionEntries.length > 0 ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {extensionEntries.map((entry) => {
                            const checked = selectedManifest.pluginBindings.includes(entry.name)
                            return (
                              <label
                                className="flex items-start gap-3 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3"
                                key={entry.name}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(nextChecked) => void handlePluginBindingToggle(entry.name, Boolean(nextChecked))}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-stone-100">{entry.name}</p>
                                  <p className="mt-1 text-xs leading-5 text-stone-400/85">
                                    {entry.note || t('projectsPanel.pluginBindingFallback')}
                                  </p>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-4 text-sm text-stone-400/85">
                          {t('projectsPanel.noPluginsAvailable')}
                        </div>
                      )}
                    </div>

                    {catalog ? (
                      <div className="grid gap-3 sm:grid-cols-4">
                        <MetricChip label={t('nav.characters')} value={catalog.counts.characters ?? 0} />
                        <MetricChip label={t('nav.lorebooks')} value={catalog.counts.worlds ?? 0} />
                        <MetricChip label={t('nav.story')} value={catalog.counts.story ?? 0} />
                        <MetricChip label={t('nav.extensions')} value={catalog.counts.extensions ?? 0} />
                      </div>
                    ) : null}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-stone-100">{t('projectsPanel.emptySelection')}</p>
                    <p className="mt-2 text-xs leading-5 text-stone-400/80">{t('projectsPage.description')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ProjectEditorDialog
        draft={draft}
        extensionEntries={extensionEntries}
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) {
            setDraft(null)
          }
        }}
        onSave={handleSave}
      />

      <AlertDialog open={Boolean(pendingDeleteName)} onOpenChange={(open) => !open && setPendingDeleteName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projectsPanel.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteName ? t('projectsPanel.deleteConfirm', { name: pendingDeleteName }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteName) {
                  void handleDelete(pendingDeleteName)
                }
                setPendingDeleteName(null)
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

function ProjectEditorDialog({
  open,
  draft,
  extensionEntries,
  onOpenChange,
  onSave,
}: {
  open: boolean
  draft: ProjectDraft | null
  extensionEntries: WorkspaceCatalogEntry[]
  onOpenChange: (open: boolean) => void
  onSave: (draft: ProjectDraft) => void
}) {
  const { t } = useI18n()
  const [localDraft, setLocalDraft] = useState<ProjectDraft | null>(draft)

  useEffect(() => {
    setLocalDraft(draft)
  }, [draft])

  if (!localDraft) {
    return null
  }

  const togglePluginDraft = (pluginId: string, checked: boolean) => {
    setLocalDraft((current) => {
      if (!current) {
        return current
      }

      const nextBindings = new Set(current.pluginBindings)
      if (checked) {
        nextBindings.add(pluginId)
      } else {
        nextBindings.delete(pluginId)
      }

      return {
        ...current,
        pluginBindings: Array.from(nextBindings).sort((left, right) => left.localeCompare(right, 'zh-CN')),
      }
    })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-none rounded-sm border-[rgba(194,154,89,0.18)] bg-[rgba(17,13,10,0.98)] p-0 text-stone-100 sm:max-w-none"
        showCloseButton={false}
        style={{ width: 'min(980px, calc(100vw - 40px))', maxWidth: 'min(980px, calc(100vw - 40px))' }}
      >
        <DialogHeader className="border-b border-[rgba(194,154,89,0.12)] px-5 py-4">
          <DialogTitle>{localDraft.name || t('projectsPanel.createAction')}</DialogTitle>
          <DialogDescription>{t('projectsPanel.description')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>{t('projectsPanel.fields.name')}</FieldLabel>
              <FieldContent>
                <Input
                  onChange={(event) =>
                    setLocalDraft((current) => (current ? { ...current, name: event.target.value } : current))
                  }
                  placeholder={t('projectsPanel.placeholders.name')}
                  value={localDraft.name}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>{t('projectsPanel.fields.description')}</FieldLabel>
              <FieldContent>
                <Textarea
                  className="min-h-28 rounded-sm"
                  onChange={(event) =>
                    setLocalDraft((current) => (current ? { ...current, description: event.target.value } : current))
                  }
                  placeholder={t('projectsPanel.placeholders.description')}
                  value={localDraft.description}
                />
              </FieldContent>
            </Field>
            <div className="grid gap-4 xl:grid-cols-2">
              <Field>
                <FieldLabel>{t('projectsPanel.fields.theme')}</FieldLabel>
                <FieldContent>
                  <Input
                    onChange={(event) =>
                      setLocalDraft((current) => (current ? { ...current, themeName: event.target.value } : current))
                    }
                    placeholder={t('projectsPanel.placeholders.theme')}
                    value={localDraft.themeName}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t('projectsPanel.fields.characters')}</FieldLabel>
                <FieldContent>
                  <Input
                    onChange={(event) =>
                      setLocalDraft((current) =>
                        current ? { ...current, characterAvatars: splitCsv(event.target.value) } : current,
                      )
                    }
                    placeholder={t('projectsPanel.placeholders.characters')}
                    value={localDraft.characterAvatars.join(', ')}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t('projectsPanel.fields.lorebooks')}</FieldLabel>
                <FieldContent>
                  <Input
                    onChange={(event) =>
                      setLocalDraft((current) =>
                        current ? { ...current, lorebookNames: splitCsv(event.target.value) } : current,
                      )
                    }
                    placeholder={t('projectsPanel.placeholders.lorebooks')}
                    value={localDraft.lorebookNames.join(', ')}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t('projectsPanel.fields.storyAssets')}</FieldLabel>
                <FieldContent>
                  <Input
                    onChange={(event) =>
                      setLocalDraft((current) =>
                        current ? { ...current, storyAssetNames: splitCsv(event.target.value) } : current,
                      )
                    }
                    placeholder={t('projectsPanel.placeholders.storyAssets')}
                    value={localDraft.storyAssetNames.join(', ')}
                  />
                </FieldContent>
              </Field>
              <Field className="xl:col-span-2">
                <FieldLabel>{t('projectsPanel.fields.sessions')}</FieldLabel>
                <FieldContent>
                  <Input
                    onChange={(event) =>
                      setLocalDraft((current) =>
                        current ? { ...current, sessionNames: splitCsv(event.target.value) } : current,
                      )
                    }
                    placeholder={t('projectsPanel.placeholders.sessions')}
                    value={localDraft.sessionNames.join(', ')}
                  />
                </FieldContent>
              </Field>
            </div>

            <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(15,11,9,0.42)] p-4">
              <div className="flex items-center gap-2">
                <PaperclipIcon className="size-4 text-[rgba(212,180,131,0.82)]" />
                <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">
                  {t('projectsPanel.pluginBindingsTitle')}
                </p>
              </div>
              {extensionEntries.length > 0 ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {extensionEntries.map((entry) => {
                    const checked = localDraft.pluginBindings.includes(entry.name)
                    return (
                      <label
                        className="flex items-start gap-3 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-3"
                        key={entry.name}
                      >
                        <Checkbox checked={checked} onCheckedChange={(nextChecked) => togglePluginDraft(entry.name, Boolean(nextChecked))} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-stone-100">{entry.name}</p>
                          <p className="mt-1 text-xs leading-5 text-stone-400/85">
                            {entry.note || t('projectsPanel.pluginBindingFallback')}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-3 rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-4 text-sm text-stone-400/85">
                  {t('projectsPanel.noPluginsAvailable')}
                </div>
              )}
            </div>
          </FieldGroup>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.03)] px-5 py-4">
          <Button className="rounded-sm" onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t('common.cancel')}
          </Button>
          <Button className="rounded-sm" onClick={() => onSave(localDraft)} type="button">
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetricChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-[rgba(194,154,89,0.14)] bg-[rgba(15,11,9,0.42)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-stone-100">{value}</p>
    </div>
  )
}

function DetailBlock({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(15,11,9,0.42)] p-3">
      <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">{label}</p>
      <p className={`mt-2 text-sm leading-6 text-stone-100 ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {value.trim() || '--'}
      </p>
    </div>
  )
}

function toProjectDraft(manifest: ProjectManifestRecord): ProjectDraft {
  return {
    name: manifest.name,
    description: manifest.description,
    themeName: manifest.themeName,
    characterAvatars: manifest.characterAvatars,
    lorebookNames: manifest.lorebookNames,
    storyAssetNames: manifest.storyAssetNames,
    sessionNames: manifest.sessionNames,
    pluginBindings: manifest.pluginBindings,
  }
}

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
