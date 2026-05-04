import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Save, Copy, XIcon } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export interface PresetData {
  id?: string
  name: string
  temperature: number
  top_p: number
  top_k: number
  repetition_penalty: number
  max_tokens: number
  system_prompt: string
  instruct_template: string
}

interface PresetEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (preset: PresetData) => void
  onSaveAs?: (preset: PresetData) => void
  preset?: PresetData | null
}

function createEmptyPreset(): PresetData {
  return {
    name: '',
    temperature: 1,
    top_p: 1,
    top_k: 40,
    repetition_penalty: 1,
    max_tokens: 2048,
    system_prompt: '',
    instruct_template: '',
  }
}

export const PresetEditor: React.FC<PresetEditorProps> = ({
  open,
  onOpenChange,
  onSave,
  onSaveAs,
  preset,
}) => {
  const { t } = useI18n()
  const isEditMode = !!preset?.id
  const [formData, setFormData] = useState<PresetData>(() => preset ?? createEmptyPreset())
  const presetKey = preset
    ? JSON.stringify([
        preset.id ?? '',
        preset.name,
        preset.temperature,
        preset.top_p,
        preset.top_k,
        preset.repetition_penalty,
        preset.max_tokens,
        preset.system_prompt,
        preset.instruct_template,
      ])
    : '__empty_preset__'

  useEffect(() => {
    if (!open) {
      return
    }

    setFormData(preset ?? createEmptyPreset())
  }, [open, presetKey, preset])

  const handleInputChange = (
    field: keyof Omit<PresetData, 'id' | 'temperature' | 'top_p' | 'top_k' | 'repetition_penalty' | 'max_tokens'>,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSliderChange = (
    field: 'temperature' | 'top_p' | 'top_k' | 'repetition_penalty' | 'max_tokens',
    value: number[]
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value[0],
    }))
  }

  const handleSave = () => {
    onSave(formData)
    onOpenChange(false)
  }

  const handleSaveAs = () => {
    if (onSaveAs) {
      onSaveAs(formData)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ref-library-dialog ref-editor-dialog max-w-none overflow-hidden p-0 sm:max-w-none"
        showCloseButton={false}
        style={{
          width: 'min(1460px, calc(100vw - 40px))',
          maxWidth: 'min(1460px, calc(100vw - 40px))',
          height: 'min(84vh, 940px)',
        }}
      >
        <div className="ref-library-dialog-head">
          <div>
            <DialogTitle>
            {isEditMode ? t('presetEditor.editTitle') : t('presetEditor.createTitle')}
            </DialogTitle>
            <DialogDescription>
            {isEditMode
              ? t('presetEditor.editDescription')
              : t('presetEditor.createDescription')}
            </DialogDescription>
          </div>
          <Button
            aria-label={t('common.close')}
            className="ref-library-dialog-close"
            onClick={() => onOpenChange(false)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>

        <div className="ref-library-dialog-body">
          <div className="ref-editor-dialog-scroll">
            <div className="grid h-full min-h-0 gap-6 [grid-template-columns:minmax(0,1fr)_420px] max-[1280px]:[grid-template-columns:minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">{t('presetEditor.fields.name')} *</Label>
                <Input
                  id="name"
                  placeholder={t('presetEditor.placeholders.name')}
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="system_prompt">{t('presetEditor.fields.systemPrompt')}</Label>
                <Textarea
                  id="system_prompt"
                  className="min-h-[220px] resize-y"
                  placeholder={t('presetEditor.placeholders.systemPrompt')}
                  value={formData.system_prompt}
                  onChange={(e) => handleInputChange('system_prompt', e.target.value)}
                  rows={10}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instruct_template">{t('presetEditor.fields.instructTemplate')}</Label>
                <Textarea
                  id="instruct_template"
                  className="min-h-[220px] resize-y"
                  placeholder={t('presetEditor.placeholders.instructTemplate')}
                  value={formData.instruct_template}
                  onChange={(e) =>
                    handleInputChange('instruct_template', e.target.value)
                  }
                  rows={10}
                />
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <PresetSliderField
                help={t('presetEditor.help.temperature')}
                id="temperature"
                label={t('presetEditor.fields.temperature')}
                value={formData.temperature.toFixed(2)}
              >
                <Slider
                  id="temperature"
                  min={0}
                  max={2}
                  step={0.01}
                  value={[formData.temperature]}
                  onValueChange={(value) => handleSliderChange('temperature', value)}
                  className="w-full"
                />
              </PresetSliderField>

              <PresetSliderField
                help={t('presetEditor.help.topP')}
                id="top_p"
                label={t('presetEditor.fields.topP')}
                value={formData.top_p.toFixed(3)}
              >
                <Slider
                  id="top_p"
                  min={0}
                  max={1}
                  step={0.01}
                  value={[formData.top_p]}
                  onValueChange={(value) => handleSliderChange('top_p', value)}
                  className="w-full"
                />
              </PresetSliderField>

              <PresetSliderField
                help={t('presetEditor.help.topK')}
                id="top_k"
                label={t('presetEditor.fields.topK')}
                value={String(formData.top_k)}
              >
                <Slider
                  id="top_k"
                  min={0}
                  max={100}
                  step={1}
                  value={[formData.top_k]}
                  onValueChange={(value) => handleSliderChange('top_k', value)}
                  className="w-full"
                />
              </PresetSliderField>

              <PresetSliderField
                help={t('presetEditor.help.repetitionPenalty')}
                id="repetition_penalty"
                label={t('presetEditor.fields.repetitionPenalty')}
                value={formData.repetition_penalty.toFixed(2)}
              >
                <Slider
                  id="repetition_penalty"
                  min={0.5}
                  max={2}
                  step={0.01}
                  value={[formData.repetition_penalty]}
                  onValueChange={(value) =>
                    handleSliderChange('repetition_penalty', value)
                  }
                  className="w-full"
                />
              </PresetSliderField>

              <PresetSliderField
                help={t('presetEditor.help.maxTokens')}
                id="max_tokens"
                label={t('presetEditor.fields.maxTokens')}
                value={String(formData.max_tokens)}
              >
                <Slider
                  id="max_tokens"
                  min={64}
                  max={4096}
                  step={64}
                  value={[formData.max_tokens]}
                  onValueChange={(value) =>
                    handleSliderChange('max_tokens', value)
                  }
                  className="w-full"
                />
              </PresetSliderField>
            </div>
            </div>
          </div>
        </div>

        <DialogFooter className="ref-editor-dialog-footer gap-2">
          {onSaveAs && (
            <Button
              variant="outline"
              onClick={handleSaveAs}
              className="gap-2"
              disabled={!formData.name.trim()}
            >
              <Copy className="h-4 w-4" />
              {t('presetEditor.saveAs')}
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={!formData.name.trim()}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isEditMode ? t('presetEditor.saveChanges') : t('presetEditor.createAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PresetSliderField({
  children,
  help,
  id,
  label,
  value,
}: {
  children: React.ReactNode
  help: string
  id: string
  label: string
  value: string
}) {
  return (
    <div className="space-y-3 rounded-sm border border-[rgba(120,92,55,0.24)] bg-[rgba(255,245,222,0.02)] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="rounded-sm border border-[rgba(120,92,55,0.24)] bg-[rgba(255,245,222,0.04)] px-2 py-1 font-mono text-sm">
          {value}
        </span>
      </div>
      {children}
      <p className="text-xs text-gray-600">
        {help}
      </p>
    </div>
  )
}
