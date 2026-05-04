import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus, X, Image as ImageIcon } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { getAvatarSrc } from '@/lib/formatters'
import { isTauriDesktop, resolveTauriAvatarSrc } from '@yggdrasil/api-client'
import { Slider } from '@/components/ui/slider'
import { WorkspaceEditorDialog } from '@/components/ui/workspace-editor-dialog'

export interface CharacterFormData {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  system_prompt: string
  post_history_instructions: string
  alternate_greetings: string[]
  avatar_data_url?: string
}

export interface CharacterSummary {
  id: string
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  system_prompt: string
  post_history_instructions: string
  alternate_greetings: string[]
  avatar_url?: string
}

interface CharacterEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  character?: CharacterSummary | null
  onSave: (data: CharacterFormData) => Promise<boolean> | boolean
}

function createEmptyCharacterForm(): CharacterFormData {
  return {
    name: '',
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    avatar_data_url: undefined,
  }
}

export const CharacterEditDialog: React.FC<CharacterEditDialogProps> = ({
  open,
  onOpenChange,
  character,
  onSave,
}) => {
  const { t } = useI18n()
  const isEditMode = !!character
  const [formData, setFormData] = useState<CharacterFormData>(() => createEmptyCharacterForm())
  const [avatarPreview, setAvatarPreview] = useState<string>('')
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarSourceUrl, setAvatarSourceUrl] = useState<string | null>(null)
  const [avatarZoom, setAvatarZoom] = useState(1)
  const [avatarOffsetX, setAvatarOffsetX] = useState(0)
  const [avatarOffsetY, setAvatarOffsetY] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewObjectUrlRef = useRef<string | null>(null)
  const sourceObjectUrlRef = useRef<string | null>(null)
  const characterKey = character
    ? JSON.stringify([
        character.id,
        character.name,
        character.description,
        character.personality,
        character.scenario,
        character.first_mes,
        character.mes_example,
        character.system_prompt,
        character.post_history_instructions,
        character.alternate_greetings,
        character.avatar_url,
      ])
    : '__empty_character__'

  const clearPreviewObjectUrl = () => {
    if (!previewObjectUrlRef.current) {
      return
    }

    URL.revokeObjectURL(previewObjectUrlRef.current)
    previewObjectUrlRef.current = null
  }

  const clearSourceObjectUrl = () => {
    if (!sourceObjectUrlRef.current) {
      return
    }

    URL.revokeObjectURL(sourceObjectUrlRef.current)
    sourceObjectUrlRef.current = null
  }

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    const setResolvedAvatarPreview = async (avatar: string) => {
      clearPreviewObjectUrl()

      if (!avatar) {
        if (!cancelled) {
          clearSourceObjectUrl()
          setAvatarSourceUrl(null)
          setAvatarZoom(1)
          setAvatarOffsetX(0)
          setAvatarOffsetY(0)
          setAvatarPreview('')
          setAvatarPreviewFailed(false)
        }
        return
      }

      if (!isTauriDesktop()) {
        if (!cancelled) {
          clearSourceObjectUrl()
          setAvatarSourceUrl(null)
          setAvatarZoom(1)
          setAvatarOffsetX(0)
          setAvatarOffsetY(0)
          setAvatarPreview(getAvatarSrc(avatar))
          setAvatarPreviewFailed(false)
        }
        return
      }

      try {
        const nextSrc = await resolveTauriAvatarSrc(avatar)
        if (!cancelled) {
          clearSourceObjectUrl()
          setAvatarSourceUrl(null)
          setAvatarZoom(1)
          setAvatarOffsetX(0)
          setAvatarOffsetY(0)
          setAvatarPreview(nextSrc)
          setAvatarPreviewFailed(false)
        }
      } catch {
        if (!cancelled) {
          clearSourceObjectUrl()
          setAvatarSourceUrl(null)
          setAvatarZoom(1)
          setAvatarOffsetX(0)
          setAvatarOffsetY(0)
          setAvatarPreview('')
          setAvatarPreviewFailed(false)
        }
      }
    }

    if (isEditMode && character) {
      setFormData({
        name: character.name || '',
        description: character.description || '',
        personality: character.personality || '',
        scenario: character.scenario || '',
        first_mes: character.first_mes || '',
        mes_example: character.mes_example || '',
        system_prompt: character.system_prompt || '',
        post_history_instructions: character.post_history_instructions || '',
        alternate_greetings: character.alternate_greetings || [],
        avatar_data_url: undefined,
      })
      void setResolvedAvatarPreview(character.avatar_url || '')
    } else {
      setFormData(createEmptyCharacterForm())
      clearSourceObjectUrl()
      setAvatarSourceUrl(null)
      setAvatarZoom(1)
      setAvatarOffsetX(0)
      setAvatarOffsetY(0)
      setAvatarPreview('')
      setAvatarPreviewFailed(false)
    }

    return () => {
      cancelled = true
    }
  }, [open, isEditMode, character, characterKey])

  useEffect(() => {
    return () => {
      clearPreviewObjectUrl()
      clearSourceObjectUrl()
    }
  }, [])

  useEffect(() => {
    if (!avatarSourceUrl) {
      return
    }

    let cancelled = false

    const renderEditedAvatar = async () => {
      try {
        const dataUrl = await buildEditedAvatarDataUrl(avatarSourceUrl, {
          offsetX: avatarOffsetX,
          offsetY: avatarOffsetY,
          zoom: avatarZoom,
        })
        if (cancelled) {
          return
        }

        setAvatarPreview(dataUrl)
        setAvatarPreviewFailed(false)
        setFormData((prev) => ({
          ...prev,
          avatar_data_url: dataUrl,
        }))
      } catch {
        if (!cancelled) {
          setAvatarPreviewFailed(true)
        }
      }
    }

    void renderEditedAvatar()

    return () => {
      cancelled = true
    }
  }, [avatarOffsetX, avatarOffsetY, avatarSourceUrl, avatarZoom])

  const handleInputChange = (
    field: keyof Omit<CharacterFormData, 'alternate_greetings'>,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleGreetingChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      alternate_greetings: prev.alternate_greetings.map((g, i) =>
        i === index ? value : g
      ),
    }))
  }

  const handleAddGreeting = () => {
    setFormData((prev) => ({
      ...prev,
      alternate_greetings: [...prev.alternate_greetings, ''],
    }))
  }

  const handleRemoveGreeting = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      alternate_greetings: prev.alternate_greetings.filter((_, i) => i !== index),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const didSave = await onSave(formData)
      if (didSave !== false) {
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      clearPreviewObjectUrl()
      clearSourceObjectUrl()
      const imageUrl = URL.createObjectURL(file)
      sourceObjectUrlRef.current = imageUrl
      setAvatarSourceUrl(imageUrl)
      setAvatarZoom(1)
      setAvatarOffsetX(0)
      setAvatarOffsetY(0)
      setAvatarPreviewFailed(false)
    } catch {
      clearSourceObjectUrl()
    } finally {
      event.target.value = ''
    }
  }

  return (
    <WorkspaceEditorDialog
      bodyClassName="max-h-[calc(min(84vh,940px)-124px)] overflow-y-auto"
      description={
        isEditMode
          ? t('characterEditor.editDescription')
          : t('characterEditor.createDescription')
      }
      footer={(
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!formData.name.trim() || saving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isEditMode ? t('characterEditor.saveChanges') : t('characterEditor.createAction')}
          </Button>
        </>
      )}
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton
      style={{
        width: 'min(1480px, calc(100vw - 40px))',
        maxWidth: 'min(1480px, calc(100vw - 40px))',
        height: 'min(84vh, 940px)',
      }}
      title={isEditMode ? t('characterEditor.editTitle') : t('characterEditor.createTitle')}
    >
      <div className="grid min-h-0 gap-6 [grid-template-columns:340px_minmax(0,1fr)] max-[1180px]:[grid-template-columns:minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-col items-center gap-4 rounded-sm border border-[rgba(120,92,55,0.24)] bg-[rgba(255,245,222,0.02)] px-5 py-5">
                <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-sm border border-dashed border-[rgba(120,92,55,0.34)] bg-[rgba(255,245,222,0.04)]">
                  {avatarPreview && !avatarPreviewFailed ? (
                    <img
                      src={avatarPreview}
                      alt={t('characterEditor.avatarAlt')}
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={() => {
                        setAvatarPreviewFailed(true)
                      }}
                    />
                  ) : null}
                  <div
                    className={`flex h-full w-full items-center justify-center ${avatarPreview && !avatarPreviewFailed ? 'opacity-0' : 'opacity-100'}`}
                  >
                    <ImageIcon className="block h-10 w-10 shrink-0 text-gray-400" />
                  </div>
                </div>
                <input
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarPick}
                  ref={fileInputRef}
                  type="file"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t('characterEditor.changeAvatar')}
                </Button>
                {avatarSourceUrl ? (
                  <div className="w-full space-y-3 rounded-sm border border-[rgba(120,92,55,0.24)] bg-[rgba(255,245,222,0.02)] px-3 py-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-stone-400">
                        <span>{t('characterEditor.avatarEditor.zoom')}</span>
                        <span>{avatarZoom.toFixed(2)}x</span>
                      </div>
                      <Slider
                        max={3}
                        min={1}
                        onValueChange={(value) => setAvatarZoom(value[0] ?? 1)}
                        step={0.01}
                        value={[avatarZoom]}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-stone-400">
                        <span>{t('characterEditor.avatarEditor.horizontal')}</span>
                        <span>{avatarOffsetX}</span>
                      </div>
                      <Slider
                        max={100}
                        min={-100}
                        onValueChange={(value) => setAvatarOffsetX(Math.round(value[0] ?? 0))}
                        step={1}
                        value={[avatarOffsetX]}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-stone-400">
                        <span>{t('characterEditor.avatarEditor.vertical')}</span>
                        <span>{avatarOffsetY}</span>
                      </div>
                      <Slider
                        max={100}
                        min={-100}
                        onValueChange={(value) => setAvatarOffsetY(Math.round(value[0] ?? 0))}
                        step={1}
                        value={[avatarOffsetY]}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setAvatarZoom(1)
                        setAvatarOffsetX(0)
                        setAvatarOffsetY(0)
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {t('characterEditor.avatarEditor.reset')}
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('characterEditor.fields.name')} *</Label>
                <Input
                  id="name"
                  placeholder={t('characterEditor.placeholders.name')}
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-3 rounded-sm border border-[rgba(120,92,55,0.24)] bg-[rgba(255,245,222,0.02)] px-4 py-4">
                <div className="flex items-center justify-between">
                  <Label>{t('characterEditor.fields.alternateGreetings')}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddGreeting}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {t('characterEditor.addGreeting')}
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.alternate_greetings.map((greeting, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder={t('characterEditor.greetingPlaceholder', { index: index + 1 })}
                        value={greeting}
                        onChange={(e) => handleGreetingChange(index, e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGreeting(index)}
                        className="text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {formData.alternate_greetings.length === 0 && (
                    <p className="text-sm text-gray-500">
                      {t('characterEditor.emptyGreetings')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">{t('characterEditor.fields.description')}</Label>
                <Textarea
                  id="description"
                  className="min-h-[120px] resize-y"
                  placeholder={t('characterEditor.placeholders.description')}
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="personality">{t('characterEditor.fields.personality')}</Label>
                <Textarea
                  id="personality"
                  className="min-h-[120px] resize-y"
                  placeholder={t('characterEditor.placeholders.personality')}
                  value={formData.personality}
                  onChange={(e) => handleInputChange('personality', e.target.value)}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scenario">{t('characterEditor.fields.scenario')}</Label>
                <Textarea
                  id="scenario"
                  className="min-h-[120px] resize-y"
                  placeholder={t('characterEditor.placeholders.scenario')}
                  value={formData.scenario}
                  onChange={(e) => handleInputChange('scenario', e.target.value)}
                  rows={5}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="first_mes">{t('characterEditor.fields.firstMessage')}</Label>
                <Textarea
                  id="first_mes"
                  className="min-h-[120px] resize-y"
                  placeholder={t('characterEditor.placeholders.firstMessage')}
                  value={formData.first_mes}
                  onChange={(e) => handleInputChange('first_mes', e.target.value)}
                  rows={5}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="mes_example">{t('characterEditor.fields.exampleMessages')}</Label>
                <Textarea
                  id="mes_example"
                  className="min-h-[120px] resize-y"
                  placeholder={t('characterEditor.placeholders.exampleMessages')}
                  value={formData.mes_example}
                  onChange={(e) => handleInputChange('mes_example', e.target.value)}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="system_prompt">{t('characterEditor.fields.systemPrompt')}</Label>
                <Textarea
                  id="system_prompt"
                  className="min-h-[140px] resize-y"
                  placeholder={t('characterEditor.placeholders.systemPrompt')}
                  value={formData.system_prompt}
                  onChange={(e) => handleInputChange('system_prompt', e.target.value)}
                  rows={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post_history_instructions">
                  {t('characterEditor.fields.postHistoryInstructions')}
                </Label>
                <Textarea
                  id="post_history_instructions"
                  className="min-h-[140px] resize-y"
                  placeholder={t('characterEditor.placeholders.postHistoryInstructions')}
                  value={formData.post_history_instructions}
                  onChange={(e) =>
                    handleInputChange('post_history_instructions', e.target.value)
                  }
                  rows={6}
                />
              </div>
            </div>
      </div>
    </WorkspaceEditorDialog>
  )
}

async function buildEditedAvatarDataUrl(
  src: string,
  options: {
    zoom: number
    offsetX: number
    offsetY: number
  },
): Promise<string> {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  const outputSize = 512
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas context unavailable')
  }

  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  const baseScale = Math.max(outputSize / imageWidth, outputSize / imageHeight)
  const drawWidth = imageWidth * baseScale * options.zoom
  const drawHeight = imageHeight * baseScale * options.zoom
  const maxShiftX = Math.max(0, (drawWidth - outputSize) / 2)
  const maxShiftY = Math.max(0, (drawHeight - outputSize) / 2)
  const shiftX = (options.offsetX / 100) * maxShiftX
  const shiftY = (options.offsetY / 100) * maxShiftY
  const drawX = (outputSize - drawWidth) / 2 + shiftX
  const drawY = (outputSize - drawHeight) / 2 + shiftY

  context.clearRect(0, 0, outputSize, outputSize)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)

  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = src
  })
}
