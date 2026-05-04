import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenIcon, CheckIcon, DownloadIcon, PencilLineIcon, PlusIcon, RefreshCwIcon, ScrollTextIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import type { WorldStateSnapshotEntry } from '@yggdrasil/api-client'

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
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/lib/i18n'
import { formatDateTime } from '@/lib/formatters'
import {
  useDeleteLibraryDocumentMutation,
  useLibraryDocumentsQuery,
  useRebuildWorldStateSnapshotMutation,
  useSaveLibraryDocumentMutation,
  useSaveSettingsMutation,
  useWorkspaceBootstrapQuery,
  useWorldStateSnapshotQuery,
} from '@/features/workspace/hooks'
import { toast } from 'sonner'
import { parseLorebookImport } from '@/lib/library-import'
import { useStoredState } from '@/hooks/useStoredState'

import { LorebookEditor, type LorebookEntry } from './LorebookEditor'

const DOMAIN = 'worlds'

export function LorebookManagerPanel({
  avatarUrl,
  csrfToken,
  fileName,
  initialSelectedName,
}: {
  avatarUrl?: string
  csrfToken: string
  fileName?: string
  initialSelectedName?: string
}) {
  const { t } = useI18n()
  const workspaceQuery = useWorkspaceBootstrapQuery()
  const documentsQuery = useLibraryDocumentsQuery(DOMAIN)
  const saveMutation = useSaveLibraryDocumentMutation()
  const saveSettingsMutation = useSaveSettingsMutation()
  const deleteMutation = useDeleteLibraryDocumentMutation()
  const worldStateQuery = useWorldStateSnapshotQuery(avatarUrl, fileName, Boolean(avatarUrl) && Boolean(fileName))
  const rebuildWorldStateMutation = useRebuildWorldStateSnapshotMutation()
  const [open, setOpen] = useStoredState('st.panel.lorebooks.open', false)
  const [selectedName, setSelectedName] = useStoredState<string | null>('st.panel.lorebooks.selectedName', null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const documents = useMemo(
    () =>
      [...(documentsQuery.data ?? [])].sort(
        (left, right) =>
          (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || left.name.localeCompare(right.name, 'zh-CN'),
      ),
    [documentsQuery.data],
  )
  const worldStateSnapshot = worldStateQuery.data ?? null
  const settings = workspaceQuery.data?.settings?.settings ?? null
  const activeWorldNames = useMemo(
    () =>
      Array.isArray(settings?.world_names)
        ? settings.world_names.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
    [settings],
  )

  const syncWorldStateSnapshot = async (showErrorToast = false) => {
    if (!avatarUrl || !fileName) {
      return
    }

    try {
      await rebuildWorldStateMutation.mutateAsync({
        avatarUrl,
        fileName,
      })
    } catch (error) {
      if (showErrorToast) {
        toast.error(error instanceof Error ? error.message : t('lorebooksPanel.feedback.worldStateRebuildFailed'))
      }
      throw error
    }
  }

  useEffect(() => {
    if (documents.length === 0) {
      if (selectedName !== null) {
        setSelectedName(null)
      }
      return
    }

    if (!selectedName || !documents.some((document) => document.name === selectedName)) {
      setSelectedName(documents[0]?.name ?? null)
    }
  }, [documents, selectedName])

  useEffect(() => {
    if (initialSelectedName && documents.some((document) => document.name === initialSelectedName)) {
      setSelectedName(initialSelectedName)
    }
  }, [documents, initialSelectedName])

  const initialEntries = useMemo<LorebookEntry[]>(() => {
    const editingDocument = documents.find((document) => document.name === editingName) ?? null
    if (!editingDocument?.contentText) return []
    try {
      const parsed = JSON.parse(editingDocument.contentText) as LorebookEntry[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [documents, editingName])

  const handleCreate = () => {
    setEditingName(buildNextLorebookName(documents.map((document) => document.name), t('lorebooksPanel.defaultNameBase')))
    setOpen(true)
  }

  const handleEdit = (name: string) => {
    setEditingName(name)
    setOpen(true)
  }

  const handleSave = async ({
    entries,
    name,
  }: {
    entries: LorebookEntry[]
    name: string
  }) => {
    const nextName = name.trim()
    const previousName = editingName?.trim() ?? ''
    const isRename = previousName.length > 0 && previousName !== nextName
    const isCreate = previousName.length === 0

    if (!nextName) return

    if (isRename && documents.some((document) => document.name === nextName)) {
      toast.error(t('lorebooksPanel.feedback.duplicateName'))
      return
    }

    try {
      await saveMutation.mutateAsync({
        csrfToken,
        domain: DOMAIN,
        kind: 'world',
        name: nextName,
        tags: ['lorebook'],
        contentText: JSON.stringify(entries),
      })

      if (isRename) {
        await deleteMutation.mutateAsync({
          csrfToken,
          domain: DOMAIN,
          name: previousName,
        })

        if (settings) {
          const nextActiveWorlds = activeWorldNames.includes(previousName)
            ? activeWorldNames.map((item) => (item === previousName ? nextName : item))
            : activeWorldNames

          await saveSettingsMutation.mutateAsync({
            csrfToken,
            settings: {
              ...settings,
              world_names: Array.from(new Set(nextActiveWorlds)),
            },
          })
        }
      } else if (isCreate && settings) {
        await saveSettingsMutation.mutateAsync({
          csrfToken,
          settings: {
            ...settings,
            world_names: Array.from(new Set([...activeWorldNames, nextName])),
          },
        })
      }

      await syncWorldStateSnapshot()

      setSelectedName(nextName)
      setEditingName(nextName)
      setOpen(false)
      toast.success(t('lorebooksPanel.feedback.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('lorebooksPanel.feedback.saveFailed'))
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteMutation.mutateAsync({
        csrfToken,
        domain: DOMAIN,
        name,
      })
      if (selectedName === name) {
        setOpen(false)
        setSelectedName(null)
      }
      await syncWorldStateSnapshot()
      toast.success(t('lorebooksPanel.feedback.deleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('lorebooksPanel.feedback.deleteFailed'))
    }
  }

  const handleToggleActive = async (name: string, nextChecked: boolean) => {
    if (!settings) {
      toast.error(t('lorebooksPanel.feedback.selectionSaveFailed'))
      return
    }

    try {
      const nextWorldNames = nextChecked
        ? Array.from(new Set([...activeWorldNames, name]))
        : activeWorldNames.filter((item) => item !== name)

      await saveSettingsMutation.mutateAsync({
        csrfToken,
        settings: {
          ...settings,
          world_names: nextWorldNames,
        },
      })
      await syncWorldStateSnapshot()
      toast.success(
        nextChecked
          ? t('lorebooksPanel.feedback.activated', { name })
          : t('lorebooksPanel.feedback.deactivated', { name }),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('lorebooksPanel.feedback.selectionSaveFailed'))
    }
  }

  const handleImport = async (file: File) => {
    try {
      const parsed = parseLorebookImport(await file.text(), file.name)
      setSelectedName(parsed.name)
      await saveMutation.mutateAsync({
        csrfToken,
        domain: DOMAIN,
        kind: 'world',
        name: parsed.name,
        tags: ['lorebook'],
        contentText: JSON.stringify(parsed.entries),
      })
      if (settings) {
        await saveSettingsMutation.mutateAsync({
          csrfToken,
          settings: {
            ...settings,
            world_names: Array.from(new Set([...activeWorldNames, parsed.name])),
          },
        })
      }
      await syncWorldStateSnapshot()
      setSelectedName(parsed.name)
      toast.success(t('lorebooksPanel.feedback.imported'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('lorebooksPanel.feedback.importFailed'))
    }
  }

  const handleExport = async (name: string) => {
    try {
      const { exportLibraryDocument } = await import('@yggdrasil/api-client')
      const exportPath = await exportLibraryDocument({
        csrfToken,
        domain: DOMAIN,
        name,
      })
      toast.success(t('lorebooksPanel.feedback.exported', { path: exportPath }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('lorebooksPanel.feedback.exportFailed'))
    }
  }

  const handleRefreshWorldState = async () => {
    if (!avatarUrl || !fileName) {
      toast.error(t('lorebooksPanel.worldState.sessionRequired'))
      return
    }

    try {
      await syncWorldStateSnapshot(true)
      toast.success(t('lorebooksPanel.feedback.worldStateRebuilt'))
    } catch {
      // syncWorldStateSnapshot already reports the failure path to the user
    }
  }

  return (
    <>
      <Card className="h-full rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
        <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-stone-100">{t('nav.lorebooks')}</CardTitle>
              <CardDescription className="mt-1 text-xs text-stone-400/80">
                {t('lorebooksPanel.description')}
              </CardDescription>
              <p className="mt-2 text-xs text-stone-300/80">
                {activeWorldNames.length > 0
                  ? t('lorebooksPanel.activeSummary', { names: activeWorldNames.join(', ') })
                  : t('lorebooksPanel.activeSummaryEmpty')}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-[rgba(212,180,131,0.72)]">
                {fileName ? t('lorebooksPanel.worldState.boundSession', { name: fileName }) : t('lorebooksPanel.worldState.unboundSession')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                accept=".json"
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
              <Button className="gap-2 rounded-sm" onClick={() => importInputRef.current?.click()} size="sm" type="button" variant="outline">
                <UploadIcon className="size-4" />
                <span>{t('common.import')}</span>
              </Button>
              <Button className="gap-2 rounded-sm" onClick={handleCreate} size="sm" type="button">
                <PlusIcon className="size-4" />
                <span>{t('lorebooksPanel.createAction')}</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[calc(100%-76px)] min-h-0 p-0">
          <div className="border-b border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.03)] px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-stone-100">
                  <ScrollTextIcon className="size-4 text-[rgba(212,180,131,0.82)]" />
                  <span className="text-sm font-medium">{t('lorebooksPanel.worldState.title')}</span>
                </div>
                <p className="text-xs leading-5 text-stone-400/85">
                  {worldStateSnapshot?.summary || t('lorebooksPanel.worldState.emptyDescription')}
                </p>
              </div>
              <Button
                className="gap-2 rounded-sm"
                disabled={!avatarUrl || !fileName || rebuildWorldStateMutation.isPending}
                onClick={() => void handleRefreshWorldState()}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCwIcon className={`size-4 ${rebuildWorldStateMutation.isPending ? 'animate-spin' : ''}`} />
                <span>{t('lorebooksPanel.worldState.refresh')}</span>
              </Button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {buildWorldStateMetrics(worldStateSnapshot, t).map((metric) => (
                <div
                  className="rounded-sm border border-[rgba(194,154,89,0.14)] bg-[rgba(15,11,9,0.42)] px-3 py-2"
                  key={metric.label}
                >
                  <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">{metric.label}</p>
                  <p className="mt-1 text-sm font-semibold text-stone-100">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>
          {documents.length === 0 ? (
            <div className="p-4">
              <Empty className="rounded-sm border-[rgba(194,154,89,0.16)] bg-[rgba(255,245,222,0.02)]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookOpenIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('lorebooksPanel.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>{t('lorebooksPanel.emptyDescription')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-2 p-3">
                {documents.map((document) => {
                  const count = (() => {
                    try {
                      const parsed = JSON.parse(document.contentText ?? '[]') as unknown[]
                      return Array.isArray(parsed) ? parsed.length : 0
                    } catch {
                      return 0
                    }
                  })()

                      return (
                    <div
                      className={`flex items-center gap-3 rounded-sm border px-3 py-3 ${
                        document.name === selectedName
                          ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                          : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)]'
                      }`}
                      key={document.name}
                      onClick={() => setSelectedName(document.name)}
                    >
                      <div
                        className="flex shrink-0 items-center self-stretch"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={activeWorldNames.includes(document.name)}
                          onCheckedChange={(checked) => {
                            void handleToggleActive(document.name, Boolean(checked))
                          }}
                        />
                      </div>
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-[rgba(255,245,222,0.05)] text-stone-200">
                        <BookOpenIcon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <strong className="truncate text-sm font-medium text-stone-100">{document.name}</strong>
                          {activeWorldNames.includes(document.name) ? (
                            <Badge className="gap-1 rounded-sm" variant="outline">
                              <CheckIcon className="size-3" />
                              {t('lorebooksPanel.activeBadge')}
                            </Badge>
                          ) : null}
                          <Badge className="rounded-sm" variant="outline">
                            {count}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-stone-400/85">
                          {document.updatedAt ? formatDateTime(document.updatedAt) : t('common.unavailable')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleExport(document.name)
                          }}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <DownloadIcon className="size-4" />
                        </Button>
                        <Button
                          onClick={(event) => {
                            event.stopPropagation()
                            handleEdit(document.name)
                          }}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <PencilLineIcon className="size-4" />
                        </Button>
                        <Button
                          onClick={(event) => {
                            event.stopPropagation()
                            setPendingDeleteName(document.name)
                          }}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <LorebookEditor
        initialEntries={initialEntries}
        initialName={editingName ?? ''}
        onOpenChange={setOpen}
        onSave={(payload) => void handleSave(payload)}
        open={open}
      />

      <AlertDialog open={Boolean(pendingDeleteName)} onOpenChange={(nextOpen) => !nextOpen && setPendingDeleteName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('lorebooksPanel.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteName ? t('lorebooksPanel.deleteConfirm', { name: pendingDeleteName }) : ''}
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

function buildNextLorebookName(existingNames: string[], baseLabel: string) {
  const normalized = new Set(existingNames.map((item) => item.trim()))
  let count = existingNames.length + 1
  let candidate = `${baseLabel} ${count}`

  while (normalized.has(candidate)) {
    count += 1
    candidate = `${baseLabel} ${count}`
  }

  return candidate
}

function buildWorldStateMetrics(
  snapshot: WorldStateSnapshotEntry | null,
  t: ReturnType<typeof useI18n>['t'],
) {
  return [
    { label: t('lorebooksPanel.worldState.metrics.locations'), value: snapshot?.locations.length ?? 0 },
    { label: t('lorebooksPanel.worldState.metrics.factions'), value: snapshot?.factions.length ?? 0 },
    { label: t('lorebooksPanel.worldState.metrics.relationships'), value: snapshot?.relationships.length ?? 0 },
    { label: t('lorebooksPanel.worldState.metrics.quests'), value: snapshot?.quests.length ?? 0 },
    { label: t('lorebooksPanel.worldState.metrics.inventory'), value: snapshot?.inventoryItems.length ?? 0 },
    { label: t('lorebooksPanel.worldState.metrics.scenes'), value: snapshot?.sceneStates.length ?? 0 },
  ]
}
