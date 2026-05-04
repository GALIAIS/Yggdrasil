import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MessageContentSegments } from '@/features/chat/MessageContentSegments'
import {
  buildMessageRenderingCheatSheet,
  BUILT_IN_MESSAGE_RENDER_TEMPLATES,
  createDefaultMessageRenderingConfig,
  resolveMessageRenderingProfile,
  type MessageRenderFontWeight,
  type MessageRenderPattern,
  type MessageRenderRule,
  type MessageRenderingConfig,
  upsertRuleOverride,
} from '@/lib/chat-rendering'
import { useI18n } from '@/lib/i18n'

/* eslint-disable react-refresh/only-export-components */

const FONT_WEIGHT_OPTIONS: MessageRenderFontWeight[] = ['normal', 'medium', 'semibold', 'bold']
const COLOR_SWATCHES = [
  'rgba(247,229,190,0.99)',
  'rgba(236,215,171,0.96)',
  'rgba(188,204,215,0.92)',
  'rgba(171,205,220,0.94)',
  'rgba(204,184,231,0.94)',
  'rgba(209,197,173,0.88)',
  'rgba(80,63,42,0.10)',
  'transparent',
] as const

export function MessageRenderingSettingsCard({
  value,
  onChange,
}: {
  value: MessageRenderingConfig
  onChange: (value: MessageRenderingConfig) => void
}) {
  const { t } = useI18n()
  const profile = useMemo(() => resolveMessageRenderingProfile(value), [value])
  const cheatSheet = useMemo(() => buildMessageRenderingCheatSheet(value), [value])
  const [selectedRuleId, setSelectedRuleId] = useState(profile.template.rules[0]?.id ?? '')
  const [advancedMode, setAdvancedMode] = useState(false)
  const selectedRule = profile.template.rules.find((rule) => rule.id === selectedRuleId) ?? profile.template.rules[0] ?? null
  const [advancedText, setAdvancedText] = useState(selectedRule ? JSON.stringify(selectedRule, null, 2) : '')
  const [advancedError, setAdvancedError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedRule && profile.template.rules[0]) {
      setSelectedRuleId(profile.template.rules[0].id)
    }
  }, [profile.template.rules, selectedRule])

  useEffect(() => {
    setAdvancedText(selectedRule ? JSON.stringify(selectedRule, null, 2) : '')
    setAdvancedError(null)
  }, [selectedRule])

  const handleTemplateChange = (templateId: string) => {
    const nextTemplate = BUILT_IN_MESSAGE_RENDER_TEMPLATES.find((template) => template.id === templateId)
    onChange({
      ...value,
      activeTemplateId: templateId,
    })
    if (nextTemplate?.rules[0]) {
      setSelectedRuleId(nextTemplate.rules[0].id)
    }
  }

  const commitRule = (nextRule: MessageRenderRule) => {
    onChange(
      upsertRuleOverride(value, profile.template.id, nextRule.id, {
        enabled: nextRule.enabled,
        multiline: nextRule.multiline,
        pattern: nextRule.pattern,
        patternMode: nextRule.patternMode,
        priority: nextRule.priority,
        style: nextRule.style,
      }),
    )
  }

  const resetCurrentTemplate = () => {
    const nextOverrides = { ...value.overrides }
    delete nextOverrides[profile.template.id]
    onChange({
      ...value,
      overrides: nextOverrides,
    })
  }

  const handleAdvancedApply = () => {
    if (!selectedRule) {
      return
    }

    try {
      const parsed = JSON.parse(advancedText) as MessageRenderRule
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(t('messageRenderingSettings.errors.invalidRule'))
      }

      commitRule({
        ...selectedRule,
        ...parsed,
        id: selectedRule.id,
        kind: selectedRule.kind,
        label: selectedRule.label,
      })
      setAdvancedError(null)
    } catch (error) {
      setAdvancedError(error instanceof Error ? error.message : t('messageRenderingSettings.errors.invalidJson'))
    }
  }

  return (
    <Card className="py-5 shadow-none">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{t('messageRenderingSettings.title')}</CardTitle>
            <CardDescription>{t('messageRenderingSettings.description')}</CardDescription>
          </div>
          <Button onClick={resetCurrentTemplate} type="button" variant="outline">
            {t('messageRenderingSettings.resetTemplate')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="grid gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel>{t('messageRenderingSettings.template')}</FieldLabel>
                <FieldContent>
                  <Select value={value.activeTemplateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUILT_IN_MESSAGE_RENDER_TEMPLATES.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{t('messageRenderingSettings.previewSample')}</FieldLabel>
                <FieldContent>
                  <Textarea
                    className="min-h-[180px]"
                    value={value.sampleText}
                    onChange={(event) => onChange({ ...value, sampleText: event.target.value })}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>{t('messageRenderingSettings.nestedRenderingTitle')}</FieldLabel>
                <FieldContent>
                  <label className="flex items-center gap-2 text-sm text-stone-300">
                    <Checkbox
                      checked={value.renderNestedSegments}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...value,
                          renderNestedSegments: checked === true,
                        })
                      }
                    />
                    <span>{t('messageRenderingSettings.nestedRenderingEnabled')}</span>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-stone-400/80">
                    {t('messageRenderingSettings.nestedRenderingDescription')}
                  </p>
                </FieldContent>
              </Field>

              <FieldGroup>
                <Field>
                  <FieldLabel>{t('messageRenderingSettings.formatContractTitle')}</FieldLabel>
                  <FieldContent>
                    <label className="flex items-center gap-2 text-sm text-stone-300">
                      <Checkbox
                        checked={value.formatGuide.enabled}
                        onCheckedChange={(checked) =>
                          onChange({
                            ...value,
                            formatGuide: {
                              ...value.formatGuide,
                              enabled: checked === true,
                            },
                          })
                        }
                      />
                      <span>{t('messageRenderingSettings.formatContractEnabled')}</span>
                    </label>
                    <p className="mt-2 text-xs leading-5 text-stone-400/80">
                      {t('messageRenderingSettings.formatContractDescription')}
                    </p>
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel>{t('messageRenderingSettings.formatContractMode')}</FieldLabel>
                  <FieldContent>
                    <Select
                      value={value.formatGuide.mode}
                      onValueChange={(nextMode) =>
                        onChange({
                          ...value,
                          formatGuide: {
                            ...value.formatGuide,
                            mode: nextMode as 'balanced' | 'strict',
                          },
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">{t('messageRenderingSettings.modes.balanced')}</SelectItem>
                        <SelectItem value="strict">{t('messageRenderingSettings.modes.strict')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel>{t('messageRenderingSettings.formatContractCheatSheet')}</FieldLabel>
                  <FieldContent>
                    <Textarea className="min-h-[136px]" readOnly value={cheatSheet} />
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel>{t('messageRenderingSettings.customInstruction')}</FieldLabel>
                  <FieldContent>
                    <Textarea
                      className="min-h-[120px]"
                      placeholder={t('messageRenderingSettings.customInstructionPlaceholder')}
                      value={value.formatGuide.customInstruction}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          formatGuide: {
                            ...value.formatGuide,
                            customInstruction: event.target.value,
                          },
                        })
                      }
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </FieldGroup>

            <div className="rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(12,10,9,0.72)] px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
                  {t('messageRenderingSettings.preview')}
                </span>
                <Badge variant="outline">{profile.template.name}</Badge>
              </div>
              <div className="ref-message-preview">
                <MessageContentSegments profile={profile} text={value.sampleText} />
              </div>
            </div>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="grid content-start gap-2 self-start">
              <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
                {t('messageRenderingSettings.rules')}
              </span>
              <div className="grid content-start gap-2">
                {profile.template.rules.map((rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    className={`rounded-sm border px-3 py-3 text-left ${
                      selectedRule?.id === rule.id
                        ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                        : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)]'
                    }`}
                    onClick={() => setSelectedRuleId(rule.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm text-stone-100">{rule.label}</strong>
                      <Badge variant="outline">{rule.kind}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-stone-400/80">
                      {rule.patternMode} · P{rule.priority}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {selectedRule ? (
              <div className="grid self-start gap-4 rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(255,245,222,0.02)] px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm text-stone-100">{selectedRule.label}</strong>
                    <p className="mt-1 text-xs text-stone-400/80">{profile.template.description}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-stone-300">
                    <Checkbox
                      checked={selectedRule.enabled}
                      onCheckedChange={(checked) =>
                        commitRule({ ...selectedRule, enabled: checked === true })
                      }
                    />
                    <span>{t('messageRenderingSettings.enabled')}</span>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel>{t('messageRenderingSettings.priority')}</FieldLabel>
                    <FieldContent>
                      <Input
                        inputMode="numeric"
                        value={String(selectedRule.priority)}
                        onChange={(event) =>
                          commitRule({
                            ...selectedRule,
                            priority: Number(event.target.value) || 0,
                          })
                        }
                      />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel>{t('messageRenderingSettings.fontWeight')}</FieldLabel>
                    <FieldContent>
                      <Select
                        value={selectedRule.style.fontWeight}
                        onValueChange={(nextWeight) =>
                          commitRule({
                            ...selectedRule,
                            style: {
                              ...selectedRule.style,
                              fontWeight: nextWeight as MessageRenderFontWeight,
                            },
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_WEIGHT_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldContent>
                  </Field>
                </div>

                <PatternEditor
                  rule={selectedRule}
                  onChange={(pattern) => commitRule({ ...selectedRule, pattern })}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <ColorField
                    label={t('messageRenderingSettings.textColor')}
                    value={selectedRule.style.textColor}
                    onChange={(value) =>
                      commitRule({
                        ...selectedRule,
                        style: { ...selectedRule.style, textColor: value },
                      })
                    }
                  />
                  <ColorField
                    label={t('messageRenderingSettings.backgroundTint')}
                    value={selectedRule.style.backgroundTint}
                    onChange={(value) =>
                      commitRule({
                        ...selectedRule,
                        style: { ...selectedRule.style, backgroundTint: value },
                      })
                    }
                  />
                  <ColorField
                    label={t('messageRenderingSettings.accentColor')}
                    value={selectedRule.style.accentColor}
                    onChange={(value) =>
                      commitRule({
                        ...selectedRule,
                        style: { ...selectedRule.style, accentColor: value },
                      })
                    }
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-stone-300">
                  <Checkbox
                    checked={selectedRule.style.fontStyle === 'italic'}
                    onCheckedChange={(checked) =>
                      commitRule({
                        ...selectedRule,
                        style: {
                          ...selectedRule.style,
                          fontStyle: checked === true ? 'italic' : 'normal',
                        },
                      })
                    }
                  />
                  <span>{t('messageRenderingSettings.italic')}</span>
                </label>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-stone-500">
                    {t('messageRenderingSettings.advanced')}
                  </span>
                  <Button onClick={() => setAdvancedMode((current) => !current)} type="button" variant="outline">
                    {advancedMode ? t('messageRenderingSettings.hideAdvanced') : t('messageRenderingSettings.showAdvanced')}
                  </Button>
                </div>

                {advancedMode ? (
                  <div className="grid gap-3">
                    <Textarea
                      className="min-h-[240px] font-mono text-xs"
                      value={advancedText}
                      onChange={(event) => setAdvancedText(event.target.value)}
                    />
                    {advancedError ? <p className="text-sm text-red-300">{advancedError}</p> : null}
                    <div className="flex justify-end">
                      <Button onClick={handleAdvancedApply} type="button">
                        {t('messageRenderingSettings.applyJson')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ColorField({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <div className="grid gap-2">
          <div className="ref-color-field">
            <input
              aria-label={label}
              className="ref-color-picker"
              type="color"
              value={toHexColor(value)}
              onChange={(event) => onChange(event.target.value)}
            />
            <Input value={value} onChange={(event) => onChange(event.target.value)} />
          </div>
          <div className="ref-swatch-row">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className="ref-swatch"
                style={{
                  background:
                    swatch === 'transparent'
                      ? 'linear-gradient(135deg, rgba(120,92,55,0.18), rgba(120,92,55,0.02))'
                      : swatch,
                }}
                onClick={() => onChange(swatch)}
                title={swatch}
              />
            ))}
          </div>
        </div>
      </FieldContent>
    </Field>
  )
}

function toHexColor(value: string): string {
  const normalized = value.trim()
  if (/^#[0-9a-f]{6}$/iu.test(normalized)) {
    return normalized
  }

  const match = normalized.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/iu)
  if (!match) {
    return '#c4a164'
  }

  const [, r, g, b] = match
  return `#${[r, g, b].map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`
}

function PatternEditor({
  rule,
  onChange,
}: {
  rule: MessageRenderRule
  onChange: (value: MessageRenderPattern) => void
}) {
  const { t } = useI18n()

  if (rule.patternMode === 'wrapped' && 'open' in rule.pattern && 'close' in rule.pattern) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>{t('messageRenderingSettings.openDelimiter')}</FieldLabel>
          <FieldContent>
            <Input
              value={rule.pattern.open}
              onChange={(event) => onChange({ ...rule.pattern, open: event.target.value })}
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel>{t('messageRenderingSettings.closeDelimiter')}</FieldLabel>
          <FieldContent>
            <Input
              value={rule.pattern.close}
              onChange={(event) => onChange({ ...rule.pattern, close: event.target.value })}
            />
          </FieldContent>
        </Field>
      </div>
    )
  }

  if (rule.patternMode === 'linePrefix' && 'prefix' in rule.pattern) {
    return (
      <Field>
        <FieldLabel>{t('messageRenderingSettings.linePrefix')}</FieldLabel>
        <FieldContent>
          <Input
            value={rule.pattern.prefix}
            onChange={(event) => onChange({ prefix: event.target.value })}
          />
        </FieldContent>
      </Field>
    )
  }

  if ('expression' in rule.pattern) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>{t('messageRenderingSettings.regexExpression')}</FieldLabel>
          <FieldContent>
            <Input
              value={rule.pattern.expression}
              onChange={(event) => onChange({ ...rule.pattern, expression: event.target.value })}
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel>{t('messageRenderingSettings.regexFlags')}</FieldLabel>
          <FieldContent>
            <Input
              value={rule.pattern.flags ?? ''}
              onChange={(event) => onChange({ ...rule.pattern, flags: event.target.value })}
            />
          </FieldContent>
        </Field>
      </div>
    )
  }

  return null
}

export function createDefaultRenderingDraft(): MessageRenderingConfig {
  return createDefaultMessageRenderingConfig()
}
