import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import { WorkspaceEditorDialog } from '@/components/ui/workspace-editor-dialog'

export interface GroupEditorValue {
  contentText: string
  kind: 'group' | 'group-chat'
  name: string
  tags: string[]
}

export interface GroupEditorDialogProps {
  initialValue?: GroupEditorValue | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (value: GroupEditorValue) => void
}

function createEmptyValue(): GroupEditorValue {
  return {
    name: '',
    kind: 'group',
    tags: [],
    contentText: JSON.stringify(
      {
        summary: '',
        members: [],
        notes: '',
      },
      null,
      2,
    ),
  }
}

export function GroupEditorDialog({
  initialValue,
  open,
  onOpenChange,
  onSave,
}: GroupEditorDialogProps) {
  const { t } = useI18n()
  const [formValue, setFormValue] = useState<GroupEditorValue>(createEmptyValue())

  useEffect(() => {
    if (!open) return
    setFormValue(initialValue ?? createEmptyValue())
  }, [initialValue, open])

  return (
    <WorkspaceEditorDialog
      bodyClassName="max-h-[72vh] overflow-y-auto"
      description={t('groupEditor.description')}
      footer={(
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(formValue)
              onOpenChange(false)
            }}
            disabled={!formValue.name.trim()}
          >
            {t('common.save')}
          </Button>
        </>
      )}
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton
      style={{ width: 'min(980px, calc(100vw - 40px))', maxWidth: 'min(980px, calc(100vw - 40px))' }}
      title={initialValue ? t('groupEditor.editTitle') : t('groupEditor.createTitle')}
    >
      <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="group-name">{t('groupEditor.fields.name')}</Label>
            <Input
              id="group-name"
              value={formValue.name}
              onChange={(event) => setFormValue((current) => ({ ...current, name: event.target.value }))}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t('groupEditor.fields.kind')}</Label>
            <Select
              value={formValue.kind}
              onValueChange={(value) => setFormValue((current) => ({ ...current, kind: value as GroupEditorValue['kind'] }))}
            >
              <SelectTrigger className="rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">{t('groupsPanel.labels.group')}</SelectItem>
                <SelectItem value="group-chat">{t('groupsPanel.labels.groupChat')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="group-tags">{t('groupEditor.fields.tags')}</Label>
            <Input
              id="group-tags"
              placeholder={t('groupEditor.placeholders.tags')}
              value={formValue.tags.join(', ')}
              onChange={(event) =>
                setFormValue((current) => ({
                  ...current,
                  tags: event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0),
                }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="group-content">{t('groupEditor.fields.content')}</Label>
            <Textarea
              id="group-content"
              className="min-h-[320px] font-mono text-xs"
              value={formValue.contentText}
              onChange={(event) => setFormValue((current) => ({ ...current, contentText: event.target.value }))}
            />
          </div>
      </div>
    </WorkspaceEditorDialog>
  )
}
