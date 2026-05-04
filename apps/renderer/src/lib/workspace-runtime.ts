import type {
  AppSettings,
  CharacterSummary,
  ChatMessage,
  NovelAiSettings,
  TextGenerationWebUiSettings,
  KaiSettings,
} from '@yggdrasil/api-client'

import { getCharacterName } from '@/lib/character'

export const DEFAULT_SESSION_SUMMARY_MIN_MESSAGES = 24
export const DEFAULT_SESSION_SUMMARY_REFRESH_INTERVAL_MS = 30_000
export const DEFAULT_SESSION_SUMMARY_SOURCE_WINDOW = 24
export const DEFAULT_RETRIEVAL_JOBS_RETENTION_PER_SOURCE = 24

export function estimateMessageTokens(message: Pick<ChatMessage, 'mes'> | string): number {
  const text = typeof message === 'string' ? message : String(message.mes ?? '')
  const normalized = text.trim()
  if (!normalized) return 0

  let total = 0
  const urlMatches = normalized.match(/https?:\/\/\S+/g) ?? []
  const consumedRanges: Array<[number, number]> = []

  for (const match of urlMatches) {
    const start = normalized.indexOf(match, consumedRanges.at(-1)?.[1] ?? 0)
    if (start >= 0) {
      consumedRanges.push([start, start + match.length])
      total += Math.max(3, Math.ceil(match.length / 6))
    }
  }

  const residue = collectUnconsumedText(normalized, consumedRanges)
  const segments = residue.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[.,]\d+)?|[^\s]/gu,
  ) ?? []

  for (const segment of segments) {
    if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(segment)) {
      total += 1
      continue
    }

    if (/^[A-Za-z]+(?:'[A-Za-z]+)?$/u.test(segment)) {
      total += Math.max(1, Math.ceil(segment.length / 4))
      continue
    }

    if (/^\d+(?:[.,]\d+)?$/u.test(segment)) {
      total += Math.max(1, Math.ceil(segment.length / 3))
      continue
    }

    total += 1
  }

  return Math.max(1, total)
}

export function estimateTranscriptTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
}

function resolvePositiveIntegerSetting(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum?: number,
): number {
  const raw =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(raw)) {
    return fallback
  }

  const clamped = Math.max(minimum, Math.trunc(raw))
  return typeof maximum === 'number' ? Math.min(clamped, maximum) : clamped
}

export function resolveSessionSummaryMinMessages(settings: AppSettings | null | undefined): number {
  return resolvePositiveIntegerSetting(
    settings?.session_summary_min_messages,
    DEFAULT_SESSION_SUMMARY_MIN_MESSAGES,
    4,
    512,
  )
}

export function resolveSessionSummaryRefreshIntervalMs(settings: AppSettings | null | undefined): number {
  return resolvePositiveIntegerSetting(
    settings?.session_summary_refresh_interval_ms,
    DEFAULT_SESSION_SUMMARY_REFRESH_INTERVAL_MS,
    1_000,
    3_600_000,
  )
}

export function resolveSessionSummarySourceWindow(settings: AppSettings | null | undefined): number {
  return resolvePositiveIntegerSetting(
    settings?.session_summary_source_window,
    DEFAULT_SESSION_SUMMARY_SOURCE_WINDOW,
    4,
    128,
  )
}

export function resolveRetrievalJobsRetentionPerSource(settings: AppSettings | null | undefined): number {
  return resolvePositiveIntegerSetting(
    settings?.retrieval_jobs_retention_per_source,
    DEFAULT_RETRIEVAL_JOBS_RETENTION_PER_SOURCE,
    1,
    256,
  )
}

export function resolveTextGenerationSettings(
  settings: AppSettings | null | undefined,
): TextGenerationWebUiSettings {
  const textGenerationSettings = settings?.textgenerationwebui_settings

  return textGenerationSettings && typeof textGenerationSettings === 'object'
    ? textGenerationSettings
    : {}
}

export function resolveTextGenerationType(settings: AppSettings | null | undefined): string {
  const textGenerationSettings = resolveTextGenerationSettings(settings)

  if (typeof textGenerationSettings.type === 'string' && textGenerationSettings.type.trim()) {
    return textGenerationSettings.type.trim()
  }

  return settings?.api_use_mancer_webui ? 'mancer' : 'ooba'
}

export function resolveCurrentModel(settings: AppSettings | null | undefined): string {
  const currentApi = settings?.main_api ?? 'openai'
  const textGenerationSettings = resolveTextGenerationSettings(settings)
  const textgenType = resolveTextGenerationType(settings)
  const chatCompletionSource =
    typeof settings?.chat_completion_source === 'string'
      ? settings.chat_completion_source
      : settings?.oai_settings &&
          typeof settings.oai_settings === 'object' &&
          typeof settings.oai_settings.chat_completion_source === 'string'
        ? String(settings.oai_settings.chat_completion_source)
        : 'openai'

  switch (currentApi) {
    case 'openai':
      return chatCompletionSource === 'azure_openai'
        ? firstNonEmpty([
            settings?.azure_openai_model,
            settings?.oai_settings && typeof settings.oai_settings === 'object'
              ? String(settings.oai_settings.azure_openai_model ?? '')
              : '',
            settings?.openai_model,
            settings?.oai_settings && typeof settings.oai_settings === 'object'
              ? String(settings.oai_settings.openai_model ?? '')
              : '',
          ])
        : firstNonEmpty([
            settings?.openai_model,
            settings?.oai_settings && typeof settings.oai_settings === 'object'
              ? String(settings.oai_settings.openai_model ?? '')
              : '',
            settings?.azure_openai_model,
          ])
    case 'novel':
      return firstNonEmpty([
        settings?.nai_settings && typeof settings.nai_settings === 'object'
          ? String(settings.nai_settings.model_novel ?? '')
          : '',
      ])
    case 'koboldhorde': {
      const models =
        settings?.horde_settings && typeof settings.horde_settings === 'object' && Array.isArray(settings.horde_settings.models)
          ? settings.horde_settings.models.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : []
      return models.join(', ')
    }
    case 'kobold':
      return firstNonEmpty([
        settings?.preset_settings,
      ])
    case 'textgenerationwebui':
      return resolveTextGenerationModel(textGenerationSettings, textgenType)
    default:
      return ''
  }
}

export function resolveCurrentModelOptions(settings: AppSettings | null | undefined): string[] {
  const currentApi = settings?.main_api ?? 'openai'
  const textGenerationSettings = resolveTextGenerationSettings(settings)
  const textgenType = resolveTextGenerationType(settings)

  switch (currentApi) {
    case 'openai':
      return uniqueNonEmpty([
        settings?.openai_model,
        settings?.azure_openai_model,
        settings?.oai_settings && typeof settings.oai_settings === 'object'
          ? String(settings.oai_settings.openai_model ?? '')
          : '',
        settings?.oai_settings && typeof settings.oai_settings === 'object'
          ? String(settings.oai_settings.azure_openai_model ?? '')
          : '',
        ...resolveChatCompletionModelCache(settings),
      ])
    case 'novel':
      return uniqueNonEmpty([
        settings?.nai_settings && typeof settings.nai_settings === 'object'
          ? String(settings.nai_settings.model_novel ?? '')
          : '',
      ])
    case 'koboldhorde':
      return uniqueNonEmpty(
        settings?.horde_settings && typeof settings.horde_settings === 'object' && Array.isArray(settings.horde_settings.models)
          ? settings.horde_settings.models
          : [],
      )
    case 'textgenerationwebui':
      return uniqueNonEmpty([
        resolveTextGenerationModel(textGenerationSettings, textgenType),
        String(textGenerationSettings.custom_model ?? ''),
        String(textGenerationSettings.generic_model ?? ''),
        String(textGenerationSettings.mancer_model ?? ''),
        String(textGenerationSettings.vllm_model ?? ''),
        String(textGenerationSettings.aphrodite_model ?? ''),
        String(textGenerationSettings.tabby_model ?? ''),
        String(textGenerationSettings.togetherai_model ?? ''),
        String(textGenerationSettings.llamacpp_model ?? ''),
        String(textGenerationSettings.koboldcpp_model ?? ''),
        String(textGenerationSettings.ollama_model ?? ''),
        String(textGenerationSettings.infermaticai_model ?? ''),
        String(textGenerationSettings.huggingface_model ?? ''),
        String(textGenerationSettings.dreamgen_model ?? ''),
        String(textGenerationSettings.openrouter_model ?? ''),
        String(textGenerationSettings.featherless_model ?? ''),
      ])
    case 'kobold':
      return uniqueNonEmpty([settings?.preset_settings])
    default:
      return []
  }
}

export function applyCurrentModelToSettings(
  settings: AppSettings,
  model: string,
): AppSettings {
  const currentApi = settings.main_api ?? 'openai'

  if (currentApi === 'openai') {
    const nextSettings = {
      ...settings,
      openai_model: model,
      oai_settings: {
        ...(settings.oai_settings && typeof settings.oai_settings === 'object'
          ? settings.oai_settings
          : {}),
        openai_model: model,
      },
    }
    return applyChatCompletionModelCache(nextSettings, [
      ...resolveChatCompletionModelCache(settings),
      model,
    ])
  }

  if (currentApi === 'novel') {
    return {
      ...settings,
      nai_settings: {
        ...(settings.nai_settings && typeof settings.nai_settings === 'object' ? settings.nai_settings : {}),
        model_novel: model,
      },
    }
  }

  if (currentApi === 'textgenerationwebui') {
    const textgenType = resolveTextGenerationType(settings)
    const nextTextgen = applyTextGenerationModel(resolveTextGenerationSettings(settings), textgenType, model)
    return {
      ...settings,
      textgenerationwebui_settings: nextTextgen,
    }
  }

  return settings
}

export type GenerationParameterKey = 'amount_gen' | 'rep_pen' | 'temp' | 'top_p' | 'freq_pen'
export type OpenAiBehaviorKey = 'reasoning_effort_openai' | 'stream_openai'
export type OpenAiReasoningEffort = 'low' | 'medium' | 'high'

export function applyGenerationParameterToSettings(
  settings: AppSettings,
  key: GenerationParameterKey,
  value: number,
): AppSettings {
  const currentApi = settings.main_api ?? 'openai'

  if (key === 'amount_gen') {
    const nextAmount = Math.max(1, Math.round(value))
    const nextOpenAiSettings =
      settings.oai_settings && typeof settings.oai_settings === 'object'
        ? settings.oai_settings
        : {}

    return {
      ...settings,
      amount_gen: nextAmount,
      openai_max_tokens: nextAmount,
      oai_settings: {
        ...nextOpenAiSettings,
        openai_max_tokens: nextAmount,
      },
    }
  }

  if (currentApi === 'openai') {
    const nextOpenAiSettings =
      settings.oai_settings && typeof settings.oai_settings === 'object'
        ? settings.oai_settings
        : {}

    switch (key) {
      case 'temp':
        return {
          ...settings,
          temp_openai: value,
          oai_settings: {
            ...nextOpenAiSettings,
            temp_openai: value,
          },
        }
      case 'top_p':
        return {
          ...settings,
          top_p_openai: value,
          oai_settings: {
            ...nextOpenAiSettings,
            top_p_openai: value,
          },
        }
      case 'freq_pen':
      case 'rep_pen':
        return {
          ...settings,
          freq_pen_openai: value,
          oai_settings: {
            ...nextOpenAiSettings,
            freq_pen_openai: value,
          },
        }
      default:
        return settings
    }
  }

  if (currentApi === 'novel') {
    const novelSettings = resolveNovelSettings(settings)
    switch (key) {
      case 'temp':
        return {
          ...settings,
          nai_settings: {
            ...novelSettings,
            temperature: value,
          },
        }
      case 'top_p':
        return {
          ...settings,
          nai_settings: {
            ...novelSettings,
            top_p: value,
          },
        }
      case 'rep_pen':
        return {
          ...settings,
          nai_settings: {
            ...novelSettings,
            repetition_penalty: value,
          },
        }
      default:
        return settings
    }
  }

  if (currentApi === 'kobold' || currentApi === 'koboldhorde') {
    const kaiSettings = resolveKoboldSettings(settings)
    switch (key) {
      case 'temp':
        return {
          ...settings,
          kai_settings: {
            ...kaiSettings,
            temp: value,
          },
        }
      case 'top_p':
        return {
          ...settings,
          kai_settings: {
            ...kaiSettings,
            top_p: value,
          },
        }
      case 'rep_pen':
        return {
          ...settings,
          kai_settings: {
            ...kaiSettings,
            rep_pen: value,
          },
        }
      default:
        return settings
    }
  }

  if (currentApi === 'textgenerationwebui') {
    const textGenerationSettings = resolveTextGenerationSettings(settings)
    switch (key) {
      case 'temp':
        return {
          ...settings,
          textgenerationwebui_settings: {
            ...textGenerationSettings,
            temp: value,
          },
        }
      case 'top_p':
        return {
          ...settings,
          textgenerationwebui_settings: {
            ...textGenerationSettings,
            top_p: value,
          },
        }
      case 'rep_pen':
        return {
          ...settings,
          textgenerationwebui_settings: {
            ...textGenerationSettings,
            rep_pen: value,
          },
        }
      default:
        return settings
    }
  }

  return settings
}

export function applyOpenAiBehaviorToSettings(
  settings: AppSettings,
  key: OpenAiBehaviorKey,
  value: boolean | OpenAiReasoningEffort | 'off',
): AppSettings {
  const nextOpenAiSettings =
    settings.oai_settings && typeof settings.oai_settings === 'object'
      ? settings.oai_settings
      : {}

  if (key === 'stream_openai') {
    return {
      ...settings,
      stream_openai: Boolean(value),
      oai_settings: {
        ...nextOpenAiSettings,
        stream_openai: Boolean(value),
      },
    }
  }

  if (value === 'off') {
    const { reasoning_effort_openai: _unusedRoot, ...restRoot } = settings
    const { reasoning_effort_openai: _unusedNested, ...restNested } = nextOpenAiSettings
    void _unusedRoot
    void _unusedNested
    return {
      ...restRoot,
      oai_settings: restNested,
    }
  }

  return {
    ...settings,
    reasoning_effort_openai: value as OpenAiReasoningEffort,
    oai_settings: {
      ...nextOpenAiSettings,
      reasoning_effort_openai: value as OpenAiReasoningEffort,
    },
  }
}

export function applyChatCompletionModelCache(
  settings: AppSettings,
  models: string[],
): AppSettings {
  const normalized = uniqueNonEmpty(models)
  const nextOpenAiSettings =
    settings.oai_settings && typeof settings.oai_settings === 'object'
      ? settings.oai_settings
      : {}

  return {
    ...settings,
    chat_completion_model_names: normalized,
    oai_settings: {
      ...nextOpenAiSettings,
      chat_completion_model_names: normalized,
    },
  }
}

export function resolveChatCompletionModelCache(
  settings: AppSettings | null | undefined,
): string[] {
  const rootModels = Array.isArray(settings?.chat_completion_model_names)
    ? settings.chat_completion_model_names
    : []
  const nestedModels =
    settings?.oai_settings &&
    typeof settings.oai_settings === 'object' &&
    Array.isArray(settings.oai_settings.chat_completion_model_names)
      ? settings.oai_settings.chat_completion_model_names
      : []

  return uniqueNonEmpty([...rootModels, ...nestedModels])
}

export function resolveProviderGenerationParameters(settings: AppSettings | null | undefined): {
  amount_gen: number
  penaltyField: 'freq_pen' | 'rep_pen'
  penaltyValue: number
  temp: number
  top_p: number
} {
  const currentApi = settings?.main_api ?? 'openai'
  const amountGen = resolveAmountGen(settings)

  if (currentApi === 'openai') {
    return {
      amount_gen: amountGen,
      penaltyField: 'freq_pen',
      penaltyValue: clampNumber(resolveNumber(settings?.freq_pen_openai, 0), -2, 2),
      temp: clampNumber(resolveNumber(settings?.temp_openai, 1), 0, 2),
      top_p: clampNumber(resolveNumber(settings?.top_p_openai, 1), 0, 1),
    }
  }

  if (currentApi === 'novel') {
    const novelSettings = resolveNovelSettings(settings)
    return {
      amount_gen: amountGen,
      penaltyField: 'rep_pen',
      penaltyValue: clampNumber(resolveNumber(novelSettings.repetition_penalty, 1.05), 0.5, 4),
      temp: clampNumber(resolveNumber(novelSettings.temperature, 1.5), 0, 2),
      top_p: clampNumber(resolveNumber(novelSettings.top_p, 0.75), 0, 1),
    }
  }

  if (currentApi === 'kobold' || currentApi === 'koboldhorde') {
    const kaiSettings = resolveKoboldSettings(settings)
    return {
      amount_gen: amountGen,
      penaltyField: 'rep_pen',
      penaltyValue: clampNumber(resolveNumber(kaiSettings.rep_pen, 1.1), 0.5, 4),
      temp: clampNumber(resolveNumber(kaiSettings.temp, 1), 0, 2),
      top_p: clampNumber(resolveNumber(kaiSettings.top_p, 0.95), 0, 1),
    }
  }

  const textGenerationSettings = resolveTextGenerationSettings(settings)
  return {
    amount_gen: amountGen,
    penaltyField: 'rep_pen',
    penaltyValue: clampNumber(resolveNumber(textGenerationSettings.rep_pen, 1.2), 0.5, 4),
    temp: clampNumber(resolveNumber(textGenerationSettings.temp, 0.7), 0, 2),
    top_p: clampNumber(resolveNumber(textGenerationSettings.top_p, 0.5), 0, 1),
  }
}

export function resolveOpenAiStreamingEnabled(settings: AppSettings | null | undefined): boolean {
  if (typeof settings?.stream_openai === 'boolean') {
    return settings.stream_openai
  }

  const nested = settings?.oai_settings
  if (nested && typeof nested === 'object' && typeof nested.stream_openai === 'boolean') {
    return nested.stream_openai
  }

  return false
}

export function resolveOpenAiReasoningEffort(
  settings: AppSettings | null | undefined,
): OpenAiReasoningEffort | 'off' {
  const candidates = [
    settings?.reasoning_effort_openai,
    settings?.oai_settings && typeof settings.oai_settings === 'object'
      ? settings.oai_settings.reasoning_effort_openai
      : undefined,
  ]

  for (const candidate of candidates) {
    if (candidate === 'low' || candidate === 'medium' || candidate === 'high') {
      return candidate
    }
  }

  return 'off'
}

export function parseStopSequences(settings: AppSettings | null | undefined): string[] {
  const sequences = new Set<string>()
  const custom = typeof settings?.custom_stopping_strings === 'string'
    ? settings.custom_stopping_strings
    : ''

  for (const item of custom.split(/\r?\n|,/g)) {
    const value = item.trim()
    if (value) sequences.add(value)
  }

  const instructStop =
    settings?.instruct && typeof settings.instruct === 'object' && typeof settings.instruct.stop_sequence === 'string'
      ? settings.instruct.stop_sequence.trim()
      : ''

  if (instructStop) {
    sequences.add(instructStop)
  }

  return Array.from(sequences)
}

export function buildCharacterSummary(character: CharacterSummary | null): string {
  if (!character) return ''

  const candidates = [
    typeof character.description === 'string' ? character.description.trim() : '',
    typeof character.scenario === 'string' ? character.scenario.trim() : '',
    typeof character.personality === 'string' ? character.personality.trim() : '',
    typeof character.first_mes === 'string' ? character.first_mes.trim() : '',
  ].filter(Boolean)

  const summary = candidates[0] ?? ''
  if (!summary) return getCharacterName(character)

  return summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}...` : summary
}

function resolveTextGenerationModel(
  settings: TextGenerationWebUiSettings,
  type: string,
): string {
  switch (type) {
    case 'generic':
      return String(settings.generic_model ?? '')
    case 'mancer':
      return String(settings.mancer_model ?? '')
    case 'vllm':
      return String(settings.vllm_model ?? '')
    case 'aphrodite':
      return String(settings.aphrodite_model ?? '')
    case 'tabby':
      return String(settings.tabby_model ?? '')
    case 'togetherai':
      return String(settings.togetherai_model ?? '')
    case 'llamacpp':
      return String(settings.llamacpp_model ?? '')
    case 'koboldcpp':
      return String(settings.koboldcpp_model ?? settings.llamacpp_model ?? '')
    case 'ollama':
      return String(settings.ollama_model ?? '')
    case 'infermaticai':
      return String(settings.infermaticai_model ?? '')
    case 'huggingface':
      return String(settings.huggingface_model ?? '')
    case 'dreamgen':
      return String(settings.dreamgen_model ?? '')
    case 'openrouter':
      return String(settings.openrouter_model ?? '')
    case 'featherless':
      return String(settings.featherless_model ?? '')
    case 'ooba':
      return String(settings.custom_model ?? '')
    default:
      return ''
  }
}

function resolveKoboldSettings(settings: AppSettings | null | undefined): KaiSettings {
  const kaiSettings = settings?.kai_settings

  return kaiSettings && typeof kaiSettings === 'object' ? kaiSettings : {}
}

function resolveNovelSettings(settings: AppSettings | null | undefined): NovelAiSettings {
  const novelSettings = settings?.nai_settings

  return novelSettings && typeof novelSettings === 'object' ? novelSettings : {}
}

function resolveAmountGen(settings: AppSettings | null | undefined): number {
  const primary = resolveNumber(settings?.amount_gen, NaN)
  if (Number.isFinite(primary) && primary > 0) {
    return Math.round(primary)
  }

  const fallback = resolveNumber(settings?.openai_max_tokens, 1024)
  return Math.max(1, Math.round(fallback))
}

function resolveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : fallback
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function applyTextGenerationModel(
  settings: TextGenerationWebUiSettings,
  type: string,
  model: string,
): TextGenerationWebUiSettings {
  const nextSettings: TextGenerationWebUiSettings = { ...settings }

  switch (type) {
    case 'generic':
      nextSettings.generic_model = model
      break
    case 'mancer':
      nextSettings.mancer_model = model
      break
    case 'vllm':
      nextSettings.vllm_model = model
      break
    case 'aphrodite':
      nextSettings.aphrodite_model = model
      break
    case 'tabby':
      nextSettings.tabby_model = model
      break
    case 'togetherai':
      nextSettings.togetherai_model = model
      break
    case 'llamacpp':
      nextSettings.llamacpp_model = model
      break
    case 'koboldcpp':
      nextSettings.koboldcpp_model = model
      break
    case 'ollama':
      nextSettings.ollama_model = model
      break
    case 'infermaticai':
      nextSettings.infermaticai_model = model
      break
    case 'huggingface':
      nextSettings.huggingface_model = model
      break
    case 'dreamgen':
      nextSettings.dreamgen_model = model
      break
    case 'openrouter':
      nextSettings.openrouter_model = model
      break
    case 'featherless':
      nextSettings.featherless_model = model
      break
    case 'ooba':
      nextSettings.custom_model = model
      break
    default:
      break
  }

  return nextSettings
}

function firstNonEmpty(values: Array<string | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function collectUnconsumedText(text: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) {
    return text
  }

  let cursor = 0
  let output = ''

  for (const [start, end] of ranges) {
    if (start > cursor) {
      output += `${text.slice(cursor, start)} `
    }
    cursor = end
  }

  if (cursor < text.length) {
    output += text.slice(cursor)
  }

  return output
}
