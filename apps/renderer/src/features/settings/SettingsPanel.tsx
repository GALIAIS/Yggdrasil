import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  AppSettings,
  LibraryDocument,
  ModelProviderCapability,
  ModelProviderCapabilityName,
  ModelProviderRecord,
  NovelAiSettings,
  SettingsPayload,
  TextGenerationWebUiSettings,
  WorkspaceCatalogPayload,
} from '@yggdrasil/api-client'
import { RefreshCcwIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  useChatCompletionStatusMutation,
  useLibraryDocumentsQuery,
  useModelProviderModelsMutation,
  useModelProvidersQuery,
  useNovelStatusMutation,
  useSaveModelProviderMutation,
  useSaveSettingsMutation,
  useSecretQuery,
  useTextGenerationStatusMutation,
} from '@/features/workspace/hooks'
import { buildGenerationReadiness, buildPresetInventory, buildSettingsSummary } from '@/lib/settings'
import { useI18n } from '@/lib/i18n'
import type { SettingsPanelAction } from '@/features/workspace/useWorkbenchState'
import {
  applyChatCompletionModelCache,
  applyGenerationParameterToSettings,
  resolveRetrievalJobsRetentionPerSource,
  resolveSessionSummaryMinMessages,
  resolveSessionSummaryRefreshIntervalMs,
  resolveSessionSummarySourceWindow,
} from '@/lib/workspace-runtime'
import { resolveMessageRenderingConfigFromSettings, applyMessageRenderingConfigToSettings } from '@/lib/chat-rendering-settings'
import { MessageRenderingSettingsCard } from './MessageRenderingSettingsCard'

export interface SettingsPanelProps {
  settings: SettingsPayload | null
  catalog?: WorkspaceCatalogPayload | null
  activeTab?: 'overview' | 'engines' | 'inventory' | 'context' | 'rendering'
  onActiveTabChange?: (tab: 'overview' | 'engines' | 'inventory' | 'context' | 'rendering') => void
  actionRequest?: SettingsPanelAction
  onActionHandled?: () => void
}

const TAURI_LOCAL_TOKEN = 'tauri-local'

const quickApiOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'kobold', label: 'Kobold' },
  { value: 'koboldhorde', label: 'Kobold Horde' },
  { value: 'textgenerationwebui', label: 'TextGen WebUI' },
  { value: 'novel', label: 'NovelAI' },
] as const

const textgenTypeOptions = [
  { value: 'generic', label: 'generic' },
  { value: 'ooba', label: 'ooba' },
  { value: 'mancer', label: 'mancer' },
  { value: 'tabby', label: 'tabby' },
  { value: 'vllm', label: 'vllm' },
  { value: 'aphrodite', label: 'aphrodite' },
  { value: 'llamacpp', label: 'llamacpp' },
  { value: 'koboldcpp', label: 'koboldcpp' },
  { value: 'ollama', label: 'ollama' },
  { value: 'togetherai', label: 'togetherai' },
  { value: 'infermaticai', label: 'infermaticai' },
  { value: 'huggingface', label: 'huggingface' },
  { value: 'dreamgen', label: 'dreamgen' },
  { value: 'openrouter', label: 'openrouter' },
  { value: 'featherless', label: 'featherless' },
] as const

const providerRouteCapabilities = ['chat', 'embedding', 'rerank', 'image', 'speech'] as const

type ProviderRouteCapability = typeof providerRouteCapabilities[number]
type ProviderRouteProviderKey =
  | 'chatProviderId'
  | 'embeddingProviderId'
  | 'rerankProviderId'
  | 'imageProviderId'
  | 'speechProviderId'
type ProviderRouteModelKey =
  | 'chatCompletionModel'
  | 'narrativeEmbeddingModel'
  | 'rerankModel'
  | 'imageModel'
  | 'speechModel'

type SettingsDraft = {
  activeWorlds: string[]
  amountGen: string
  azureApiVersion: string
  azureDeploymentName: string
  chatCompletionBaseUrl: string
  chatCompletionModel: string
  chatCompletionSource: string
  chatProviderId: string
  embeddingProviderId: string
  hordeModelsText: string
  imageModel: string
  imageProviderId: string
  mainApi: string
  maxContext: string
  narrativeEmbeddingBaseUrl: string
  narrativeEmbeddingEnabled: boolean
  narrativeEmbeddingModel: string
  narrativeEmbeddingSource: string
  messageRendering: ReturnType<typeof resolveMessageRenderingConfigFromSettings>
  novelModel: string
  rerankModel: string
  rerankProviderId: string
  retrievalJobsRetentionPerSource: string
  selectedTextgenPreset: string
  sessionSummaryMinMessages: string
  sessionSummaryRefreshIntervalMs: string
  sessionSummarySourceWindow: string
  speechModel: string
  speechProviderId: string
  textgenModel: string
  textgenServer: string
  textgenType: string
  username: string
}

function resolveTextGenerationSettings(
  settings: AppSettings | null | undefined,
): TextGenerationWebUiSettings {
  const textGenerationSettings = settings?.textgenerationwebui_settings

  return textGenerationSettings && typeof textGenerationSettings === 'object'
    ? textGenerationSettings
    : {}
}

function resolveNovelSettings(settings: AppSettings | null | undefined): NovelAiSettings {
  const novelSettings = settings?.nai_settings

  return novelSettings && typeof novelSettings === 'object' ? novelSettings : {}
}

function resolveTextGenerationType(settings: AppSettings | null | undefined): string {
  const textGenerationSettings = resolveTextGenerationSettings(settings)

  if (typeof textGenerationSettings.type === 'string' && textGenerationSettings.type.trim()) {
    return textGenerationSettings.type.trim()
  }

  return settings?.api_use_mancer_webui ? 'mancer' : 'ooba'
}

function resolveTextGenerationServer(
  settings: AppSettings | null | undefined,
  type: string,
): string {
  const textGenerationSettings = resolveTextGenerationSettings(settings)
  const serverUrls =
    textGenerationSettings.server_urls && typeof textGenerationSettings.server_urls === 'object'
      ? textGenerationSettings.server_urls
      : {}
  const serverValue = serverUrls[type]

  if (typeof serverValue === 'string' && serverValue.trim()) {
    return serverValue.trim()
  }

  return typeof settings?.api_server_textgenerationwebui === 'string'
    ? settings.api_server_textgenerationwebui
    : ''
}

function resolveTextGenerationModel(
  settings: AppSettings | null | undefined,
  type: string,
): string {
  const textGenerationSettings = resolveTextGenerationSettings(settings)

  switch (type) {
    case 'generic':
      return typeof textGenerationSettings.generic_model === 'string'
        ? textGenerationSettings.generic_model
        : ''
    case 'mancer':
      return typeof textGenerationSettings.mancer_model === 'string'
        ? textGenerationSettings.mancer_model
        : ''
    case 'vllm':
      return typeof textGenerationSettings.vllm_model === 'string'
        ? textGenerationSettings.vllm_model
        : ''
    case 'aphrodite':
      return typeof textGenerationSettings.aphrodite_model === 'string'
        ? textGenerationSettings.aphrodite_model
        : ''
    case 'tabby':
      return typeof textGenerationSettings.tabby_model === 'string'
        ? textGenerationSettings.tabby_model
        : ''
    case 'togetherai':
      return typeof textGenerationSettings.togetherai_model === 'string'
        ? textGenerationSettings.togetherai_model
        : ''
    case 'llamacpp':
      return typeof textGenerationSettings.llamacpp_model === 'string'
        ? textGenerationSettings.llamacpp_model
        : ''
    case 'koboldcpp':
      return typeof textGenerationSettings.koboldcpp_model === 'string'
        ? textGenerationSettings.koboldcpp_model
        : ''
    case 'ollama':
      return typeof textGenerationSettings.ollama_model === 'string'
        ? textGenerationSettings.ollama_model
        : ''
    case 'infermaticai':
      return typeof textGenerationSettings.infermaticai_model === 'string'
        ? textGenerationSettings.infermaticai_model
        : ''
    case 'huggingface':
      return typeof textGenerationSettings.huggingface_model === 'string'
        ? textGenerationSettings.huggingface_model
        : ''
    case 'dreamgen':
      return typeof textGenerationSettings.dreamgen_model === 'string'
        ? textGenerationSettings.dreamgen_model
        : ''
    case 'openrouter':
      return typeof textGenerationSettings.openrouter_model === 'string'
        ? textGenerationSettings.openrouter_model
        : ''
    case 'featherless':
      return typeof textGenerationSettings.featherless_model === 'string'
        ? textGenerationSettings.featherless_model
        : ''
    case 'ooba':
      return typeof textGenerationSettings.custom_model === 'string'
        ? textGenerationSettings.custom_model
        : ''
    default:
      return ''
  }
}

function settingString(
  settings: AppSettings | null | undefined,
  key: string,
  nestedKey = key,
): string {
  const rootValue = settings?.[key]
  if (typeof rootValue === 'string' && rootValue.trim()) {
    return rootValue.trim()
  }

  const nested = settings?.oai_settings
  if (nested && typeof nested === 'object') {
    const nestedValue = nested[nestedKey]
    if (typeof nestedValue === 'string' && nestedValue.trim()) {
      return nestedValue.trim()
    }
  }

  return ''
}

function resolveChatCompletionSource(settings: AppSettings | null | undefined): string {
  const source = typeof settings?.chat_completion_source === 'string'
    ? settings.chat_completion_source.trim()
    : ''
  if (source === 'azure_openai' || source === 'openrouter' || source === 'openai') {
    return source
  }
  if (source === 'custom') {
    return 'openai'
  }

  if (typeof settings?.azure_base_url === 'string' && settings.azure_base_url.trim()) {
    return 'azure_openai'
  }

  return 'openai'
}

function resolveChatCompletionBaseUrl(
  settings: AppSettings | null | undefined,
  source: string,
): string {
  if (source === 'azure_openai') {
    if (typeof settings?.azure_base_url === 'string' && settings.azure_base_url.trim()) {
      return settings.azure_base_url
    }

    if (
      settings?.oai_settings &&
      typeof settings.oai_settings === 'object' &&
      typeof settings.oai_settings.azure_base_url === 'string'
    ) {
      return settings.oai_settings.azure_base_url
    }
  }

  if (typeof settings?.reverse_proxy === 'string' && settings.reverse_proxy.trim()) {
    return settings.reverse_proxy
  }

  if (source === 'openai' && typeof settings?.custom_url === 'string' && settings.custom_url.trim()) {
    return settings.custom_url
  }

  return ''
}

function resolveChatCompletionModel(
  settings: AppSettings | null | undefined,
  source: string,
): string {
  if (source === 'azure_openai') {
    if (typeof settings?.azure_openai_model === 'string' && settings.azure_openai_model.trim()) {
      return settings.azure_openai_model
    }

    if (
      settings?.oai_settings &&
      typeof settings.oai_settings === 'object' &&
      typeof settings.oai_settings.azure_openai_model === 'string' &&
      settings.oai_settings.azure_openai_model.trim()
    ) {
      return settings.oai_settings.azure_openai_model
    }
  }

  return typeof settings?.openai_model === 'string' ? settings.openai_model : ''
}

function resolveProviderRouteId(
  settings: AppSettings | null | undefined,
  capability: ProviderRouteCapability,
): string {
  switch (capability) {
    case 'chat':
      return settingString(settings, 'chat_model_provider_id')
    case 'embedding':
      return settingString(settings, 'narrative_embedding_provider_id')
    case 'rerank':
      return settingString(settings, 'rerank_model_provider_id')
    case 'image':
      return settingString(settings, 'image_model_provider_id')
    case 'speech':
      return settingString(settings, 'speech_model_provider_id')
    default:
      return ''
  }
}

function resolveAuxiliaryModel(
  settings: AppSettings | null | undefined,
  key: string,
): string {
  return settingString(settings, key)
}

function resolveAzureDeploymentName(settings: AppSettings | null | undefined): string {
  if (typeof settings?.azure_deployment_name === 'string' && settings.azure_deployment_name.trim()) {
    return settings.azure_deployment_name
  }

  if (
    settings?.oai_settings &&
    typeof settings.oai_settings === 'object' &&
    typeof settings.oai_settings.azure_deployment_name === 'string' &&
    settings.oai_settings.azure_deployment_name.trim()
  ) {
    return settings.oai_settings.azure_deployment_name
  }

  return ''
}

function resolveAzureApiVersion(settings: AppSettings | null | undefined): string {
  if (typeof settings?.azure_api_version === 'string' && settings.azure_api_version.trim()) {
    return settings.azure_api_version
  }

  if (
    settings?.oai_settings &&
    typeof settings.oai_settings === 'object' &&
    typeof settings.oai_settings.azure_api_version === 'string' &&
    settings.oai_settings.azure_api_version.trim()
  ) {
    return settings.oai_settings.azure_api_version
  }

  return '2024-10-21'
}

function resolveNarrativeEmbeddingSource(settings: AppSettings | null | undefined): string {
  const fallbackSource = resolveChatCompletionSource(settings)
  const normalizeSource = (value: string) =>
    value === 'openrouter' || value === 'custom' || value === 'azure_openai' ? value : 'openai'

  if (
    typeof settings?.narrative_embedding_source === 'string' &&
    settings.narrative_embedding_source.trim()
  ) {
    return normalizeSource(settings.narrative_embedding_source.trim())
  }

  if (
    settings?.oai_settings &&
    typeof settings.oai_settings === 'object' &&
    typeof settings.oai_settings.narrative_embedding_source === 'string' &&
    settings.oai_settings.narrative_embedding_source.trim()
  ) {
    return normalizeSource(settings.oai_settings.narrative_embedding_source.trim())
  }

  return normalizeSource(fallbackSource)
}

function resolveNarrativeEmbeddingBaseUrl(
  settings: AppSettings | null | undefined,
  source: string,
): string {
  if (
    typeof settings?.narrative_embedding_base_url === 'string' &&
    settings.narrative_embedding_base_url.trim()
  ) {
    return settings.narrative_embedding_base_url
  }

  if (
    settings?.oai_settings &&
    typeof settings.oai_settings === 'object' &&
    typeof settings.oai_settings.narrative_embedding_base_url === 'string' &&
    settings.oai_settings.narrative_embedding_base_url.trim()
  ) {
    return settings.oai_settings.narrative_embedding_base_url
  }

  return resolveChatCompletionBaseUrl(settings, source)
}

function createDraft(settings: AppSettings | null | undefined): SettingsDraft {
  const textgenType = resolveTextGenerationType(settings)
  const chatCompletionSource = resolveChatCompletionSource(settings)
  const narrativeEmbeddingSource = resolveNarrativeEmbeddingSource(settings)

  return {
    activeWorlds: Array.isArray(settings?.world_names)
      ? settings.world_names.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    amountGen:
      typeof settings?.amount_gen === 'number' || typeof settings?.amount_gen === 'string'
        ? String(settings.amount_gen)
        : '',
    azureApiVersion: resolveAzureApiVersion(settings),
    azureDeploymentName: resolveAzureDeploymentName(settings),
    chatCompletionBaseUrl: resolveChatCompletionBaseUrl(settings, chatCompletionSource),
    chatCompletionModel: resolveChatCompletionModel(settings, chatCompletionSource),
    chatCompletionSource,
    chatProviderId: resolveProviderRouteId(settings, 'chat'),
    embeddingProviderId: resolveProviderRouteId(settings, 'embedding'),
    hordeModelsText: Array.isArray(settings?.horde_settings?.models)
      ? settings.horde_settings.models
          .filter((item): item is string => typeof item === 'string')
          .join('\n')
      : '',
    imageModel: resolveAuxiliaryModel(settings, 'image_model'),
    imageProviderId: resolveProviderRouteId(settings, 'image'),
    mainApi: typeof settings?.main_api === 'string' ? settings.main_api : '',
    maxContext:
      typeof settings?.max_context === 'number' || typeof settings?.max_context === 'string'
        ? String(settings.max_context)
        : '',
    narrativeEmbeddingBaseUrl: resolveNarrativeEmbeddingBaseUrl(settings, narrativeEmbeddingSource),
    narrativeEmbeddingEnabled: Boolean(
      settings?.narrative_embedding_enabled ??
        (settings?.oai_settings && typeof settings.oai_settings === 'object'
          ? settings.oai_settings.narrative_embedding_enabled
          : false),
    ),
    narrativeEmbeddingModel:
      typeof settings?.narrative_embedding_model === 'string' && settings.narrative_embedding_model.trim()
        ? settings.narrative_embedding_model
        : settings?.oai_settings &&
            typeof settings.oai_settings === 'object' &&
            typeof settings.oai_settings.narrative_embedding_model === 'string'
          ? settings.oai_settings.narrative_embedding_model
          : '',
    narrativeEmbeddingSource,
    messageRendering: resolveMessageRenderingConfigFromSettings(settings),
    novelModel:
      typeof resolveNovelSettings(settings).model_novel === 'string'
        ? String(resolveNovelSettings(settings).model_novel)
        : '',
    rerankModel: resolveAuxiliaryModel(settings, 'rerank_model'),
    rerankProviderId: resolveProviderRouteId(settings, 'rerank'),
    retrievalJobsRetentionPerSource: String(resolveRetrievalJobsRetentionPerSource(settings)),
    selectedTextgenPreset:
      typeof settings?.preset_settings === 'string' ? settings.preset_settings : '',
    sessionSummaryMinMessages: String(resolveSessionSummaryMinMessages(settings)),
    sessionSummaryRefreshIntervalMs: String(resolveSessionSummaryRefreshIntervalMs(settings)),
    sessionSummarySourceWindow: String(resolveSessionSummarySourceWindow(settings)),
    speechModel: resolveAuxiliaryModel(settings, 'speech_model'),
    speechProviderId: resolveProviderRouteId(settings, 'speech'),
    textgenModel: resolveTextGenerationModel(settings, textgenType),
    textgenServer: resolveTextGenerationServer(settings, textgenType),
    textgenType,
    username: typeof settings?.username === 'string' ? settings.username : '',
  }
}

function applySavedPresetToSettings(
  settings: AppSettings,
  presetDocument: LibraryDocument | undefined,
): AppSettings {
  if (!presetDocument?.contentText) {
    return settings
  }

  try {
    const parsed = JSON.parse(presetDocument.contentText) as Record<string, unknown>
    const textgenSettings = resolveTextGenerationSettings(settings)

    return {
      ...settings,
      amount_gen:
        typeof parsed.max_tokens === 'number' ? parsed.max_tokens : settings.amount_gen,
      preset_settings: presetDocument.name,
      sysprompt:
        typeof parsed.system_prompt === 'string' && parsed.system_prompt.trim()
          ? {
              ...(settings.sysprompt && typeof settings.sysprompt === 'object'
                ? settings.sysprompt
                : {}),
              enabled: true,
              name: presetDocument.name,
              content: parsed.system_prompt,
            }
          : settings.sysprompt,
      textgenerationwebui_settings: {
        ...textgenSettings,
        temp: typeof parsed.temperature === 'number' ? parsed.temperature : textgenSettings.temp,
        top_p: typeof parsed.top_p === 'number' ? parsed.top_p : textgenSettings.top_p,
        top_k: typeof parsed.top_k === 'number' ? parsed.top_k : textgenSettings.top_k,
        rep_pen:
          typeof parsed.repetition_penalty === 'number'
            ? parsed.repetition_penalty
            : textgenSettings.rep_pen,
      },
    }
  } catch {
    return settings
  }
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

function getCapabilityProviderKey(capability: ProviderRouteCapability): ProviderRouteProviderKey {
  switch (capability) {
    case 'chat':
      return 'chatProviderId'
    case 'embedding':
      return 'embeddingProviderId'
    case 'rerank':
      return 'rerankProviderId'
    case 'image':
      return 'imageProviderId'
    case 'speech':
      return 'speechProviderId'
    default:
      return 'chatProviderId'
  }
}

function getCapabilityModelKey(capability: ProviderRouteCapability): ProviderRouteModelKey {
  switch (capability) {
    case 'chat':
      return 'chatCompletionModel'
    case 'embedding':
      return 'narrativeEmbeddingModel'
    case 'rerank':
      return 'rerankModel'
    case 'image':
      return 'imageModel'
    case 'speech':
      return 'speechModel'
    default:
      return 'chatCompletionModel'
  }
}

function getProviderCapability(
  provider: ModelProviderRecord | null | undefined,
  capability: ProviderRouteCapability,
): ModelProviderCapability | null {
  return provider?.capabilities.find((item) => item.capability === capability && item.enabled) ?? null
}

function getProviderCapabilityModel(
  provider: ModelProviderRecord | null | undefined,
  capability: ProviderRouteCapability,
): string {
  const providerCapability = getProviderCapability(provider, capability)
  return providerCapability?.defaultModel.trim()
    || providerCapability?.models.find((item) => item.trim())?.trim()
    || ''
}

function getCapabilityProviders(
  providers: ModelProviderRecord[],
  capability: ProviderRouteCapability,
): ModelProviderRecord[] {
  return providers.filter((provider) => provider.enabled && Boolean(getProviderCapability(provider, capability)))
}

function getCapabilityModelOptions(
  provider: ModelProviderRecord | null | undefined,
  capability: ProviderRouteCapability,
  selectedModel: string,
): string[] {
  const providerCapability = getProviderCapability(provider, capability)
  return uniqueStrings([
    selectedModel,
    providerCapability?.defaultModel,
    ...(providerCapability?.models ?? []),
  ])
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function createDraftWithProviders(
  settings: AppSettings | null | undefined,
  providers: ModelProviderRecord[],
): SettingsDraft {
  const draft = createDraft(settings)

  for (const capability of providerRouteCapabilities) {
    const providerKey = getCapabilityProviderKey(capability)
    const modelKey = getCapabilityModelKey(capability)
    const providerId = String(draft[providerKey] ?? '')
    const provider = providers.find((item) => item.id === providerId)
    const providerModel = getProviderCapabilityModel(provider, capability)
    if (providerModel) {
      draft[modelKey] = providerModel
    }
  }

  return draft
}

function updateProviderCapabilityDefault(
  capabilities: ModelProviderCapability[],
  capabilityName: ProviderRouteCapability,
  model: string,
): ModelProviderCapability[] {
  const nextModel = model.trim()
  let found = false
  const nextCapabilities = capabilities.map((capability) => {
    if (capability.capability !== capabilityName) {
      return capability
    }

    found = true
    return {
      ...capability,
      defaultModel: nextModel,
      enabled: capability.enabled || Boolean(nextModel),
      models: uniqueStrings([nextModel, ...capability.models]),
    }
  })

  if (!found) {
    nextCapabilities.push({
      capability: capabilityName,
      defaultModel: nextModel,
      enabled: Boolean(nextModel),
      models: nextModel ? [nextModel] : [],
    })
  }

  return nextCapabilities
}

function buildProviderRouteUpdates(
  providers: ModelProviderRecord[],
  draft: SettingsDraft,
): ModelProviderRecord[] {
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]))
  const updates = new Map<string, ModelProviderRecord>()

  for (const capability of providerRouteCapabilities) {
    const providerId = String(draft[getCapabilityProviderKey(capability)] ?? '').trim()
    const model = String(draft[getCapabilityModelKey(capability)] ?? '').trim()
    if (!providerId || !model) {
      continue
    }

    const baseProvider = updates.get(providerId) ?? providerMap.get(providerId)
    if (!baseProvider) {
      continue
    }

    const nextCapabilities = updateProviderCapabilityDefault(
      baseProvider.capabilities,
      capability,
      model,
    )
    const currentCapability = getProviderCapability(baseProvider, capability)
    const unchanged =
      currentCapability?.defaultModel.trim() === model &&
      currentCapability.models.map((item) => item.trim()).includes(model)
    if (unchanged) {
      updates.set(providerId, baseProvider)
      continue
    }

    updates.set(providerId, {
      ...baseProvider,
      capabilities: nextCapabilities,
    })
  }

  return Array.from(updates.values()).filter((provider) => {
    const original = providerMap.get(provider.id)
    return original ? JSON.stringify(original.capabilities) !== JSON.stringify(provider.capabilities) : false
  })
}

function applyProviderRoutesToSettings(
  settings: AppSettings,
  draft: SettingsDraft,
  providers: ModelProviderRecord[],
): AppSettings {
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]))
  const chatProvider = providerMap.get(draft.chatProviderId)
  const embeddingProvider = providerMap.get(draft.embeddingProviderId)
  const chatModel = draft.chatCompletionModel.trim()
  const embeddingModel = draft.narrativeEmbeddingModel.trim()
  const chatSource = chatProvider?.providerType.trim() || draft.chatCompletionSource.trim() || 'openai'
  const embeddingSource = embeddingProvider?.providerType.trim() || draft.narrativeEmbeddingSource.trim() || chatSource
  const chatBaseUrl = chatProvider?.baseUrl.trim() || draft.chatCompletionBaseUrl.trim()
  const embeddingBaseUrl = embeddingProvider?.baseUrl.trim() || draft.narrativeEmbeddingBaseUrl.trim() || chatBaseUrl
  const oaiSettings = settings.oai_settings && typeof settings.oai_settings === 'object'
    ? settings.oai_settings
    : {}

  const nextSettings: AppSettings = {
    ...settings,
    azure_api_version: chatProvider?.apiVersion?.trim() || draft.azureApiVersion.trim() || '2024-10-21',
    azure_base_url: chatSource === 'azure_openai' ? chatBaseUrl : '',
    azure_deployment_name: chatSource === 'azure_openai' ? chatProvider?.deploymentName?.trim() || draft.azureDeploymentName.trim() : '',
    azure_openai_model: chatSource === 'azure_openai' ? chatModel : '',
    chat_completion_source: chatSource,
    chat_model_provider_id: draft.chatProviderId.trim(),
    custom_url: chatSource === 'custom' ? chatBaseUrl : undefined,
    image_model: draft.imageModel.trim(),
    image_model_provider_id: draft.imageProviderId.trim(),
    narrative_embedding_base_url: embeddingBaseUrl,
    narrative_embedding_enabled: draft.narrativeEmbeddingEnabled && Boolean(draft.embeddingProviderId.trim() && embeddingModel),
    narrative_embedding_model: embeddingModel,
    narrative_embedding_provider_id: draft.embeddingProviderId.trim(),
    narrative_embedding_source: embeddingSource,
    openai_model: chatModel || settings.openai_model || '',
    rerank_model: draft.rerankModel.trim(),
    rerank_model_provider_id: draft.rerankProviderId.trim(),
    reverse_proxy: chatSource === 'azure_openai' ? '' : chatBaseUrl,
    speech_model: draft.speechModel.trim(),
    speech_model_provider_id: draft.speechProviderId.trim(),
    oai_settings: {
      ...oaiSettings,
      azure_api_version: chatProvider?.apiVersion?.trim() || draft.azureApiVersion.trim() || '2024-10-21',
      azure_base_url: chatSource === 'azure_openai' ? chatBaseUrl : '',
      azure_deployment_name: chatSource === 'azure_openai' ? chatProvider?.deploymentName?.trim() || draft.azureDeploymentName.trim() : '',
      azure_openai_model: chatSource === 'azure_openai' ? chatModel : '',
      chat_completion_source: chatSource,
      chat_model_provider_id: draft.chatProviderId.trim(),
      custom_url: chatSource === 'custom' ? chatBaseUrl : undefined,
      image_model: draft.imageModel.trim(),
      image_model_provider_id: draft.imageProviderId.trim(),
      narrative_embedding_base_url: embeddingBaseUrl,
      narrative_embedding_enabled: draft.narrativeEmbeddingEnabled && Boolean(draft.embeddingProviderId.trim() && embeddingModel),
      narrative_embedding_model: embeddingModel,
      narrative_embedding_provider_id: draft.embeddingProviderId.trim(),
      narrative_embedding_source: embeddingSource,
      openai_model: chatModel || settings.openai_model || '',
      rerank_model: draft.rerankModel.trim(),
      rerank_model_provider_id: draft.rerankProviderId.trim(),
      reverse_proxy: chatSource === 'azure_openai' ? '' : chatBaseUrl,
      speech_model: draft.speechModel.trim(),
      speech_model_provider_id: draft.speechProviderId.trim(),
    },
  }

  if (chatSource !== 'custom') {
    delete nextSettings.custom_url
    if (nextSettings.oai_settings) {
      delete nextSettings.oai_settings.custom_url
    }
  }

  if (chatSource !== 'azure_openai') {
    delete nextSettings.azure_base_url
    delete nextSettings.azure_deployment_name
    delete nextSettings.azure_openai_model
    if (nextSettings.oai_settings) {
      delete nextSettings.oai_settings.azure_base_url
      delete nextSettings.oai_settings.azure_deployment_name
      delete nextSettings.oai_settings.azure_openai_model
    }
  }

  return applyChatCompletionModelCache(nextSettings, [chatModel, ...getCapabilityModelOptions(chatProvider, 'chat', chatModel)])
}

function providerPayload(provider: ModelProviderRecord) {
  return {
    apiVersion: provider.apiVersion ?? null,
    baseUrl: provider.baseUrl,
    capabilities: provider.capabilities,
    csrfToken: TAURI_LOCAL_TOKEN,
    deploymentName: provider.deploymentName ?? null,
    enabled: provider.enabled,
    id: provider.id,
    name: provider.name,
    notes: provider.notes ?? null,
    protocol: provider.protocol,
    providerType: provider.providerType,
    secretValue: null,
  }
}

export function SettingsPanel({
  settings,
  catalog,
  activeTab,
  onActiveTabChange,
  actionRequest,
  onActionHandled,
}: SettingsPanelProps) {
  const { t } = useI18n()
  const settingsSummary = buildSettingsSummary(settings, t)
  const presetInventory = buildPresetInventory(settings, t, catalog)
  const themesInventory = presetInventory.find((item) => item.label === t('settingsData.inventory.themes'))
  const saveSettingsMutation = useSaveSettingsMutation()
  const saveProviderMutation = useSaveModelProviderMutation()
  const fetchProviderModelsMutation = useModelProviderModelsMutation()
  const chatCompletionStatusMutation = useChatCompletionStatusMutation()
  const textGenerationStatusMutation = useTextGenerationStatusMutation()
  const novelStatusMutation = useNovelStatusMutation()
  const providersQuery = useModelProvidersQuery()
  const worldDocumentsQuery = useLibraryDocumentsQuery('worlds')
  const textgenPresetDocumentsQuery = useLibraryDocumentsQuery('textgenPresets')
  const parsedSettings = settings?.settings ?? null
  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data])
  const [draft, setDraft] = useState<SettingsDraft>(() => createDraftWithProviders(parsedSettings, providers))
  const [saveFeedback, setSaveFeedback] = useState<{
    message: string
    tone: 'error' | 'success'
  } | null>(null)
  const [connectionFeedback, setConnectionFeedback] = useState<{
    message: string
    tone: 'error' | 'success'
  } | null>(null)
  useEffect(() => {
    setDraft(createDraftWithProviders(parsedSettings, providers))
  }, [parsedSettings, providers])

  const routeProviders = useMemo(
    () => Object.fromEntries(
      providerRouteCapabilities.map((capability) => [
        capability,
        getCapabilityProviders(providers, capability),
      ]),
    ) as Record<ProviderRouteCapability, ModelProviderRecord[]>,
    [providers],
  )
  const selectedRouteProviders = useMemo(
    () => Object.fromEntries(
      providerRouteCapabilities.map((capability) => [
        capability,
        providers.find((provider) => provider.id === draft[getCapabilityProviderKey(capability)]),
      ]),
    ) as Record<ProviderRouteCapability, ModelProviderRecord | undefined>,
    [draft, providers],
  )
  const chatRouteSecretQuery = useSecretQuery(
    selectedRouteProviders.chat?.secretKey ?? '',
    Boolean(selectedRouteProviders.chat?.secretKey),
  )
  const embeddingRouteSecretQuery = useSecretQuery(
    selectedRouteProviders.embedding?.secretKey ?? '',
    Boolean(selectedRouteProviders.embedding?.secretKey),
  )
  const rerankRouteSecretQuery = useSecretQuery(
    selectedRouteProviders.rerank?.secretKey ?? '',
    Boolean(selectedRouteProviders.rerank?.secretKey),
  )
  const imageRouteSecretQuery = useSecretQuery(
    selectedRouteProviders.image?.secretKey ?? '',
    Boolean(selectedRouteProviders.image?.secretKey),
  )
  const speechRouteSecretQuery = useSecretQuery(
    selectedRouteProviders.speech?.secretKey ?? '',
    Boolean(selectedRouteProviders.speech?.secretKey),
  )
  const routeSecretValues = useMemo(
    () => new Map(
      [
        [selectedRouteProviders.chat?.secretKey, chatRouteSecretQuery.data],
        [selectedRouteProviders.embedding?.secretKey, embeddingRouteSecretQuery.data],
        [selectedRouteProviders.rerank?.secretKey, rerankRouteSecretQuery.data],
        [selectedRouteProviders.image?.secretKey, imageRouteSecretQuery.data],
        [selectedRouteProviders.speech?.secretKey, speechRouteSecretQuery.data],
      ]
        .filter((entry): entry is [string, string] => (
          typeof entry[0] === 'string' &&
          entry[0].trim().length > 0 &&
          typeof entry[1] === 'string'
        )),
    ),
    [
      chatRouteSecretQuery.data,
      embeddingRouteSecretQuery.data,
      imageRouteSecretQuery.data,
      rerankRouteSecretQuery.data,
      selectedRouteProviders,
      speechRouteSecretQuery.data,
    ],
  )
  const routeModelOptions = useMemo(
    () => Object.fromEntries(
      providerRouteCapabilities.map((capability) => [
        capability,
        getCapabilityModelOptions(
          selectedRouteProviders[capability],
          capability,
          String(draft[getCapabilityModelKey(capability)] ?? ''),
        ),
      ]),
    ) as Record<ProviderRouteCapability, string[]>,
    [draft, selectedRouteProviders],
  )

  const hasChatCompletionApi = draft.mainApi === 'openai'
  const hasHordeApi = draft.mainApi === 'koboldhorde'
  const hasTextGenerationApi = draft.mainApi === 'textgenerationwebui'
  const hasNovelApi = draft.mainApi === 'novel'
  const hordeModelCount = useMemo(
    () =>
      draft.hordeModelsText
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean).length,
    [draft.hordeModelsText],
  )
  const readiness = useMemo(
    () =>
      buildGenerationReadiness(
        draft.mainApi.trim(),
        {
          azureApiVersion: draft.azureApiVersion,
          azureDeploymentName: draft.azureDeploymentName,
          chatCompletionBaseUrl: draft.chatCompletionBaseUrl,
          chatCompletionModel: draft.chatCompletionModel,
          chatCompletionSource: draft.chatCompletionSource,
          hordeModelCount,
          novelModel: draft.novelModel,
          textgenApiServer: draft.textgenServer,
          textgenModel: draft.textgenModel,
          textgenType: draft.textgenType,
        },
        t,
      ),
    [
      draft.azureApiVersion,
      draft.azureDeploymentName,
      draft.chatCompletionBaseUrl,
      draft.chatCompletionModel,
      draft.chatCompletionSource,
      draft.mainApi,
      draft.novelModel,
      draft.textgenModel,
      draft.textgenServer,
      draft.textgenType,
      hordeModelCount,
      t,
    ],
  )
  const worldDocuments = useMemo(() => worldDocumentsQuery.data ?? [], [worldDocumentsQuery.data])
  const textgenPresetDocuments = useMemo(
    () => textgenPresetDocumentsQuery.data ?? [],
    [textgenPresetDocumentsQuery.data],
  )

  async function handleSave() {
    if (!parsedSettings) {
      return
    }

    const maxContext = Number(draft.maxContext)
    const amountGen = Number(draft.amountGen)
    const sessionSummaryMinMessages = Number(draft.sessionSummaryMinMessages)
    const sessionSummaryRefreshIntervalMs = Number(draft.sessionSummaryRefreshIntervalMs)
    const sessionSummarySourceWindow = Number(draft.sessionSummarySourceWindow)
    const retrievalJobsRetentionPerSource = Number(draft.retrievalJobsRetentionPerSource)
    const textgenType = draft.textgenType.trim() || resolveTextGenerationType(parsedSettings)
    const previousTextGenerationSettings = resolveTextGenerationSettings(parsedSettings)
    const nextTextGenerationSettings = applyTextGenerationModel(
      {
        ...previousTextGenerationSettings,
        type: textgenType,
        server_urls: {
          ...(previousTextGenerationSettings.server_urls ?? {}),
          [textgenType]: draft.textgenServer.trim(),
        },
      },
      textgenType,
      draft.textgenModel.trim(),
    )

    let nextSettings = applyProviderRoutesToSettings(
      {
        ...parsedSettings,
        amount_gen:
          Number.isFinite(amountGen) && amountGen > 0 ? amountGen : parsedSettings.amount_gen,
        horde_settings: {
          ...(parsedSettings.horde_settings ?? {}),
          models: draft.hordeModelsText
            .split(/[\r\n,]+/)
            .map((item) => item.trim())
            .filter(Boolean),
        },
        main_api: draft.mainApi.trim() || parsedSettings.main_api || '',
        max_context:
          Number.isFinite(maxContext) && maxContext > 0 ? maxContext : parsedSettings.max_context,
        nai_settings: {
          ...(parsedSettings.nai_settings ?? {}),
          model_novel: draft.novelModel.trim() || resolveNovelSettings(parsedSettings).model_novel || '',
        },
        preset_settings: draft.selectedTextgenPreset.trim(),
        retrieval_jobs_retention_per_source:
          Number.isFinite(retrievalJobsRetentionPerSource) && retrievalJobsRetentionPerSource > 0
            ? Math.trunc(retrievalJobsRetentionPerSource)
            : parsedSettings.retrieval_jobs_retention_per_source,
        session_summary_min_messages:
          Number.isFinite(sessionSummaryMinMessages) && sessionSummaryMinMessages > 0
            ? Math.trunc(sessionSummaryMinMessages)
            : parsedSettings.session_summary_min_messages,
        session_summary_refresh_interval_ms:
          Number.isFinite(sessionSummaryRefreshIntervalMs) && sessionSummaryRefreshIntervalMs > 0
            ? Math.trunc(sessionSummaryRefreshIntervalMs)
            : parsedSettings.session_summary_refresh_interval_ms,
        session_summary_source_window:
          Number.isFinite(sessionSummarySourceWindow) && sessionSummarySourceWindow > 0
            ? Math.trunc(sessionSummarySourceWindow)
            : parsedSettings.session_summary_source_window,
        textgenerationwebui_settings: nextTextGenerationSettings,
        username: draft.username.trim() || parsedSettings.username || '',
        world_names: draft.activeWorlds,
      },
      draft,
      providers,
    )

    nextSettings = applyMessageRenderingConfigToSettings(nextSettings, draft.messageRendering)

    if (Number.isFinite(amountGen) && amountGen > 0) {
      nextSettings = applyGenerationParameterToSettings(nextSettings, 'amount_gen', amountGen)
    }

    nextSettings = applySavedPresetToSettings(
      nextSettings,
      textgenPresetDocuments.find((item) => item.name === draft.selectedTextgenPreset),
    )

    if (draft.textgenServer.trim()) {
      nextSettings.api_server_textgenerationwebui = draft.textgenServer.trim()
    } else {
      delete nextSettings.api_server_textgenerationwebui
    }

    if (textgenType === 'mancer') {
      nextSettings.api_use_mancer_webui = true
    } else {
      delete nextSettings.api_use_mancer_webui
    }

    try {
      setSaveFeedback(null)
      const providerUpdates = buildProviderRouteUpdates(providers, draft)
      await Promise.all(
        providerUpdates.map((provider) => saveProviderMutation.mutateAsync(providerPayload(provider))),
      )
      await saveSettingsMutation.mutateAsync({
        csrfToken: TAURI_LOCAL_TOKEN,
        settings: nextSettings,
      })
      setSaveFeedback({
        message: t('settingsPanel.feedback.saved'),
        tone: 'success',
      })
    } catch (error) {
      setSaveFeedback({
        message: error instanceof Error ? error.message : t('settingsPanel.feedback.saveFailed'),
        tone: 'error',
      })
    }
  }

  async function handleChatCompletionStatusCheck() {
    const provider = selectedRouteProviders.chat
    if (!draft.chatCompletionModel.trim()) {
      setConnectionFeedback({
        message: t('settingsPanel.feedback.fillRouteModel'),
        tone: 'error',
      })
      return
    }

    if (!provider) {
      setConnectionFeedback({
        message: t('settingsPanel.feedback.selectRouteProvider'),
        tone: 'error',
      })
      return
    }

    if (provider.providerType === 'azure_openai' && !provider.baseUrl.trim()) {
      setConnectionFeedback({
        message: t('settingsPanel.feedback.fillRouteBaseUrl'),
        tone: 'error',
      })
      return
    }

    if (provider.providerType === 'azure_openai' && !provider.deploymentName?.trim()) {
      setConnectionFeedback({
        message: t('settingsPanel.feedback.fillAzureDeployment'),
        tone: 'error',
      })
      return
    }

    try {
      const result = await chatCompletionStatusMutation.mutateAsync({
        apiKey: typeof chatRouteSecretQuery.data === 'string' ? chatRouteSecretQuery.data : '',
        apiVersion: provider.apiVersion?.trim() || undefined,
        baseUrl: provider.baseUrl.trim(),
        csrfToken: TAURI_LOCAL_TOKEN,
        deploymentName: provider.deploymentName?.trim() || undefined,
        model: draft.chatCompletionModel.trim(),
        protocol: provider.protocol,
        source: provider.providerType.trim() || 'openai',
      })
      setConnectionFeedback({
        message: t('settingsPanel.feedback.routeCheckSuccess', { message: result.message }),
        tone: 'success',
      })
    } catch (error) {
      setConnectionFeedback({
        message:
          error instanceof Error ? error.message : t('settingsPanel.feedback.routeCheckFailed'),
        tone: 'error',
      })
    }
  }

  async function handleProviderModelsRefresh(capability: ProviderRouteCapability) {
    const provider = selectedRouteProviders[capability]
    const modelKey = getCapabilityModelKey(capability)
    if (!provider) {
      setConnectionFeedback({
        message: t('settingsPanel.feedback.selectProviderForCapability', {
          capability: t(`providersPanel.capabilities.${capability}`),
        }),
        tone: 'error',
      })
      return
    }

    if (provider.providerType === 'azure_openai') {
      setConnectionFeedback({
        message: t('settingsPanel.feedback.azureModelRefreshUnsupported'),
        tone: 'error',
      })
      return
    }

    try {
      const secretValue = routeSecretValues.get(provider.secretKey) ?? ''
      const result = await fetchProviderModelsMutation.mutateAsync({
        apiKey: secretValue,
        apiVersion: provider.apiVersion ?? null,
        baseUrl: provider.baseUrl,
        capability: capability as ModelProviderCapabilityName,
        csrfToken: TAURI_LOCAL_TOKEN,
        deploymentName: provider.deploymentName ?? null,
        protocol: provider.protocol,
        providerType: provider.providerType,
      })
      const nextModels = uniqueStrings(result.models)
      const currentModel = String(draft[modelKey] ?? '').trim()
      const nextDraftModel = currentModel && nextModels.includes(currentModel)
        ? currentModel
        : nextModels[0] ?? currentModel
      await saveProviderMutation.mutateAsync(providerPayload({
        ...provider,
        capabilities: updateProviderCapabilityDefault(provider.capabilities, capability, nextDraftModel),
      }))
      setDraft((current) => ({
        ...current,
        [modelKey]: nextDraftModel,
      }))
      setConnectionFeedback({
        message: t('settingsPanel.feedback.modelsRefreshed', { count: nextModels.length }),
        tone: 'success',
      })
    } catch (error) {
      setConnectionFeedback({
        message: error instanceof Error ? error.message : t('settingsPanel.feedback.modelsRefreshFailed'),
        tone: 'error',
      })
    }
  }

  async function handleTextGenerationStatusCheck() {
    const apiServer = draft.textgenServer.trim()
    const apiType = draft.textgenType.trim() || 'ooba'

    if (!apiServer) {
      setConnectionFeedback({
        message: t('settingsPanel.feedback.fillTextGenAddress'),
        tone: 'error',
      })
      return
    }

    try {
      const result = await textGenerationStatusMutation.mutateAsync({
        apiServer,
        apiType,
        csrfToken: TAURI_LOCAL_TOKEN,
      })
      setConnectionFeedback({
        message: t('settingsPanel.feedback.textGenSuccess', { message: result.message }),
        tone: 'success',
      })
    } catch (error) {
      setConnectionFeedback({
        message: error instanceof Error ? error.message : t('settingsPanel.feedback.textGenFailed'),
        tone: 'error',
      })
    }
  }

  async function handleNovelStatusCheck() {
    try {
      const result = await novelStatusMutation.mutateAsync({ csrfToken: TAURI_LOCAL_TOKEN })
      setConnectionFeedback({
        message: result.message,
        tone: 'success',
      })
    } catch (error) {
      setConnectionFeedback({
        message: error instanceof Error ? error.message : t('settingsPanel.feedback.novelFailed'),
        tone: 'error',
      })
    }
  }

  useEffect(() => {
    if (!actionRequest) {
      return
    }

    if (actionRequest.kind === 'test-connection') {
      if (hasChatCompletionApi) {
        void handleChatCompletionStatusCheck().finally(() => onActionHandled?.())
        return
      }
      if (hasTextGenerationApi) {
        void handleTextGenerationStatusCheck().finally(() => onActionHandled?.())
        return
      }
      if (hasNovelApi) {
        void handleNovelStatusCheck().finally(() => onActionHandled?.())
        return
      }
      onActionHandled?.()
    }
  }, [
    actionRequest,
    hasChatCompletionApi,
    hasNovelApi,
    hasTextGenerationApi,
    onActionHandled,
  ])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card className="py-5 shadow-none">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>{t('settingsPanel.title')}</CardTitle>
              <Badge variant="outline">
                {hasChatCompletionApi
                  ? draft.chatCompletionModel || draft.chatCompletionSource || 'OpenAI'
                  : hasHordeApi
                    ? `Horde ${hordeModelCount}`
                    : hasTextGenerationApi
                      ? draft.textgenType || 'TextGen'
                      : hasNovelApi
                        ? draft.novelModel || 'NovelAI'
                        : draft.mainApi || t('settingsPanel.notSelected')}
              </Badge>
              <Badge variant={readiness.blockers.length > 0 ? 'secondary' : 'outline'}>
                {readiness.blockers.length > 0
                  ? t('settingsPanel.pendingItems', { count: readiness.blockers.length })
                  : t('settingsPanel.readyToSend')}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!parsedSettings || saveSettingsMutation.isPending || saveProviderMutation.isPending}
                onClick={() => void handleSave()}
              >
                {saveSettingsMutation.isPending || saveProviderMutation.isPending
                  ? t('settingsPanel.saving')
                  : t('common.save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saveSettingsMutation.isPending || saveProviderMutation.isPending}
                onClick={() => {
                  setDraft(createDraftWithProviders(parsedSettings, providers))
                  setSaveFeedback(null)
                }}
              >
                {t('common.reset')}
              </Button>
            </div>
          </div>
          <CardDescription>{readiness.summary}</CardDescription>
        </CardHeader>
        {(saveFeedback || connectionFeedback) ? (
          <CardContent className="flex flex-col gap-3">
            {saveFeedback ? (
              <Alert variant={saveFeedback.tone === 'error' ? 'destructive' : 'default'}>
                <AlertTitle>
                  {saveFeedback.tone === 'error'
                    ? t('settingsPanel.saveFailedTitle')
                    : t('settingsPanel.saveSuccessTitle')}
                </AlertTitle>
                <AlertDescription>{saveFeedback.message}</AlertDescription>
              </Alert>
            ) : null}
            {connectionFeedback ? (
              <Alert variant={connectionFeedback.tone === 'error' ? 'destructive' : 'default'}>
                <AlertTitle>
                  {connectionFeedback.tone === 'error'
                    ? t('settingsPanel.connectionFailedTitle')
                    : t('settingsPanel.connectionSuccessTitle')}
                </AlertTitle>
                <AlertDescription>{connectionFeedback.message}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      <Tabs
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        defaultValue="overview"
        value={activeTab}
        onValueChange={(value) => onActiveTabChange?.(value as 'overview' | 'engines' | 'inventory' | 'context' | 'rendering')}
      >
        <TabsList className="w-full justify-start rounded-sm" variant="line">
          <TabsTrigger value="overview">{t('settingsPanel.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="engines">{t('settingsPanel.tabs.connections')}</TabsTrigger>
          <TabsTrigger value="inventory">{t('settingsPanel.tabs.inventory')}</TabsTrigger>
          <TabsTrigger value="context">{t('settingsPanel.tabs.context')}</TabsTrigger>
          <TabsTrigger value="rendering">{t('settingsPanel.tabs.rendering')}</TabsTrigger>
        </TabsList>

        <TabsContent className="min-h-0 flex-1 overflow-hidden" value="overview">
          <ScrollArea className="h-full rounded-sm">
            <div className="grid gap-4 pr-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Card className="py-5 shadow-none">
                <CardHeader className="gap-2">
                  <CardTitle>{t('settingsPanel.overview.basicsTitle')}</CardTitle>
                  <CardDescription>{t('settingsPanel.overview.basicsDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="settings-textgen-preset">{t('settingsPanel.fields.textgenPreset')}</FieldLabel>
                      <FieldContent>
                        <Select
                          value={draft.selectedTextgenPreset || '__none__'}
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              selectedTextgenPreset: value === '__none__' ? '' : value,
                            }))
                          }
                        >
                          <SelectTrigger className="w-full" id="settings-textgen-preset">
                            <SelectValue placeholder={t('settingsPanel.placeholders.selectTextgenPreset')} />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectGroup>
                              <SelectItem value="__none__">{t('settingsPanel.notSelected')}</SelectItem>
                              {textgenPresetDocuments.map((document) => (
                                <SelectItem key={document.name} value={document.name}>
                                  {document.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="settings-username">{t('settingsPanel.fields.username')}</FieldLabel>
                      <FieldContent>
                        <Input
                          id="settings-username"
                          value={draft.username}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, username: event.target.value }))
                          }
                        />
                      </FieldContent>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="settings-main-api">{t('settingsPanel.fields.mainApi')}</FieldLabel>
                      <FieldContent>
                        <Select
                          value={draft.mainApi}
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              mainApi: value,
                            }))
                          }
                        >
                          <SelectTrigger className="w-full" id="settings-main-api">
                            <SelectValue placeholder={t('settingsPanel.placeholders.selectMainApi')} />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectGroup>
                              {quickApiOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="settings-max-context">{t('settingsPanel.fields.maxContext')}</FieldLabel>
                        <FieldContent>
                          <Input
                            id="settings-max-context"
                            inputMode="numeric"
                            value={draft.maxContext}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, maxContext: event.target.value }))
                            }
                          />
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="settings-amount-gen">{t('settingsPanel.fields.amountGen')}</FieldLabel>
                        <FieldContent>
                          <Input
                            id="settings-amount-gen"
                            inputMode="numeric"
                            value={draft.amountGen}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, amountGen: event.target.value }))
                            }
                          />
                        </FieldContent>
                      </Field>
                    </div>
                  </FieldGroup>
                </CardContent>
              </Card>

              <Card className="py-5 shadow-none">
                <CardHeader className="gap-2">
                  <CardTitle>{t('settingsPanel.overview.statusTitle')}</CardTitle>
                  <CardDescription>{t('settingsPanel.overview.statusDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card className="py-4 shadow-none">
                      <CardHeader className="gap-1">
                        <CardDescription>{t('settingsPanel.fields.username')}</CardDescription>
                        <CardTitle className="text-sm font-medium">{settingsSummary[0]?.value ?? t('common.unconfigured')}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="py-4 shadow-none">
                      <CardHeader className="gap-1">
                        <CardDescription>{t('settingsPanel.fields.mainApi')}</CardDescription>
                        <CardTitle className="text-sm font-medium">{settingsSummary[1]?.value ?? t('common.unconfigured')}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="py-4 shadow-none">
                      <CardHeader className="gap-1">
                        <CardDescription>{t('settingsPanel.theme')}</CardDescription>
                        <CardTitle className="text-sm font-medium">
                          {themesInventory?.value ?? '0'}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>

                  <Card className="py-4 shadow-none">
                    <CardHeader className="gap-2">
                      <CardDescription>{t('settingsPanel.preflight')}</CardDescription>
                      <CardTitle className="text-sm font-medium leading-6">{readiness.summary}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {readiness.blockers.length > 0 ? (
                        <div className="grid gap-2">
                          {readiness.blockers.map((blocker) => (
                            <div className="rounded-sm border border-dashed px-3 py-2 text-sm" key={blocker}>
                              {blocker}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-sm border px-3 py-2 text-sm">
                          {t('settingsPanel.readyDescription')}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="py-4 shadow-none">
                    <CardHeader className="gap-2">
                      <CardDescription>{t('settingsPanel.inventory.activeLorebooks')}</CardDescription>
                      <CardTitle className="text-sm font-medium leading-6">
                        {draft.activeWorlds.length > 0
                          ? draft.activeWorlds.join(', ')
                          : t('settingsPanel.notSelected')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2 pt-0">
                      {worldDocuments.length > 0 ? (
                        worldDocuments.map((document) => {
                          const checked = draft.activeWorlds.includes(document.name)
                          return (
                            <label className="flex items-center gap-2 text-sm" key={document.name}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(nextChecked) =>
                                  setDraft((current) => ({
                                    ...current,
                                    activeWorlds: nextChecked
                                      ? [...current.activeWorlds, document.name]
                                      : current.activeWorlds.filter((item) => item !== document.name),
                                  }))
                                }
                              />
                              <span>{document.name}</span>
                            </label>
                          )
                        })
                      ) : (
                        <div className="rounded-sm border px-3 py-2 text-sm">
                          {t('sectionBrowser.empty.lorebooks.description')}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent className="min-h-0 flex-1 overflow-hidden" value="engines">
          <ScrollArea className="h-full rounded-sm">
            <div className="grid gap-4 pr-3">
              <Card className="py-5 shadow-none">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{t('settingsPanel.connections.modelRoutesTitle')}</CardTitle>
                      <CardDescription>{t('settingsPanel.connections.modelRoutesDescription')}</CardDescription>
                    </div>
                    <Badge variant={providersQuery.isPending ? 'secondary' : 'outline'}>
                      {t('settingsPanel.connections.providersCount', { count: providers.length })}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <ProviderRouteField
                    badgeVariant={hasChatCompletionApi ? 'default' : 'outline'}
                    capability="chat"
                    draft={draft}
                    modelOptions={routeModelOptions.chat}
                    onProviderModelsRefresh={handleProviderModelsRefresh}
                    providers={routeProviders.chat}
                    refreshPending={fetchProviderModelsMutation.isPending || saveProviderMutation.isPending}
                    selectedProvider={selectedRouteProviders.chat}
                    setDraft={setDraft}
                    t={t}
                  />
                  <ProviderRouteField
                    capability="embedding"
                    draft={draft}
                    modelOptions={routeModelOptions.embedding}
                    onProviderModelsRefresh={handleProviderModelsRefresh}
                    providers={routeProviders.embedding}
                    refreshPending={fetchProviderModelsMutation.isPending || saveProviderMutation.isPending}
                    selectedProvider={selectedRouteProviders.embedding}
                    setDraft={setDraft}
                    t={t}
                  />
                  <ProviderRouteField
                    capability="rerank"
                    draft={draft}
                    modelOptions={routeModelOptions.rerank}
                    onProviderModelsRefresh={handleProviderModelsRefresh}
                    providers={routeProviders.rerank}
                    refreshPending={fetchProviderModelsMutation.isPending || saveProviderMutation.isPending}
                    selectedProvider={selectedRouteProviders.rerank}
                    setDraft={setDraft}
                    t={t}
                  />
                  <div className="grid gap-3 xl:grid-cols-2">
                    <ProviderRouteField
                      capability="image"
                      draft={draft}
                      modelOptions={routeModelOptions.image}
                      onProviderModelsRefresh={handleProviderModelsRefresh}
                      providers={routeProviders.image}
                      refreshPending={fetchProviderModelsMutation.isPending || saveProviderMutation.isPending}
                      selectedProvider={selectedRouteProviders.image}
                      setDraft={setDraft}
                      t={t}
                    />
                    <ProviderRouteField
                      capability="speech"
                      draft={draft}
                      modelOptions={routeModelOptions.speech}
                      onProviderModelsRefresh={handleProviderModelsRefresh}
                      providers={routeProviders.speech}
                      refreshPending={fetchProviderModelsMutation.isPending || saveProviderMutation.isPending}
                      selectedProvider={selectedRouteProviders.speech}
                      setDraft={setDraft}
                      t={t}
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-sm border border-border/60 px-3 py-2 text-sm">
                    <Checkbox
                      checked={draft.narrativeEmbeddingEnabled}
                      onCheckedChange={(checked) =>
                        setDraft((current) => ({
                          ...current,
                          narrativeEmbeddingEnabled: checked === true,
                        }))
                      }
                    />
                    <span>{t('settingsPanel.connections.narrativeEmbeddingToggle')}</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={chatCompletionStatusMutation.isPending || chatRouteSecretQuery.isLoading || !selectedRouteProviders.chat}
                      onClick={() => void handleChatCompletionStatusCheck()}
                    >
                      {chatCompletionStatusMutation.isPending
                        ? t('settingsPanel.checking')
                        : t('settingsPanel.testRoute')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card className="py-5 shadow-none">
                  <CardHeader className="gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{t('settingsPanel.connections.textgenTitle')}</CardTitle>
                      <Badge variant={hasTextGenerationApi ? 'default' : 'outline'}>
                        {draft.textgenType || 'ooba'}
                      </Badge>
                    </div>
                    <CardDescription>{t('settingsPanel.connections.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="settings-textgen-type">{t('settingsPanel.connections.apiType')}</FieldLabel>
                        <FieldContent>
                          <Select
                            value={draft.textgenType}
                            onValueChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                textgenType: value,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full" id="settings-textgen-type">
                              <SelectValue placeholder={t('settingsPanel.placeholders.selectTextGenType')} />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              <SelectGroup>
                                {textgenTypeOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="settings-textgen-server">{t('settingsPanel.connections.apiServer')}</FieldLabel>
                        <FieldContent>
                          <Input
                            id="settings-textgen-server"
                            placeholder={t('settingsPanel.placeholders.textGenServer')}
                            value={draft.textgenServer}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                textgenServer: event.target.value,
                              }))
                            }
                          />
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="settings-textgen-model">{t('settingsPanel.connections.modelAlias')}</FieldLabel>
                        <FieldContent>
                          <Input
                            id="settings-textgen-model"
                            placeholder={t('settingsPanel.placeholders.fillByCurrentType')}
                            value={draft.textgenModel}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                textgenModel: event.target.value,
                              }))
                            }
                          />
                        </FieldContent>
                      </Field>
                    </FieldGroup>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={textGenerationStatusMutation.isPending}
                        onClick={() => void handleTextGenerationStatusCheck()}
                      >
                        {textGenerationStatusMutation.isPending
                          ? t('settingsPanel.checking')
                          : t('settingsPanel.testTextGen')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="py-5 shadow-none">
                  <CardHeader className="gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{t('settingsPanel.connections.novelHordeTitle')}</CardTitle>
                      <Badge variant={hasNovelApi ? 'default' : 'outline'}>
                        {draft.novelModel || t('settingsPanel.inventory.hordeModelsCount', { count: hordeModelCount })}
                      </Badge>
                    </div>
                    <CardDescription>{t('settingsPanel.inventory.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <Field>
                      <FieldLabel htmlFor="settings-novel-model">{t('settingsPanel.inventory.novelModel')}</FieldLabel>
                      <FieldContent>
                        <Input
                          id="settings-novel-model"
                          placeholder={t('settingsPanel.placeholders.novelModelExample')}
                          value={draft.novelModel}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              novelModel: event.target.value,
                            }))
                          }
                        />
                      </FieldContent>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="settings-horde-models">{t('settingsPanel.inventory.hordeModels')}</FieldLabel>
                      <FieldContent>
                        <Textarea
                          id="settings-horde-models"
                          rows={6}
                          value={draft.hordeModelsText}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              hordeModelsText: event.target.value,
                            }))
                          }
                          placeholder={t('settingsPanel.placeholders.oneModelPerLine')}
                        />
                      </FieldContent>
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={novelStatusMutation.isPending}
                        onClick={() => void handleNovelStatusCheck()}
                      >
                        {novelStatusMutation.isPending ? t('settingsPanel.checking') : t('settingsPanel.testNovel')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent className="min-h-0 flex-1 overflow-hidden" value="inventory">
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card className="py-5 shadow-none">
              <CardHeader className="gap-2">
                <CardTitle>{t('settingsPanel.inventory.summaryTitle')}</CardTitle>
                <CardDescription>{t('settingsWorkspace.countItems', { count: settingsSummary.length })}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {settingsSummary.map((item) => (
                  <Card className="py-4 shadow-none" key={item.label}>
                    <CardHeader className="gap-1">
                      <CardDescription>{item.label}</CardDescription>
                      <CardTitle className="text-sm font-medium">{item.value}</CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-col py-5 shadow-none">
              <CardHeader className="gap-2">
                <CardTitle>{t('settingsPanel.inventory.presetsTitle')}</CardTitle>
                <CardDescription>{t('settingsWorkspace.countGroups', { count: presetInventory.length })}</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1">
                <ScrollArea className="h-full rounded-lg border">
                  <div className="grid gap-3 p-3 sm:grid-cols-2">
                    {presetInventory.map((item) => (
                      <Card className="py-4 shadow-none" key={item.label}>
                        <CardHeader className="gap-1">
                          <CardDescription>{item.label}</CardDescription>
                          <CardTitle className="text-sm font-medium">{item.value}</CardTitle>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent className="min-h-0 flex-1 overflow-hidden" value="context">
          <ScrollArea className="h-full rounded-sm">
            <div className="grid gap-4 pr-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <Card className="py-5 shadow-none">
                <CardHeader className="gap-2">
                  <CardTitle>{t('settingsPanel.context.summaryPolicyTitle')}</CardTitle>
                  <CardDescription>{t('settingsPanel.context.summaryPolicyDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="settings-summary-min-messages">
                          {t('settingsPanel.context.summaryMinMessages')}
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id="settings-summary-min-messages"
                            inputMode="numeric"
                            placeholder={t('settingsPanel.placeholders.summaryMinMessages')}
                            value={draft.sessionSummaryMinMessages}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                sessionSummaryMinMessages: event.target.value,
                              }))
                            }
                          />
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="settings-summary-source-window">
                          {t('settingsPanel.context.summarySourceWindow')}
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id="settings-summary-source-window"
                            inputMode="numeric"
                            placeholder={t('settingsPanel.placeholders.summarySourceWindow')}
                            value={draft.sessionSummarySourceWindow}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                sessionSummarySourceWindow: event.target.value,
                              }))
                            }
                          />
                        </FieldContent>
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel htmlFor="settings-summary-refresh-interval">
                        {t('settingsPanel.context.summaryRefreshInterval')}
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="settings-summary-refresh-interval"
                          inputMode="numeric"
                          placeholder={t('settingsPanel.placeholders.summaryRefreshInterval')}
                          value={draft.sessionSummaryRefreshIntervalMs}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              sessionSummaryRefreshIntervalMs: event.target.value,
                            }))
                          }
                        />
                      </FieldContent>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>

              <Card className="py-5 shadow-none">
                <CardHeader className="gap-2">
                  <CardTitle>{t('settingsPanel.context.retrievalPolicyTitle')}</CardTitle>
                  <CardDescription>{t('settingsPanel.context.retrievalPolicyDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="settings-retrieval-retention">
                        {t('settingsPanel.context.retrievalJobsRetention')}
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="settings-retrieval-retention"
                          inputMode="numeric"
                          placeholder={t('settingsPanel.placeholders.retrievalJobsRetention')}
                          value={draft.retrievalJobsRetentionPerSource}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              retrievalJobsRetentionPerSource: event.target.value,
                            }))
                          }
                        />
                      </FieldContent>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent className="min-h-0 flex-1 overflow-hidden" value="rendering">
          <ScrollArea className="h-full rounded-sm">
            <div className="grid gap-4 pr-3">
              <MessageRenderingSettingsCard
                value={draft.messageRendering}
                onChange={(messageRendering) =>
                  setDraft((current) => ({
                    ...current,
                    messageRendering,
                  }))
                }
              />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface ProviderRouteFieldProps {
  badgeVariant?: 'default' | 'outline' | 'secondary'
  capability: ProviderRouteCapability
  draft: SettingsDraft
  modelOptions: string[]
  onProviderModelsRefresh: (capability: ProviderRouteCapability) => void
  providers: ModelProviderRecord[]
  refreshPending: boolean
  selectedProvider?: ModelProviderRecord
  setDraft: Dispatch<SetStateAction<SettingsDraft>>
  t: (key: string, params?: Record<string, string | number>) => string
}

function ProviderRouteField({
  badgeVariant = 'outline',
  capability,
  draft,
  modelOptions,
  onProviderModelsRefresh,
  providers,
  refreshPending,
  selectedProvider,
  setDraft,
  t,
}: ProviderRouteFieldProps) {
  const providerKey = getCapabilityProviderKey(capability)
  const modelKey = getCapabilityModelKey(capability)
  const providerValue = String(draft[providerKey] ?? '')
  const modelValue = String(draft[modelKey] ?? '')

  return (
    <div className="rounded-sm border border-[rgba(194,154,89,0.14)] bg-[rgba(255,245,222,0.025)] p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-100">
              {t(`settingsPanel.modelRoutes.${capability}`)}
            </h3>
            <Badge className="rounded-sm" variant={badgeVariant}>
              {selectedProvider?.providerType ?? t('common.unconfigured')}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-400/80">
            {selectedProvider
              ? `${selectedProvider.name} · ${selectedProvider.protocol}`
              : t('settingsPanel.modelRoutes.unassigned')}
          </p>
        </div>
        <Button
          size="icon-sm"
          type="button"
          variant="outline"
          disabled={refreshPending || !selectedProvider}
          onClick={() => onProviderModelsRefresh(capability)}
          title={t('settingsPanel.refreshModels')}
        >
          <RefreshCcwIcon className={`size-4 ${refreshPending ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Field>
          <FieldLabel htmlFor={`settings-provider-${capability}`}>
            {t('settingsPanel.modelRoutes.provider')}
          </FieldLabel>
          <FieldContent>
            <Select
              value={providerValue || '__none__'}
              onValueChange={(value) => {
                const nextProviderId = value === '__none__' ? '' : value
                const nextProvider = providers.find((provider) => provider.id === nextProviderId)
                const nextModel = nextProvider
                  ? getProviderCapabilityModel(nextProvider, capability)
                  : ''
                setDraft((current) => ({
                  ...current,
                  [providerKey]: nextProviderId,
                  [modelKey]: nextModel,
                }))
              }}
            >
              <SelectTrigger className="w-full" id={`settings-provider-${capability}`}>
                <SelectValue placeholder={t('settingsPanel.modelRoutes.selectProvider')} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value="__none__">{t('settingsPanel.notSelected')}</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor={`settings-model-${capability}`}>
            {t('settingsPanel.modelRoutes.model')}
          </FieldLabel>
          <FieldContent>
            <Select
              value={modelValue || '__none__'}
              onValueChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  [modelKey]: value === '__none__' ? '' : value,
                }))
              }}
            >
              <SelectTrigger className="w-full" id={`settings-model-${capability}`}>
                <SelectValue placeholder={t('settingsPanel.modelRoutes.selectModel')} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value="__none__">{t('settingsPanel.notSelected')}</SelectItem>
                  {modelOptions.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
      </div>
    </div>
  )
}
