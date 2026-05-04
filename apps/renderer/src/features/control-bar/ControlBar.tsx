import { useEffect, useMemo, useState } from 'react'
import {
  ScaleIcon,
  Settings2Icon,
  PuzzleIcon,
  DatabaseIcon,
  SquareSplitVerticalIcon,
} from 'lucide-react'
import type { CharacterChatSummary, CharacterSummary, ChatMessage, SettingsPayload } from '@yggdrasil/api-client'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { getCharacterName } from '@/lib/character'
import { getChatDisplayName } from '@/lib/chat'
import { useI18n } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n-context'
import {
  estimateTranscriptTokens,
  resolveCurrentModel,
  resolveCurrentModelOptions,
  resolveProviderGenerationParameters,
} from '@/lib/workspace-runtime'
import type { WorkbenchSection } from '@/lib/workbench-layout'

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'kobold', label: 'KoboldAI' },
  { value: 'koboldhorde', label: 'Horde' },
  { value: 'textgenerationwebui', label: 'TextGen WebUI' },
  { value: 'novel', label: 'NovelAI' },
] as const

export interface ControlBarProps {
  settings: SettingsPayload | null
  selectedCharacter: CharacterSummary | null
  selectedChat: CharacterChatSummary | null
  transcriptMessages: ChatMessage[]
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
  onMaxOutputChange: (value: number) => void
  onSetSection: (section: WorkbenchSection) => void
  onFocusInspectorTab: (tab: 'generation' | 'context') => void
  onOpenLibraryDialog: () => void
  onOpenSettingsConnections: () => void
}

function getContextColorClass(percent: number): string {
  if (percent > 85) return 'ref-meter-fill--danger'
  if (percent > 60) return 'ref-meter-fill--warning'
  return ''
}

export function ControlBar({
  settings,
  selectedCharacter,
  selectedChat,
  transcriptMessages,
  onProviderChange,
  onModelChange,
  onMaxOutputChange,
  onSetSection,
  onFocusInspectorTab,
  onOpenLibraryDialog,
  onOpenSettingsConnections,
}: ControlBarProps) {
  const { locale, setLocale, t } = useI18n()
  const settingsState = settings?.settings
  const [outputDraft, setOutputDraft] = useState<number | null>(null)

  const controlMeta = useMemo(() => {
    const currentApi = settingsState?.main_api || 'openai'
    const model = resolveCurrentModel(settingsState) || t('common.unconfigured')
    const generationParameters = resolveProviderGenerationParameters(settingsState)
    const contextMax =
      typeof settingsState?.max_context === 'number' ? settingsState.max_context : 10_000
    const output = generationParameters.amount_gen
    const contextUsed = Math.min(contextMax, estimateTranscriptTokens(transcriptMessages))
    const contextPercent = Math.min(100, Math.round((contextUsed / Math.max(contextMax, 1)) * 100))

    const modelOptions = resolveCurrentModelOptions(settingsState)
    return { currentApi, model, modelOptions, contextMax, contextUsed, contextPercent, output }
  }, [settingsState, t, transcriptMessages])

  useEffect(() => {
    setOutputDraft(controlMeta.output)
  }, [controlMeta.output])

  const providerLabel = useMemo(() => {
    const found = PROVIDER_OPTIONS.find((p) => p.value === controlMeta.currentApi)
    return found?.label ?? controlMeta.currentApi
  }, [controlMeta.currentApi])

  const resolvedOutput = outputDraft ?? controlMeta.output
  const workspaceLabel =
    (selectedChat ? getChatDisplayName(selectedChat) : '') ||
    selectedCharacter?.name ||
    (selectedCharacter ? getCharacterName(selectedCharacter) : t('common.unconfigured'))
  const canSelectModel = controlMeta.modelOptions.length > 1
  const modelValue = controlMeta.model.trim() || '__empty__'
  const nextLocale: Locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'
  const localeToggleLabel = locale === 'zh-CN' ? 'EN' : '中'
  const localeToggleTitle =
    locale === 'zh-CN' ? t('controlBar.switchToEnglish') : t('controlBar.switchToChinese')

  return (
    <div className="ref-control-bar">
      <div className="ref-select-block is-workspace">
        <span>{t('controlBar.workspace')}</span>
        <div className="ref-select-static" title={workspaceLabel}>
          <span>{workspaceLabel}</span>
        </div>
      </div>

      <div className="ref-select-block is-provider">
        <span>{t('controlBar.provider')}</span>
        <Select value={controlMeta.currentApi} onValueChange={onProviderChange}>
          <SelectTrigger className="ref-select-trigger is-glow">
            <SelectValue placeholder={providerLabel} />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ref-select-block is-model">
        <span>{t('controlBar.model')}</span>
        {canSelectModel ? (
          <Select
            value={modelValue}
            onValueChange={(value) => {
              if (value !== '__empty__') {
                onModelChange(value)
              }
            }}
          >
            <SelectTrigger className="ref-select-trigger" title={controlMeta.model}>
              <SelectValue placeholder={t('common.unconfigured')} />
            </SelectTrigger>
            <SelectContent>
              {controlMeta.modelOptions.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="ref-select-static" title={controlMeta.model}>
            <span>{controlMeta.model}</span>
          </div>
        )}
      </div>

      <div className="ref-meter-block is-context">
        <div className="ref-meter-head">
          <span>{t('controlBar.context')}</span>
          <strong>{controlMeta.contextPercent}%</strong>
        </div>
        <div className="ref-meter-inline">
          <small>
            {controlMeta.contextUsed.toLocaleString()} / {controlMeta.contextMax.toLocaleString()}
          </small>
          <div className="ref-meter-track">
            <div
              className={`ref-meter-fill ${getContextColorClass(controlMeta.contextPercent)}`}
              style={{ width: `${Math.max(controlMeta.contextPercent, 4)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="ref-meter-block is-output">
        <div className="ref-meter-head">
          <span>{t('controlBar.maxOutput')}</span>
          <strong>{resolvedOutput.toLocaleString()}</strong>
        </div>
        <div className="ref-meter-inline is-slider">
          <small>{t('controlBar.outputRange')}</small>
          <div className="ref-control-slider-wrap">
            <Slider
              aria-label={t('controlBar.maxOutput')}
              className="ref-control-slider"
              max={4096}
              min={128}
              step={64}
              value={[resolvedOutput]}
              onValueChange={(values) => {
                const nextValue = values[0]
                if (typeof nextValue === 'number') {
                  setOutputDraft(nextValue)
                }
              }}
              onValueCommit={(values) => {
                const nextValue = values[0]
                if (typeof nextValue === 'number' && nextValue !== controlMeta.output) {
                  onMaxOutputChange(nextValue)
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="ref-toolbar-icons">
        <Button
          size="sm"
          type="button"
          variant="ghost"
          className="min-w-12 px-2 font-semibold tracking-[0.18em]"
          onClick={() => setLocale(nextLocale)}
          title={localeToggleTitle}
        >
          {localeToggleLabel}
        </Button>
        <Button
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={() => onFocusInspectorTab('generation')}
          title={t('controlBar.promptInspector')}
        >
          <ScaleIcon className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={() => onFocusInspectorTab('context')}
          title={t('controlBar.contextInspector')}
        >
          <SquareSplitVerticalIcon className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onOpenSettingsConnections}
          title={t('controlBar.connectionSettings')}
        >
          <Settings2Icon className="size-4" />
        </Button>
        <Button size="icon-sm" type="button" variant="ghost" onClick={() => onSetSection('extensions')} title={t('nav.extensions')}>
          <PuzzleIcon className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onOpenLibraryDialog}
          title={t('controlBar.libraryDialog')}
        >
          <DatabaseIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
