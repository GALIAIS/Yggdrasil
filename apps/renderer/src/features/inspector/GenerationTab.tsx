import { useEffect, useMemo, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import type { CharacterSummary, ChatMessage, LibraryDocument, SettingsPayload, WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StoryDirectorPanel } from '@/features/story/StoryDirectorPanel'
import { useI18n } from '@/lib/i18n'
import {
  estimateTranscriptTokens,
  parseStopSequences,
  resolveProviderGenerationParameters,
  resolveOpenAiReasoningEffort,
  resolveOpenAiStreamingEnabled,
  type GenerationParameterKey,
} from '@/lib/workspace-runtime'
import type { StructuredInsightKind } from '@/features/workspace/useWorkbenchState'
import type { TraceEntry } from './TraceTab'

export interface GenerationTabProps {
  settings: SettingsPayload | null
  catalog: WorkspaceCatalogPayload | null
  transcriptMessages: ChatMessage[]
  recentTraces: TraceEntry[]
  selectedCharacter: CharacterSummary | null
  currentUserLabel: string
  draftAuthorName: string
  activeWorldDocuments: LibraryDocument[]
  structuredInsight: {
    generatedAt: number
    kind: StructuredInsightKind
    payload: Record<string, unknown>
  } | null
  autoApplyWorldState: boolean
  structuredInsightApplying: boolean
  structuredInsightPending: StructuredInsightKind | null
  onApplyStructuredInsight: () => void
  onAutoApplyWorldStateChange: (enabled: boolean) => void
  onClearStructuredInsight: () => void
  onGenerateStructuredInsight: (kind: StructuredInsightKind) => void
  onSettingChange: (key: string, value: unknown) => void
}

export function GenerationTab({
  settings,
  catalog,
  transcriptMessages,
  recentTraces,
  selectedCharacter,
  currentUserLabel,
  draftAuthorName,
  activeWorldDocuments,
  structuredInsight,
  autoApplyWorldState,
  structuredInsightApplying,
  structuredInsightPending,
  onApplyStructuredInsight,
  onAutoApplyWorldStateChange,
  onClearStructuredInsight,
  onGenerateStructuredInsight,
  onSettingChange,
}: GenerationTabProps) {
  const { t } = useI18n()
  const settingsState = settings?.settings

  const resolvedParameters = useMemo(
    () => resolveProviderGenerationParameters(settingsState),
    [settingsState],
  )

  const [draftParameters, setDraftParameters] = useState(resolvedParameters)

  useEffect(() => {
    setDraftParameters(resolvedParameters)
  }, [resolvedParameters])

  const modelParameters = [
    {
      label: t('inspector.modelParameters.temperature'),
      draftKey: 'temp',
      settingKey: 'temp' as const,
      min: 0,
      max: 2,
      step: 0.01,
      value: draftParameters.temp,
      committedValue: resolvedParameters.temp,
      getValue: () => draftParameters.temp.toFixed(2),
    },
    {
      label: t('inspector.modelParameters.topP'),
      draftKey: 'top_p',
      settingKey: 'top_p' as const,
      min: 0,
      max: 1,
      step: 0.01,
      value: draftParameters.top_p,
      committedValue: resolvedParameters.top_p,
      getValue: () => draftParameters.top_p.toFixed(2),
    },
    {
      label:
        resolvedParameters.penaltyField === 'freq_pen'
          ? t('inspector.modelParameters.frequencyPenalty')
          : t('inspector.modelParameters.repetitionPenalty'),
      draftKey: 'penaltyValue',
      settingKey: resolvedParameters.penaltyField,
      min: resolvedParameters.penaltyField === 'freq_pen' ? -2 : 0.5,
      max: resolvedParameters.penaltyField === 'freq_pen' ? 2 : 4,
      step: 0.01,
      value: draftParameters.penaltyValue,
      committedValue: resolvedParameters.penaltyValue,
      getValue: () => draftParameters.penaltyValue.toFixed(2),
    },
    {
      label: t('inspector.modelParameters.maxOutputTokens'),
      draftKey: 'amount_gen',
      settingKey: 'amount_gen' as const,
      min: 1,
      max: 2048,
      step: 1,
      value: draftParameters.amount_gen,
      committedValue: resolvedParameters.amount_gen,
      getValue: () => draftParameters.amount_gen.toLocaleString(),
    },
  ] as const

  const contextSize =
    typeof settingsState?.max_context === 'number'
      ? settingsState.max_context
      : typeof settingsState?.max_context === 'string'
        ? Number(settingsState.max_context)
        : 10_000

  const estimatedTokens = estimateTranscriptTokens(transcriptMessages)
  const stopSequences = parseStopSequences(settingsState)
  const stopSequencesCount = stopSequences.length
  const openAiStreamingEnabled = resolveOpenAiStreamingEnabled(settingsState)
  const openAiReasoningEffort = resolveOpenAiReasoningEffort(settingsState)
  const worldEntries = catalog?.entries.worlds ?? []
  const worldMatches = activeWorldDocuments
    .slice(0, 4)
    .map((document) => {
      const entry = worldEntries.find((item) => item.name === document.name)
      return {
        label: document.name,
        tag: t('inspector.tags.world'),
        score:
          typeof entry?.itemCount === 'number'
            ? `${entry.itemCount} ${t('common.items')}`
            : entry?.note?.trim() || t('common.ready'),
      }
    })

  const exampleDialogueCount = selectedCharacter?.mes_example?.trim()
    ? selectedCharacter.mes_example.split(/<START>|{{user}}|{{char}}/g).filter((item) => item.trim()).length
    : 0
  const traceRows = recentTraces.slice(0, 4).map((trace) => ({
    time: trace.createdAt ? new Date(trace.createdAt).toLocaleTimeString() : t('common.unavailable'),
    label: trace.characterName || currentUserLabel || draftAuthorName || t('common.user'),
    meta: typeof trace.tokenCount === 'number' ? `${trace.tokenCount} ${t('inspector.tok')}` : '',
    duration: typeof trace.durationMs === 'number' ? formatDuration(trace.durationMs) : t('common.unavailable'),
  }))

  const promptPreview = [
    { label: t('inspector.promptPreview.system'), value: settingsState?.sysprompt?.name || t('common.unconfigured') },
    { label: t('inspector.promptPreview.context'), value: `${estimatedTokens.toLocaleString()} / ${contextSize.toLocaleString()} ${t('inspector.tokens')}` },
    { label: t('inspector.promptPreview.loreItems'), value: t('inspector.promptPreview.loreItemsIncluded', { count: activeWorldDocuments.length }) },
    { label: t('inspector.promptPreview.exampleDialogue'), value: t('inspector.promptPreview.exchanges', { count: exampleDialogueCount }) },
    { label: t('inspector.promptPreview.memory'), value: t('inspector.promptPreview.recentConversation', { count: transcriptMessages.length }) },
  ]

  return (
    <div className="ref-inspector-stack">
      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('inspector.sections.modelParameters')}</span>
          <ChevronDownIcon className="size-4" />
        </div>
        <div className="ref-inspector-body-block">
          {modelParameters.map((item) => (
            <div className="ref-inspector-slider-row" key={item.label}>
              <div className="ref-inspector-slider-head">
                <span>{item.label}</span>
                <strong>{item.getValue()}</strong>
              </div>
              <Slider
                className="ref-inspector-slider"
                value={[item.value]}
                onValueChange={(vals) => {
                  const nextValue = vals[0]
                  setDraftParameters((current) => ({
                    ...current,
                    [item.draftKey]: nextValue,
                  }))
                }}
                onValueCommit={(vals) => {
                  const nextValue = vals[0]
                  if (item.committedValue !== nextValue) {
                    onSettingChange(item.settingKey as GenerationParameterKey, nextValue)
                  }
                }}
                max={item.max}
                min={item.min}
                step={item.step}
              />
            </div>
          ))}
          {settingsState?.main_api === 'openai' ? (
            <>
              <div className="ref-inspector-row">
                <span>{t('inspector.modelParameters.streamResponse')}</span>
                <Switch
                  checked={openAiStreamingEnabled}
                  onCheckedChange={(checked) => {
                    onSettingChange('stream_openai', checked)
                  }}
                />
              </div>
              <div className="ref-inspector-slider-row">
                <div className="ref-inspector-slider-head">
                  <span>{t('inspector.modelParameters.thinkingIntensity')}</span>
                  <strong>{t(`inspector.reasoning.${openAiReasoningEffort}`)}</strong>
                </div>
                <Select
                  value={openAiReasoningEffort}
                  onValueChange={(value) => {
                    onSettingChange('reasoning_effort_openai', value)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">{t('inspector.reasoning.off')}</SelectItem>
                    <SelectItem value="low">{t('inspector.reasoning.low')}</SelectItem>
                    <SelectItem value="medium">{t('inspector.reasoning.medium')}</SelectItem>
                    <SelectItem value="high">{t('inspector.reasoning.high')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
          <div className="ref-inspector-slider-row">
            <div className="ref-inspector-slider-head">
              <span>{t('inspector.sections.stopSequences')}</span>
              <strong>{stopSequencesCount}</strong>
            </div>
            <div className="ref-inspector-row">
              <span>{stopSequencesCount > 0 ? stopSequences.slice(0, 2).join(' / ') : t('common.unconfigured')}</span>
              <strong>{settingsState?.context?.names_as_stop_strings ? t('common.ready') : t('common.unavailable')}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('inspector.sections.worldInfoMatches')}</span>
          <strong>{worldMatches.length}</strong>
        </div>
        <div className="ref-inspector-body-block">
          {worldMatches.map((item) => (
            <div className="ref-inspector-match" data-tag={item.tag.toLowerCase()} key={item.label}>
              <div className="min-w-0">
                <p>{item.label}</p>
              </div>
              <em>{item.tag}</em>
              <strong>{item.score}</strong>
            </div>
          ))}
          {worldMatches.length === 0 ? (
            <div className="ref-inspector-row">
              <span>{t('common.unconfigured')}</span>
              <strong>0</strong>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('inspector.sections.promptPreview')}</span>
          <ChevronDownIcon className="size-4" />
        </div>
        <div className="ref-inspector-body-block">
          {promptPreview.map((item) => (
            <div className="ref-inspector-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('inspector.director.title')}</span>
          <strong>{structuredInsight ? t('common.ready') : 0}</strong>
        </div>
        <StoryDirectorPanel
          autoApplyWorldState={autoApplyWorldState}
          insight={structuredInsight}
          isApplying={structuredInsightApplying}
          onAutoApplyWorldStateChange={onAutoApplyWorldStateChange}
          onApply={onApplyStructuredInsight}
          onClear={onClearStructuredInsight}
          onGenerate={onGenerateStructuredInsight}
          pendingKind={structuredInsightPending}
        />
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('inspector.sections.recentTrace')}</span>
          <strong>{traceRows.length}</strong>
        </div>
        <div className="ref-inspector-body-block">
          {traceRows.map((row, index) => (
            <div className="ref-trace-row" key={`${row.label}-${row.time}-${index}`}>
              <span className="ref-trace-time">{row.time}</span>
              <span className="ref-trace-label">{row.label}</span>
              {row.meta ? <em>{row.meta}</em> : <em className="invisible">—</em>}
              <strong>{row.duration}</strong>
            </div>
          ))}
          {traceRows.length === 0 ? (
            <div className="ref-inspector-row">
              <span>{t('common.unavailable')}</span>
              <strong>0</strong>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
