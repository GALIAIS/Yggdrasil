import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenIcon, DownloadIcon, Link2Icon, PencilLineIcon, PlusIcon, ScrollTextIcon, Trash2Icon, UploadIcon } from 'lucide-react'

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useStoredState } from '@/hooks/useStoredState'
import { formatDateTime } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'
import { parseStoryImport } from '@/lib/library-import'
import { toast } from 'sonner'

import {
  STORY_DOMAIN,
  type StoryAssetKind,
  type StoryAssetPayload,
  type StoryAssetRecord,
  type StoryAssetStatus,
  useStoryAssetRecords,
  useStoryDeleteMutation,
  useStoryDocumentsQuery,
  useStorySaveMutation,
} from './hooks'

type StoryAssetDraft = StoryAssetPayload & {
  name: string
  kind: StoryAssetKind
}

const STORY_KINDS: StoryAssetKind[] = ['chapters', 'scenes', 'story_cards', 'plot_threads']
const STORY_STATUSES: StoryAssetStatus[] = ['idea', 'draft', 'active', 'paused', 'complete', 'archived']

export interface StoryBoardPanelProps {
  csrfToken: string
  initialSelectedKind?: string
  initialSelectedName?: string
  selectedCharacterAvatar?: string
  selectedChatId?: string
  onRestoreSession?: (avatar: string, fileId: string) => void
}

export function StoryBoardPanel({
  csrfToken,
  initialSelectedKind,
  initialSelectedName,
  selectedCharacterAvatar,
  selectedChatId,
  onRestoreSession,
}: StoryBoardPanelProps) {
  const { t } = useI18n()
  const documentsQuery = useStoryDocumentsQuery()
  const saveMutation = useStorySaveMutation()
  const deleteMutation = useStoryDeleteMutation()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [activeKind, setActiveKind] = useStoredState<StoryAssetKind>('st.panel.story.activeKind', 'scenes')
  const [selectedId, setSelectedId] = useStoredState<string | null>('st.panel.story.selectedId', null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [draft, setDraft] = useState<StoryAssetDraft | null>(null)

  const records = useStoryAssetRecords(documentsQuery.data)
  const initialKind = normalizeStoryKind(initialSelectedKind)

  useEffect(() => {
    if (initialKind) {
      setActiveKind(initialKind)
    }
  }, [initialKind, setActiveKind])

  const visibleRecords = useMemo(
    () => records.filter((record) => record.kind === activeKind),
    [activeKind, records],
  )

  useEffect(() => {
    if (initialKind && initialSelectedName) {
      const target = records.find((record) => record.kind === initialKind && record.name === initialSelectedName)
      if (target) {
        setSelectedId(target.id)
        return
      }
    }

    if (visibleRecords.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null)
      }
      return
    }

    if (!selectedId || !visibleRecords.some((record) => record.id === selectedId)) {
      setSelectedId(visibleRecords[0]?.id ?? null)
    }
  }, [initialKind, initialSelectedName, records, selectedId, setSelectedId, visibleRecords])

  const selectedRecord = records.find((record) => record.id === selectedId) ?? null
  const chapterOptions = useMemo(
    () => records.filter((record) => record.kind === 'chapters'),
    [records],
  )
  const sceneOptions = useMemo(
    () => records.filter((record) => record.kind === 'scenes'),
    [records],
  )

  const metricValues = useMemo(() => ({
    chapters: records.filter((record) => record.kind === 'chapters').length,
    scenes: records.filter((record) => record.kind === 'scenes').length,
    storyCards: records.filter((record) => record.kind === 'story_cards').length,
    plotThreads: records.filter((record) => record.kind === 'plot_threads').length,
  }), [records])

  const openCreate = (kind: StoryAssetKind = activeKind) => {
    const nextDraft = createDefaultDraft(kind, t('storyPanel.kinds.' + kind), visibleRecords.length + 1)
    setDraft(nextDraft)
    setEditorOpen(true)
  }

  const openEdit = (record: StoryAssetRecord) => {
    setDraft({
      name: record.name,
      kind: record.kind,
      ...record.payload,
    })
    setEditorOpen(true)
  }

  const handleSave = async (nextDraft: StoryAssetDraft) => {
    const name = nextDraft.name.trim()
    if (!name) {
      return
    }

    try {
      await saveMutation.mutateAsync({
        csrfToken,
        domain: STORY_DOMAIN,
        kind: nextDraft.kind,
        name,
        tags: nextDraft.tags,
        contentText: JSON.stringify({
          title: nextDraft.title.trim() || name,
          status: nextDraft.status,
          summary: nextDraft.summary,
          notes: nextDraft.notes,
          tags: nextDraft.tags,
          chapterId: nextDraft.chapterId || null,
          linkedSession: nextDraft.linkedSession ?? null,
          priority: nextDraft.priority || '',
          type: nextDraft.type || '',
          sceneIds: nextDraft.sceneIds ?? [],
        }),
      })
      setActiveKind(nextDraft.kind)
      setSelectedId(`${nextDraft.kind}:${name}`)
      setEditorOpen(false)
      setDraft(null)
      toast.success(t('storyPanel.feedback.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('storyPanel.feedback.saveFailed'))
    }
  }

  const handleDelete = async (record: StoryAssetRecord) => {
    try {
      await deleteMutation.mutateAsync({
        csrfToken,
        domain: STORY_DOMAIN,
        name: record.name,
      })
      if (selectedId === record.id) {
        setSelectedId(null)
      }
      toast.success(t('storyPanel.feedback.deleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('storyPanel.feedback.deleteFailed'))
    }
  }

  const handleExport = async (record: StoryAssetRecord) => {
    try {
      const { exportLibraryDocument } = await import('@yggdrasil/api-client')
      const path = await exportLibraryDocument({
        csrfToken,
        domain: STORY_DOMAIN,
        name: record.name,
      })
      toast.success(t('storyPanel.feedback.exported', { path }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('storyPanel.feedback.exportFailed'))
    }
  }

  const handleImport = async (file: File) => {
    try {
      const imported = parseStoryImport(await file.text(), file.name)
      await saveMutation.mutateAsync({
        csrfToken,
        domain: STORY_DOMAIN,
        kind: imported.kind,
        name: imported.name,
        tags: imported.tags,
        contentText: JSON.stringify(imported.payload),
      })
      setActiveKind(imported.kind)
      setSelectedId(`${imported.kind}:${imported.name}`)
      toast.success(t('storyPanel.feedback.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('storyPanel.feedback.saveFailed'))
    }
  }

  const handleBindCurrentSession = async (record: StoryAssetRecord) => {
    if (!selectedCharacterAvatar || !selectedChatId) {
      toast.error(t('storyPanel.noSessionAvailable'))
      return
    }

    try {
      await saveMutation.mutateAsync({
        csrfToken,
        domain: STORY_DOMAIN,
        kind: record.kind,
        name: record.name,
        tags: record.payload.tags,
        contentText: JSON.stringify({
          ...record.payload,
          linkedSession: {
            avatar: selectedCharacterAvatar,
            fileId: selectedChatId,
            fileName: selectedChatId,
          },
        }),
      })
      toast.success(t('storyPanel.feedback.boundSession'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('storyPanel.feedback.bindFailed'))
    }
  }

  const handleRestoreLinkedSession = (record: StoryAssetRecord) => {
    const avatar = record.payload.linkedSession?.avatar
    const fileId = record.payload.linkedSession?.fileId
    if (!avatar || !fileId) {
      toast.error(t('storyPanel.feedback.sessionMissing'))
      return
    }
    onRestoreSession?.(avatar, fileId)
  }

  return (
    <>
      <input
        accept="application/json,.json"
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
      <Card className="h-full rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
        <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-stone-100">{t('nav.story')}</CardTitle>
              <CardDescription className="mt-1 text-xs text-stone-400/80">
                {t('storyPanel.description')}
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-2 xl:flex xl:flex-wrap xl:items-center">
              <MetricChip label={t('storyPage.metrics.chapters')} value={metricValues.chapters} />
              <MetricChip label={t('storyPage.metrics.scenes')} value={metricValues.scenes} />
              <MetricChip label={t('storyPage.metrics.storyCards')} value={metricValues.storyCards} />
              <MetricChip label={t('storyPage.metrics.plotThreads')} value={metricValues.plotThreads} />
              <Button className="col-span-2 gap-2 rounded-sm xl:col-span-1" onClick={() => importInputRef.current?.click()} size="sm" type="button" variant="outline">
                <UploadIcon className="size-4" />
                <span>{t('common.import')}</span>
              </Button>
              <Button className="col-span-2 gap-2 rounded-sm xl:col-span-1" onClick={() => openCreate()} size="sm" type="button">
                <PlusIcon className="size-4" />
                <span>{t('storyPanel.createAction')}</span>
              </Button>
            </div>
          </div>
          <Tabs
            className="mt-4"
            value={activeKind}
            onValueChange={(value) => {
              const nextKind = normalizeStoryKind(value)
              if (nextKind) {
                setActiveKind(nextKind)
              }
            }}
          >
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-sm bg-[rgba(255,245,222,0.03)] p-1">
              {STORY_KINDS.map((kind) => (
                <TabsTrigger className="rounded-sm" key={kind} value={kind}>
                  {t(`storyPanel.kinds.${kind}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="h-[calc(100%-140px)] min-h-0 p-0">
          <div className="grid h-full min-h-0 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
            <div className="border-b border-[rgba(194,154,89,0.12)] xl:border-r xl:border-b-0">
              {visibleRecords.length === 0 ? (
                <div className="p-4">
                  <Empty className="rounded-sm border-[rgba(194,154,89,0.16)] bg-[rgba(255,245,222,0.02)]">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ScrollTextIcon />
                      </EmptyMedia>
                      <EmptyTitle>{t('storyPanel.emptyTitle')}</EmptyTitle>
                      <EmptyDescription>{t('storyPanel.emptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-2 p-3">
                    {visibleRecords.map((record) => (
                      <button
                        className={`rounded-sm border px-3 py-3 text-left transition-colors ${
                          record.id === selectedId
                            ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                            : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] hover:bg-[rgba(255,245,222,0.04)]'
                        }`}
                        key={record.id}
                        onClick={() => setSelectedId(record.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <strong className="truncate text-sm font-medium text-stone-100">{record.payload.title || record.name}</strong>
                              <Badge className="rounded-sm" variant="outline">
                                {t(`storyPanel.statuses.${record.payload.status}`)}
                              </Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-400/85">
                              {record.payload.summary || t('common.unconfigured')}
                            </p>
                            <p className="mt-2 text-[11px] leading-5 text-stone-500">
                              {record.document.updatedAt ? formatDateTime(record.document.updatedAt) : t('common.unavailable')}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="min-h-0">
              {selectedRecord ? (
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <BookOpenIcon className="size-4 text-[rgba(212,180,131,0.82)]" />
                          <h3 className="text-base font-semibold text-stone-100">{selectedRecord.payload.title || selectedRecord.name}</h3>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge className="rounded-sm" variant="outline">{t(`storyPanel.kinds.${selectedRecord.kind}`)}</Badge>
                          <Badge className="rounded-sm" variant="outline">{t(`storyPanel.statuses.${selectedRecord.payload.status}`)}</Badge>
                          {selectedRecord.payload.priority ? (
                            <Badge className="rounded-sm" variant="outline">{selectedRecord.payload.priority}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button className="gap-2 rounded-sm" onClick={() => openEdit(selectedRecord)} size="sm" type="button" variant="outline">
                          <PencilLineIcon className="size-4" />
                          <span>{t('storyPanel.editAction')}</span>
                        </Button>
                        {selectedRecord.kind === 'scenes' ? (
                          <>
                            <Button
                              className="gap-2 rounded-sm"
                              disabled={!selectedCharacterAvatar || !selectedChatId}
                              onClick={() => void handleBindCurrentSession(selectedRecord)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Link2Icon className="size-4" />
                              <span>{t('storyPanel.bindCurrentSession')}</span>
                            </Button>
                            <Button
                              className="gap-2 rounded-sm"
                              disabled={!selectedRecord.payload.linkedSession?.avatar || !selectedRecord.payload.linkedSession?.fileId}
                              onClick={() => handleRestoreLinkedSession(selectedRecord)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <BookOpenIcon className="size-4" />
                              <span>{t('storyPanel.restoreSession')}</span>
                            </Button>
                          </>
                        ) : null}
                        <Button className="gap-2 rounded-sm" onClick={() => void handleExport(selectedRecord)} size="sm" type="button" variant="outline">
                          <DownloadIcon className="size-4" />
                          <span>{t('storyPanel.exportAction')}</span>
                        </Button>
                        <Button className="rounded-sm" onClick={() => setPendingDeleteId(selectedRecord.id)} size="icon-sm" type="button" variant="ghost">
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <DetailBlock label={t('storyPanel.fields.summary')} value={selectedRecord.payload.summary} />
                      <DetailBlock
                        label={t('storyPanel.fields.chapter')}
                        value={resolveChapterLabel(selectedRecord, records, t('storyPanel.placeholders.noChapter'))}
                      />
                      <DetailBlock
                        label={t('storyPanel.fields.linkedSession')}
                        value={resolveLinkedSessionLabel(selectedRecord, t)}
                      />
                      <DetailBlock
                        label={t('storyPanel.fields.sceneLinks')}
                        value={resolveSceneLinksLabel(selectedRecord, sceneOptions)}
                      />
                    </div>

                    <DetailBlock label={t('storyPanel.fields.notes')} multiline value={selectedRecord.payload.notes} />

                    <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(15,11,9,0.42)] p-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">{t('storyPanel.fields.tags')}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedRecord.payload.tags.length > 0 ? selectedRecord.payload.tags.map((tag) => (
                          <Badge className="rounded-sm" key={tag} variant="outline">{tag}</Badge>
                        )) : (
                          <span className="text-sm text-stone-500">{t('common.unconfigured')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-stone-100">{t('storyPanel.emptySelection')}</p>
                    <p className="mt-2 text-xs leading-5 text-stone-400/80">{t('storyPage.description')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <StoryAssetEditorDialog
        chapterOptions={chapterOptions}
        draft={draft}
        onOpenChange={(nextOpen) => {
          setEditorOpen(nextOpen)
          if (!nextOpen) {
            setDraft(null)
          }
        }}
        onSave={handleSave}
        open={editorOpen}
        sceneOptions={sceneOptions}
      />

      <AlertDialog open={Boolean(pendingDeleteId)} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('storyPanel.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRecord && pendingDeleteId === selectedRecord.id
                ? t('storyPanel.deleteConfirm', { name: selectedRecord.payload.title || selectedRecord.name })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const record = records.find((item) => item.id === pendingDeleteId)
                if (record) {
                  void handleDelete(record)
                }
                setPendingDeleteId(null)
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

function StoryAssetEditorDialog({
  open,
  draft,
  chapterOptions,
  sceneOptions,
  onOpenChange,
  onSave,
}: {
  open: boolean
  draft: StoryAssetDraft | null
  chapterOptions: StoryAssetRecord[]
  sceneOptions: StoryAssetRecord[]
  onOpenChange: (open: boolean) => void
  onSave: (draft: StoryAssetDraft) => void
}) {
  const { t } = useI18n()
  const [localDraft, setLocalDraft] = useState<StoryAssetDraft | null>(draft)

  useEffect(() => {
    setLocalDraft(draft)
  }, [draft])

  if (!localDraft) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-none rounded-sm border-[rgba(194,154,89,0.18)] bg-[rgba(17,13,10,0.98)] p-0 text-stone-100 sm:max-w-none"
        showCloseButton={false}
        style={{ width: 'min(980px, calc(100vw - 40px))', maxWidth: 'min(980px, calc(100vw - 40px))' }}
      >
        <DialogHeader className="border-b border-[rgba(194,154,89,0.12)] px-5 py-4">
          <DialogTitle>{localDraft.title?.trim() ? localDraft.title : t('storyPanel.createAction')}</DialogTitle>
          <DialogDescription>{t('storyPanel.description')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <FieldGroup className="gap-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Field>
                <FieldLabel>{t('storyPanel.fields.title')}</FieldLabel>
                <FieldContent>
                  <Input
                    value={localDraft.name}
                    onChange={(event) => setLocalDraft((current) => current ? { ...current, name: event.target.value, title: event.target.value } : current)}
                    placeholder={t('storyPanel.placeholders.title')}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t('storyPanel.fields.kind')}</FieldLabel>
                <FieldContent>
                  <Select
                    value={localDraft.kind}
                    onValueChange={(value) => {
                      const nextKind = normalizeStoryKind(value)
                      if (nextKind) {
                        setLocalDraft((current) => current ? { ...current, kind: nextKind } : current)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORY_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>{t(`storyPanel.kinds.${kind}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Field>
                <FieldLabel>{t('storyPanel.fields.status')}</FieldLabel>
                <FieldContent>
                  <Select
                    value={localDraft.status}
                    onValueChange={(value) => {
                      if (isStoryStatus(value)) {
                        setLocalDraft((current) => current ? { ...current, status: value } : current)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORY_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>{t(`storyPanel.statuses.${status}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t('storyPanel.fields.chapter')}</FieldLabel>
                <FieldContent>
                  <Select
                    value={localDraft.chapterId || '__none__'}
                    onValueChange={(value) => setLocalDraft((current) => current ? { ...current, chapterId: value === '__none__' ? null : value } : current)}
                  >
                    <SelectTrigger className="w-full rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('storyPanel.placeholders.noChapter')}</SelectItem>
                      {chapterOptions.map((record) => (
                        <SelectItem key={record.id} value={record.name}>{record.payload.title || record.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t(localDraft.kind === 'story_cards' ? 'storyPanel.fields.type' : 'storyPanel.fields.priority')}</FieldLabel>
                <FieldContent>
                  <Input
                    value={localDraft.kind === 'story_cards' ? (localDraft.type ?? '') : (localDraft.priority ?? '')}
                    onChange={(event) =>
                      setLocalDraft((current) =>
                        current
                          ? {
                              ...current,
                              ...(current.kind === 'story_cards'
                                ? { type: event.target.value }
                                : { priority: event.target.value }),
                            }
                          : current,
                      )
                    }
                    placeholder={t(localDraft.kind === 'story_cards' ? 'storyPanel.placeholders.type' : 'storyPanel.placeholders.priority')}
                  />
                </FieldContent>
              </Field>
            </div>

            <Field>
              <FieldLabel>{t('storyPanel.fields.summary')}</FieldLabel>
              <FieldContent>
                <Textarea
                  className="min-h-28 rounded-sm"
                  value={localDraft.summary}
                  onChange={(event) => setLocalDraft((current) => current ? { ...current, summary: event.target.value } : current)}
                  placeholder={t('storyPanel.placeholders.summary')}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>{t('storyPanel.fields.notes')}</FieldLabel>
              <FieldContent>
                <Textarea
                  className="min-h-40 rounded-sm"
                  value={localDraft.notes}
                  onChange={(event) => setLocalDraft((current) => current ? { ...current, notes: event.target.value } : current)}
                  placeholder={t('storyPanel.placeholders.notes')}
                />
              </FieldContent>
            </Field>

            <div className="grid gap-4 xl:grid-cols-2">
              <Field>
                <FieldLabel>{t('storyPanel.fields.tags')}</FieldLabel>
                <FieldContent>
                  <Input
                    value={localDraft.tags.join(', ')}
                    onChange={(event) => setLocalDraft((current) => current ? { ...current, tags: splitCsv(event.target.value) } : current)}
                    placeholder={t('storyPanel.placeholders.tags')}
                  />
                </FieldContent>
              </Field>
              {localDraft.kind === 'chapters' ? (
                <Field>
                  <FieldLabel>{t('storyPanel.fields.sceneLinks')}</FieldLabel>
                  <FieldContent>
                    <Input
                      value={localDraft.sceneIds?.join(', ') ?? ''}
                      onChange={(event) => setLocalDraft((current) => current ? { ...current, sceneIds: splitCsv(event.target.value) } : current)}
                      placeholder={sceneOptions.map((record) => record.name).slice(0, 3).join(', ')}
                    />
                  </FieldContent>
                </Field>
              ) : null}
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

function DetailBlock({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(15,11,9,0.42)] p-3">
      <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">{label}</p>
      <p className={`mt-2 text-sm leading-6 text-stone-100 ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {value.trim() || '--'}
      </p>
    </div>
  )
}

function createDefaultDraft(kind: StoryAssetKind, label: string, count: number): StoryAssetDraft {
  return {
    name: `${label} ${count}`,
    kind,
    title: `${label} ${count}`,
    status: kind === 'plot_threads' ? 'idea' : 'draft',
    summary: '',
    notes: '',
    tags: [],
    chapterId: null,
    linkedSession: null,
    priority: '',
    type: '',
    sceneIds: [],
  }
}

function resolveChapterLabel(record: StoryAssetRecord, records: StoryAssetRecord[], fallback: string) {
  if (!record.payload.chapterId) {
    return fallback
  }

  const chapter = records.find((item) => item.kind === 'chapters' && item.name === record.payload.chapterId)
  return chapter?.payload.title || chapter?.name || record.payload.chapterId
}

function resolveLinkedSessionLabel(record: StoryAssetRecord, t: ReturnType<typeof useI18n>['t']) {
  const linkedSession = record.payload.linkedSession
  if (!linkedSession?.fileId) {
    return t('storyPanel.unboundSession')
  }

  return t('storyPanel.boundSession', {
    name: linkedSession.fileName || linkedSession.fileId,
  })
}

function resolveSceneLinksLabel(record: StoryAssetRecord, scenes: StoryAssetRecord[]) {
  const sceneIds = record.payload.sceneIds ?? []
  if (sceneIds.length === 0) {
    return '--'
  }

  return sceneIds
    .map((sceneId) => scenes.find((item) => item.name === sceneId)?.payload.title || sceneId)
    .join(', ')
}

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeStoryKind(value: unknown): StoryAssetKind | null {
  return STORY_KINDS.find((kind) => kind === value) ?? null
}

function isStoryStatus(value: string): value is StoryAssetStatus {
  return STORY_STATUSES.includes(value as StoryAssetStatus)
}
