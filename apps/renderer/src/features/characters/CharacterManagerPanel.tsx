import { useEffect, useMemo, useState } from 'react'
import { PencilLineIcon, PlusIcon, Trash2Icon, UserRoundIcon } from 'lucide-react'
import { clearTauriAvatarSrcCache, type CharacterSummary } from '@yggdrasil/api-client'

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
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceAvatar } from '@/components/workspace/WorkspaceAvatar'
import { useDeleteCharacterMutation, useSaveCharacterMutation } from '@/features/workspace/hooks'
import { getCharacterName, getCharacterSummary } from '@/lib/character'
import { useI18n } from '@/lib/i18n'
import { toast } from 'sonner'

import {
  CharacterEditDialog,
  type CharacterFormData,
  type CharacterSummary as EditableCharacterSummary,
} from './CharacterEditDialog'

interface CharacterManagerPanelProps {
  characters: CharacterSummary[]
  csrfToken: string
  onHighlightCharacter: (avatar: string) => void
  onSelectCharacter: (avatar: string) => void
  selectedAvatar: string
}

export function CharacterManagerPanel({
  characters,
  csrfToken,
  onHighlightCharacter,
  onSelectCharacter,
  selectedAvatar,
}: CharacterManagerPanelProps) {
  const { t } = useI18n()
  const saveCharacterMutation = useSaveCharacterMutation()
  const deleteCharacterMutation = useDeleteCharacterMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<EditableCharacterSummary | null>(null)
  const [pendingDeleteCharacter, setPendingDeleteCharacter] = useState<CharacterSummary | null>(null)

  const sortedCharacters = useMemo(
    () =>
      [...characters].sort((left, right) => {
        const leftStamp = typeof left.date_last_chat === 'number' ? left.date_last_chat : 0
        const rightStamp = typeof right.date_last_chat === 'number' ? right.date_last_chat : 0
        return rightStamp - leftStamp || getCharacterName(left).localeCompare(getCharacterName(right), 'zh-CN')
      }),
    [characters],
  )

  useEffect(() => {
    if (sortedCharacters.length === 0) {
      return
    }

    if (!sortedCharacters.some((character) => String(character.avatar ?? '') === selectedAvatar)) {
      const fallbackAvatar = String(sortedCharacters[0]?.avatar ?? '')
      if (fallbackAvatar) {
        onSelectCharacter(fallbackAvatar)
      }
    }
  }, [onSelectCharacter, selectedAvatar, sortedCharacters])

  const openCreateDialog = () => {
    setEditingCharacter(null)
    setDialogOpen(true)
  }

  const openEditDialog = (character: CharacterSummary) => {
    setEditingCharacter({
      id: String(character.avatar ?? ''),
      name: typeof character.name === 'string' ? character.name : '',
      description: typeof character.description === 'string' ? character.description : '',
      personality: typeof character.personality === 'string' ? character.personality : '',
      scenario: typeof character.scenario === 'string' ? character.scenario : '',
      first_mes: typeof character.first_mes === 'string' ? character.first_mes : '',
      mes_example: typeof character.mes_example === 'string' ? character.mes_example : '',
      system_prompt: typeof character.system_prompt === 'string' ? character.system_prompt : '',
      post_history_instructions:
        typeof character.post_history_instructions === 'string' ? character.post_history_instructions : '',
      alternate_greetings: Array.isArray(character.alternate_greetings)
        ? character.alternate_greetings.filter((item): item is string => typeof item === 'string')
        : [],
      avatar_url: typeof character.avatar === 'string' ? character.avatar : undefined,
    })
    setDialogOpen(true)
  }

  const handleSave = async (data: CharacterFormData) => {
    try {
      const saved = await saveCharacterMutation.mutateAsync({
        avatar: editingCharacter?.id || undefined,
        avatar_data_url: data.avatar_data_url,
        csrfToken,
        description: data.description,
        first_mes: data.first_mes,
        mes_example: data.mes_example,
        name: data.name,
        personality: data.personality,
        post_history_instructions: data.post_history_instructions,
        scenario: data.scenario,
        system_prompt: data.system_prompt,
        alternate_greetings: data.alternate_greetings,
      })
      clearTauriAvatarSrcCache(editingCharacter?.id)
      clearTauriAvatarSrcCache(String(saved.avatar ?? ''))
      onHighlightCharacter(String(saved.avatar ?? ''))
      toast.success(editingCharacter ? t('charactersPanel.feedback.updated') : t('charactersPanel.feedback.created'))
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('charactersPanel.feedback.saveFailed'))
      return false
    }
  }

  const handleDelete = async (character: CharacterSummary) => {
    const avatar = typeof character.avatar === 'string' ? character.avatar : ''
    if (!avatar) {
      return
    }

    try {
      await deleteCharacterMutation.mutateAsync({
        avatar,
        csrfToken,
      })
      clearTauriAvatarSrcCache(avatar)
      if (avatar === selectedAvatar) {
        const fallbackAvatar = String(
          sortedCharacters.find((item) => String(item.avatar ?? '') !== avatar)?.avatar ?? '',
        )
        if (fallbackAvatar) {
          onSelectCharacter(fallbackAvatar)
        }
      }
      toast.success(t('charactersPanel.feedback.deleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('charactersPanel.feedback.deleteFailed'))
    }
  }

  return (
    <>
      <Card className="h-full rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
        <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-stone-100">{t('nav.characters')}</CardTitle>
              <CardDescription className="mt-1 text-xs text-stone-400/80">
                {t('charactersPanel.description')}
              </CardDescription>
            </div>
            <Button
              className="gap-2 rounded-sm"
              onClick={openCreateDialog}
              size="sm"
              type="button"
            >
              <PlusIcon className="size-4" />
              <span>{t('characterEditor.createAction')}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="h-[calc(100%-76px)] min-h-0 p-0">
          {sortedCharacters.length === 0 ? (
            <div className="p-4">
              <Empty className="rounded-sm border-[rgba(194,154,89,0.16)] bg-[rgba(255,245,222,0.02)]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserRoundIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('charactersPanel.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>{t('charactersPanel.emptyDescription')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-2 p-3">
                {sortedCharacters.map((character) => {
                  const avatar = typeof character.avatar === 'string' ? character.avatar : ''
                  const selected = avatar === selectedAvatar
                  const name = getCharacterName(character)

                  return (
                    <div
                      className={`flex items-center gap-3 rounded-sm border px-3 py-3 ${
                        selected
                          ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                          : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)]'
                      }`}
                      key={avatar || name}
                    >
                      <WorkspaceAvatar
                        avatar={avatar}
                        className="rounded-sm"
                        fallbackClassName="rounded-sm"
                        name={name}
                        size="lg"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <strong className="truncate text-sm font-medium text-stone-100">{name}</strong>
                          <Badge className="rounded-sm" variant="outline">
                            {character.chat_size ?? 0}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-400/85">
                          {getCharacterSummary(character)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          onClick={() => onSelectCharacter(avatar)}
                          size="sm"
                          type="button"
                          variant={selected ? 'secondary' : 'outline'}
                        >
                          {selected ? t('charactersPanel.currentAction') : t('charactersPanel.enterAction')}
                        </Button>
                        <Button
                          onClick={() => openEditDialog(character)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <PencilLineIcon className="size-4" />
                        </Button>
                        <Button
                          onClick={() => setPendingDeleteCharacter(character)}
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

      <CharacterEditDialog
        character={editingCharacter}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        open={dialogOpen}
      />

      <AlertDialog open={Boolean(pendingDeleteCharacter)} onOpenChange={(open) => !open && setPendingDeleteCharacter(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('charactersPanel.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteCharacter
                ? t('charactersPanel.deleteConfirm', { name: getCharacterName(pendingDeleteCharacter) })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteCharacter) {
                  void handleDelete(pendingDeleteCharacter)
                }
                setPendingDeleteCharacter(null)
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
