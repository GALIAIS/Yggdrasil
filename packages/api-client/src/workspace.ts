import { fetchAuthBootstrap, type AuthBootstrap } from './auth.ts'
import { isTauriDesktop, tauriInvoke } from './tauri.ts'

export type AppSettings = Record<string, unknown> & {
  amount_gen?: number
  azure_api_version?: string
  azure_base_url?: string
  azure_deployment_name?: string
  azure_openai_model?: string
  currentVersion?: string
  chat_completion_source?: string
  chat_completion_model_names?: string[]
  context?: ContextSettings
  custom_stopping_strings?: string
  custom_exclude_body?: string
  custom_include_body?: string
  custom_include_headers?: string
  custom_prompt_post_processing?: string
  custom_url?: string
  enable_web_search?: boolean
  app_log_level?: 'error' | 'warn' | 'info' | 'debug' | 'trace'
  app_log_categories?: string[]
  app_log_capture_payloads?: boolean
  app_log_capture_network_bodies?: boolean
  app_log_max_file_size_mb?: number
  app_log_max_archives?: number
  freq_pen_openai?: number
  main_api?: string
  max_context?: number
  message_rendering?: unknown
  n?: number
  narrative_embedding_base_url?: string
  narrative_embedding_enabled?: boolean
  narrative_embedding_model?: string
  narrative_embedding_source?: string
  openai_max_tokens?: number
  openai_model?: string
  pres_pen_openai?: number
  proxy_password?: string
  request_image_aspect_ratio?: string
  request_image_resolution?: string
  request_images?: boolean
  reasoning_effort_openai?: string
  reverse_proxy?: string
  retrieval_jobs_retention_per_source?: number
  session_summary_min_messages?: number
  session_summary_refresh_interval_ms?: number
  session_summary_source_window?: number
  show_thoughts?: boolean
  stream_openai?: boolean
  swipes?: boolean
  temp_openai?: number
  top_p_openai?: number
  username?: string
  api_server_textgenerationwebui?: string
  api_use_mancer_webui?: boolean
  kai_settings?: KaiSettings
  horde_settings?: HordeSettings
  instruct?: InstructSettings
  nai_settings?: NovelAiSettings
  oai_settings?: Record<string, unknown> & {
    chat_completion_source?: string
    chat_completion_model_names?: string[]
    custom_url?: string
    freq_pen_openai?: number
    narrative_embedding_base_url?: string
    narrative_embedding_enabled?: boolean
    narrative_embedding_model?: string
    narrative_embedding_source?: string
    openai_model?: string
    openai_max_tokens?: number
    pres_pen_openai?: number
    reasoning_effort_openai?: string
    reverse_proxy?: string
    stream_openai?: boolean
    temp_openai?: number
    top_p_openai?: number
  }
  preset_settings?: string
  reasoning?: ReasoningSettings
  sysprompt?: SyspromptSettings
  textgenerationwebui_settings?: TextGenerationWebUiSettings
}

export type ContextSettings = Record<string, unknown> & {
  names_as_stop_strings?: boolean
  preset?: string
  use_stop_strings?: boolean
}

export type InstructSettings = Record<string, unknown> & {
  enabled?: boolean
  preset?: string
  sequences_as_stop_strings?: boolean
  stop_sequence?: string
}

export type ReasoningSettings = Record<string, unknown> & {
  add_to_prompts?: boolean
  name?: string
}

export type SyspromptSettings = Record<string, unknown> & {
  content?: string
  enabled?: boolean
  name?: string
}

export type ChatCompletionMessage = {
  content: string
  role: 'assistant' | 'system' | 'user'
}

export type NarrativeTaskKind =
  | 'chat_reply'
  | 'draft_assist'
  | 'summarize_memory'
  | 'structured_state_update'
  | 'retrieval_query_rewrite'

export type StructuredSchemaId =
  | 'memory_extraction'
  | 'relationship_delta'
  | 'story_suggestion'
  | 'world_state_update'

export type NarrativeMemoryRecord = {
  content: string
  importance: number
  kind: string
  tags: string[]
}

export type NarrativeMemoryExtractionPayload = {
  csrfToken: string
  messages: ChatCompletionMessage[]
  settings: AppSettings
  signal?: AbortSignal
  traceContext?: TraceContextPayload
}

export type NarrativeMemoryExtractionResult = {
  candidate_memories: NarrativeMemoryRecord[]
  open_threads: string[]
  stored_count: number
  summary: string
}

export type NarrativeMemoryEntry = NarrativeMemoryRecord & {
  characterName: string
  createdAt: number
  fileName?: string
  id: string
  summary: string
  updatedAt: number
}

export type NarrativeMemoryCandidateEntry = NarrativeMemoryRecord & {
  characterName: string
  createdAt: number
  domain: string
  fileName?: string
  id: string
  sourceSessionId?: string
  status: string
  summary: string
  updatedAt: number
}

export type NarrativeMemoryHitEntry = {
  createdAt: number
  hitScore: number
  id: number
  memoryId: string
  queryText: string
  sessionId?: string
}

export type NarrativeMemoryQueryPayload = {
  avatarUrl?: string
  csrfToken: string
  fileName?: string
  limit?: number
  query?: string
  signal?: AbortSignal
}

export type NarrativeMemoryRetrievePayload = NarrativeMemoryQueryPayload & {
  settings: AppSettings
}

export type NarrativeMemoryHitsPayload = NarrativeMemoryQueryPayload

export type ReviewNarrativeMemoryCandidatePayload = {
  action: 'approve' | 'reject'
  candidateId: string
  csrfToken: string
  signal?: AbortSignal
}

export type NarrativeMemoryMutationPayload = {
  avatarUrl?: string
  candidateId?: string
  csrfToken: string
  fileName?: string
  memoryId?: string
  query?: string
  signal?: AbortSignal
}

export type LorebookSnippet = {
  bookName: string
  content: string
  keys: string[]
  score: number
}

export type CharacterSnippet = {
  characterName: string
  content: string
  score: number
}

export type SessionSnippet = {
  content: string
  ordinal: number
  role: string
  score: number
}

export type RetrievalHitSummary = {
  domain: string
  hitId: string
  score: number
}

export type WorldStateSnippet = {
  category: string
  detail: string
  entity: string
  status: string
}

export type SessionSummary = {
  avatarUrl?: string
  content: string
  fileName?: string
  id: string
  sourceSignature?: string
  sourceMessageEnd?: number
  sourceMessageStart?: number
  summaryKind: 'open_loops' | 'relationship' | 'scene' | 'session'
  updatedAt: number
}

export type RetrievalJobEntry = {
  createdAt: number
  detailJson: string
  id: string
  sourceId: string
  sourceType: string
  status: string
  updatedAt: number
}

export type SessionSummariesPayload = {
  avatarUrl?: string
  csrfToken: string
  fileName?: string
  signal?: AbortSignal
}

export type SaveSessionSummaryPayload = {
  avatarUrl?: string
  content: string
  csrfToken: string
  fileName?: string
  id?: string
  signal?: AbortSignal
  sourceSignature?: string
  sourceMessageEnd?: number
  sourceMessageStart?: number
  summaryKind: 'open_loops' | 'relationship' | 'scene' | 'session'
}

export type DeleteSessionSummaryPayload = {
  avatarUrl?: string
  csrfToken: string
  fileName?: string
  id?: string
  signal?: AbortSignal
}

export type RetrievalHitEntry = {
  createdAt: number
  hitDomain: string
  hitId: string
  id: number
  queryText: string
  score: number
}

export type GenerationContextPayload = {
  activeWorldNames?: string[]
  avatarUrl?: string
  csrfToken: string
  fileName?: string
  query?: string
  settings: AppSettings
  signal?: AbortSignal
}

export type RetrievalJobsPayload = {
  csrfToken: string
  fileName?: string
  limit?: number
  signal?: AbortSignal
}

export type RetrievalHitsPayload = {
  csrfToken: string
  limit?: number
  queryText?: string
  signal?: AbortSignal
}

export type GenerationContextResult = {
  characterSnippets: CharacterSnippet[]
  directiveSnippets: DirectiveSnippet[]
  lorebookSnippets: LorebookSnippet[]
  narrativeMemories: NarrativeMemoryEntry[]
  retrievalHits: RetrievalHitSummary[]
  sessionSnippets: SessionSnippet[]
  worldStateSnippets: WorldStateSnippet[]
}

export type DirectiveSnippet = {
  content: string
  label: string
  sourceName: string
}

export type KaiSettings = Record<string, unknown> & {
  api_server?: string
  grammar?: string
  min_p?: number
  mirostat?: number
  mirostat_eta?: number
  mirostat_tau?: number
  rep_pen?: number
  rep_pen_range?: number
  rep_pen_slope?: number
  sampler_order?: number[]
  seed?: number
  streaming_kobold?: boolean
  temp?: number
  tfs?: number
  top_a?: number
  top_k?: number
  top_p?: number
  typical?: number
  use_default_badwordsids?: boolean
}

export type HordeSettings = Record<string, unknown> & {
  auto_adjust_context_length?: boolean
  auto_adjust_response_length?: boolean
  models?: string[]
  trusted_workers_only?: boolean
}

export type TextGenerationWebUiSettings = Record<string, unknown> & {
  add_bos_token?: boolean
  aphrodite_model?: string
  ban_eos_token?: boolean
  custom_model?: string
  do_sample?: boolean
  dreamgen_model?: string
  dry_allowed_length?: number
  dry_base?: number
  dry_multiplier?: number
  dry_penalty_last_n?: number
  dry_sequence_breakers?: string
  dynatemp?: boolean
  dynatemp_exponent?: number
  early_stopping?: boolean
  featherless_model?: string
  freq_pen?: number
  generic_model?: string
  grammar_string?: string
  guidance_scale?: number
  ignore_eos_token?: boolean
  include_reasoning?: boolean
  infermaticai_model?: string
  json_schema?: Record<string, unknown> | null
  huggingface_model?: string
  koboldcpp_model?: string
  llamacpp_model?: string
  mancer_model?: string
  max_temp?: number
  min_keep?: number
  min_length?: number
  min_p?: number
  min_temp?: number
  mirostat_eta?: number
  mirostat_mode?: number
  mirostat_tau?: number
  n?: number
  negative_prompt?: string
  nsgima?: number
  nsigma?: number
  ollama_model?: string
  openrouter_allow_fallbacks?: boolean
  openrouter_model?: string
  openrouter_providers?: string[]
  openrouter_quantizations?: string[]
  presence_pen?: number
  rep_pen?: number
  rep_pen_decay?: number
  rep_pen_range?: number
  rep_pen_slope?: number
  sampler_order?: number[]
  sampler_priority?: number[]
  samplers?: string[]
  samplers_priorities?: string[]
  seed?: number
  server_urls?: Record<string, string>
  skip_special_tokens?: boolean
  smoothing_curve?: number
  smoothing_factor?: number
  spaces_between_special_tokens?: boolean
  speculative_ngram?: boolean
  tabby_model?: string
  temp?: number
  temperature_last?: boolean
  tfs?: number
  togetherai_model?: string
  top_a?: number
  top_k?: number
  top_p?: number
  type?: string
  typical_p?: number
  vllm_model?: string
  xtc_probability?: number
  xtc_threshold?: number
}

export type NovelAiSettings = Record<string, unknown> & {
  banned_tokens?: string
  math1_quad?: number
  math1_quad_entropy_scale?: number
  math1_temp?: number
  min_length?: number
  min_p?: number
  mirostat_lr?: number
  mirostat_tau?: number
  model_novel?: string
  order?: number[]
  phrase_rep_pen?: string
  preamble?: string
  prefix?: string
  preset_settings_novel?: string
  repetition_penalty?: number
  repetition_penalty_frequency?: number
  repetition_penalty_presence?: number
  repetition_penalty_range?: number
  repetition_penalty_slope?: number
  streaming_novel?: boolean
  tail_free_sampling?: number
  temperature?: number
  top_a?: number
  top_k?: number
  top_p?: number
  typical_p?: number
}

export type GenerateChatReplyPayload = {
  csrfToken: string
  messages: ChatCompletionMessage[]
  prompt?: string
  settings: AppSettings
  stopSequences?: string[]
  signal?: AbortSignal
  taskKind?: NarrativeTaskKind
  traceContext?: TraceContextPayload
}

export type ChatStreamEvent = {
  delta: string
  done: boolean
  error?: string | null
  streamId: string
}

type ChatStreamStartResult = {
  started: boolean
}

export type GenerateChatReplyStreamPayload = GenerateChatReplyPayload & {
  onChunk: (delta: string, accumulated: string) => void
}

export type TraceContextBudgetDebugEntry = {
  estimatedTokens: number
  layer: string
  preview: string
  reason?: string
  source: string
}

export type TraceContextBudgetDebug = {
  dropped: TraceContextBudgetDebugEntry[]
  kept: TraceContextBudgetDebugEntry[]
  recentMessagesKept?: number
  reservedOutput: number
  summaryKindsUsed?: string[]
  usableInputBudget: number
  usedTokens: number
}

export type StructuredOutputPayload = {
  csrfToken: string
  messages: ChatCompletionMessage[]
  schemaId: Exclude<StructuredSchemaId, 'memory_extraction'>
  settings: AppSettings
  signal?: AbortSignal
  traceContext?: TraceContextPayload
}

export type TraceContextPayload = {
  avatarUrl?: string
  characterName?: string
  fileName?: string
  generationContext?: GenerationContextResult & {
    contextBudget?: TraceContextBudgetDebug
    query: string
  }
}

type SettingsResponse = {
  context?: unknown[]
  enable_accounts?: boolean
  enable_extensions?: boolean
  enable_extensions_auto_update?: boolean
  instruct?: unknown[]
  koboldai_setting_names?: string[]
  koboldai_settings?: string[]
  movingUIPresets?: unknown[]
  novelai_setting_names?: string[]
  novelai_settings?: string[]
  openai_setting_names?: string[]
  openai_settings?: string[]
  quickReplyPresets?: unknown[]
  reasoning?: unknown[]
  settings?: string
  sysprompt?: unknown[]
  textgenerationwebui_preset_names?: string[]
  textgenerationwebui_presets?: string[]
  themes?: unknown[]
  world_names?: string[]
}

export type SettingsPayload = Omit<SettingsResponse, 'settings'> & {
  rawSettings: string
  settings: AppSettings
}

export type TextGenerationStatusPayload = {
  apiServer: string
  apiType: string
  csrfToken: string
  signal?: AbortSignal
}

export type SecretPayload = {
  csrfToken: string
  secretKey: string
  signal?: AbortSignal
}

export type WriteSecretPayload = SecretPayload & {
  secretValue: string
}

export type ChatCompletionStatusPayload = {
  apiKey: string
  apiVersion?: string
  baseUrl: string
  csrfToken: string
  deploymentName?: string
  model: string
  protocol?: string
  signal?: AbortSignal
  source: string
}

export type BackendConnectionStatus = {
  message: string
  ok: boolean
}

export type ChatCompletionModelsPayload = {
  apiKey: string
  apiVersion?: string
  baseUrl: string
  csrfToken: string
  deploymentName?: string
  protocol?: string
  signal?: AbortSignal
  source: string
}

export type ModelProviderCapabilityName =
  | 'chat'
  | 'embedding'
  | 'rerank'
  | 'image'
  | 'speech'
  | 'moderation'
  | string

export type ModelProviderCapability = {
  capability: ModelProviderCapabilityName
  defaultModel: string
  enabled: boolean
  models: string[]
}

export type ModelProviderRecord = {
  apiVersion?: string | null
  baseUrl: string
  capabilities: ModelProviderCapability[]
  deploymentName?: string | null
  enabled: boolean
  hasSecret: boolean
  id: string
  name: string
  notes?: string | null
  protocol: string
  providerType: string
  secretKey: string
  updatedAt: number
}

export type SaveModelProviderPayload = {
  apiVersion?: string | null
  baseUrl: string
  capabilities: ModelProviderCapability[]
  csrfToken: string
  deploymentName?: string | null
  enabled: boolean
  id?: string | null
  name: string
  notes?: string | null
  protocol?: string | null
  providerType: string
  secretValue?: string | null
  signal?: AbortSignal
}

export type DeleteModelProviderPayload = {
  csrfToken: string
  id: string
  signal?: AbortSignal
}

export type FetchModelProviderModelsPayload = {
  apiKey: string
  apiVersion?: string | null
  baseUrl: string
  capability: ModelProviderCapabilityName
  csrfToken: string
  deploymentName?: string | null
  protocol?: string | null
  providerType: string
  signal?: AbortSignal
}

export type ModelProviderModelsPayload = {
  models: string[]
}

export type CharacterSummary = Record<string, unknown> & {
  alternate_greetings?: string[]
  avatar?: string
  chat?: string
  chat_size?: number
  create_date?: string
  data_size?: number
  date_added?: number
  date_last_chat?: number | string
  description?: string
  first_mes?: string
  mes_example?: string
  name?: string
  personality?: string
  post_history_instructions?: string
  scenario?: string
  system_prompt?: string
  tags?: string[]
}

export type CharacterChatSummary = Record<string, unknown> & {
  chat_items?: number
  chat_metadata?: Record<string, unknown>
  file_id: string
  file_name: string
  file_size?: string
  last_mes?: number | string
  match?: boolean
  mes?: string
}

export type ChatMessage = Record<string, unknown> & {
  character_name?: string
  chat_metadata?: Record<string, unknown>
  extra?: Record<string, unknown>
  is_system?: boolean
  is_user?: boolean
  mes?: string
  name?: string
  send_date?: string
  user_name?: string
}

export type SaveChatPayload = {
  avatarUrl: string
  characterName: string
  chat: ChatMessage[]
  csrfToken: string
  fileName: string
  force?: boolean
  signal?: AbortSignal
}

export type SaveSettingsPayload = {
  csrfToken: string
  settings: AppSettings
  signal?: AbortSignal
}

export type SaveSettingsWithSecretPayload = {
  csrfToken: string
  secretKey: string
  secretValue: string
  settings: AppSettings
  signal?: AbortSignal
}

export type SaveCharacterPayload = {
  avatar?: string
  avatar_data_url?: string
  alternate_greetings?: string[]
  csrfToken: string
  description?: string
  first_mes?: string
  mes_example?: string
  name: string
  personality?: string
  post_history_instructions?: string
  scenario?: string
  signal?: AbortSignal
  system_prompt?: string
}

export type DeleteCharacterPayload = {
  avatar: string
  csrfToken: string
  signal?: AbortSignal
}

export type DeleteChatPayload = {
  avatarUrl: string
  csrfToken: string
  fileName: string
  signal?: AbortSignal
}

export type RenameChatPayload = {
  avatarUrl: string
  csrfToken: string
  fileName: string
  nextFileName: string
  signal?: AbortSignal
}

export type ExportChatPayload = {
  avatarUrl: string
  csrfToken: string
  fileName: string
  format?: 'json' | 'jsonl'
  signal?: AbortSignal
}

export type ExportLibraryDocumentPayload = {
  csrfToken: string
  domain: string
  format?: 'json'
  name: string
  signal?: AbortSignal
}

export type CharacterChatsPayload = {
  avatarUrl: string
  csrfToken: string
  metadata?: boolean
  signal?: AbortSignal
  simple?: boolean
}

export type ChatPayload = {
  avatarUrl: string
  csrfToken: string
  fileName: string
  signal?: AbortSignal
}

export type WorkspaceBootstrap = {
  auth: AuthBootstrap
  characters: CharacterSummary[]
  settings: SettingsPayload | null
}

export type WorkspaceCatalogEntry = {
  disabled?: boolean
  itemCount?: number
  kind: string
  name: string
  note?: string
  sourceAvatar?: string
  sourceFileName?: string
  sizeBytes?: number
  tags?: string[]
  updatedAt?: number
}

export type WorkspaceCatalogPayload = {
  counts: Record<string, number>
  disabledExtensions: string[]
  entries: Record<string, WorkspaceCatalogEntry[]>
  totalChats: number
  totalMessages: number
  warningLines: number
}

export type LibraryDocument = {
  contentText?: string | null
  disabled: boolean
  domain: string
  kind: string
  name: string
  tags: string[]
  updatedAt?: number
}

export type ProjectManifestRecord = {
  name: string
  description: string
  themeName: string
  characterAvatars: string[]
  lorebookNames: string[]
  storyAssetNames: string[]
  sessionNames: string[]
  pluginBindings: string[]
  updatedAt: number
}

export type SaveProjectManifestPayload = {
  characterAvatars?: string[]
  csrfToken: string
  description?: string
  lorebookNames?: string[]
  name: string
  pluginBindings?: string[]
  sessionNames?: string[]
  signal?: AbortSignal
  storyAssetNames?: string[]
  themeName?: string
}

export type DeleteProjectManifestPayload = {
  csrfToken: string
  name: string
  signal?: AbortSignal
}

export type ProjectPluginBindingPayload = {
  csrfToken: string
  enabled: boolean
  pluginId: string
  projectName: string
  signal?: AbortSignal
}

export type WorldStateItemEntry = {
  detail: string
  id: string
  name: string
  status: string
  tags: string[]
  updatedAt: number
}

export type WorldStateSnapshotEntry = {
  avatarUrl?: string
  factions: WorldStateItemEntry[]
  fileName?: string
  inventoryItems: WorldStateItemEntry[]
  locations: WorldStateItemEntry[]
  lorebookName?: string
  quests: WorldStateItemEntry[]
  relationships: WorldStateItemEntry[]
  sceneStates: WorldStateItemEntry[]
  sessionId: string
  summary: string
  updatedAt: number
}

export type WorldStateUpdateRecord = {
  entity: string
  field: string
  nextValue: unknown
  reason: string
}

export type SaveLibraryDocumentPayload = {
  contentText?: string
  csrfToken: string
  domain: string
  kind: string
  name: string
  signal?: AbortSignal
  tags?: string[]
}

export type DeleteLibraryDocumentPayload = {
  csrfToken: string
  domain: string
  name: string
  signal?: AbortSignal
}

export type WorldStateSnapshotPayload = {
  avatarUrl?: string
  csrfToken: string
  fileName?: string
  signal?: AbortSignal
}

export type RebuildWorldStatePayload = WorldStateSnapshotPayload & {
  lorebookName?: string
}

export type ApplyWorldStateUpdatesPayload = WorldStateSnapshotPayload & {
  updates: WorldStateUpdateRecord[]
}

export type LogDocument = {
  content: string
  name: string
  sizeBytes: number
  updatedAt?: number
}

export type LogDocumentPayload = {
  csrfToken: string
  name: string
  signal?: AbortSignal
}

export type RuntimeLogPayload = {
  category: string
  csrfToken: string
  event: string
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace'
  message: string
  payload?: unknown
  signal?: AbortSignal
}

export type BackupPayload = {
  csrfToken: string
  signal?: AbortSignal
}

export type TraceEntry = {
  avatarUrl?: string
  characterName: string
  createdAt: number
  durationMs?: number
  errorText?: string
  fileName?: string
  id: string
  model?: string
  promptText?: string
  provider: string
  requestPayload?: string
  responseText?: string
  sessionId?: string
  tokenCount?: number
}

export type EvalRunEntry = {
  id: string
  avatarUrl?: string
  fileName?: string
  characterName: string
  overallScore: number
  settingConsistency: number
  memoryHitRate: number
  stateUpdateCorrectness: number
  replyContinuity: number
  notes: string[]
  createdAt: number
  updatedAt: number
}

export type EvalRunsPayload = {
  avatarUrl?: string
  csrfToken: string
  fileName?: string
  limit?: number
  signal?: AbortSignal
}

export type TraceEntriesPayload = {
  avatarUrl?: string
  csrfToken: string
  fileName?: string
  limit?: number
  signal?: AbortSignal
}

export class ChatIntegrityError extends Error {
  constructor() {
    super('Chat integrity check failed while saving the transcript')
    this.name = 'ChatIntegrityError'
  }
}

function resolveKoboldSettings(settings: AppSettings): KaiSettings {
  const kaiSettings = settings.kai_settings

  return kaiSettings && typeof kaiSettings === 'object' ? kaiSettings : {}
}

function resolveTextGenerationSettings(settings: AppSettings): TextGenerationWebUiSettings {
  const textGenerationSettings = settings.textgenerationwebui_settings

  return textGenerationSettings && typeof textGenerationSettings === 'object'
    ? textGenerationSettings
    : {}
}

function resolveNovelSettings(settings: AppSettings): NovelAiSettings {
  const novelSettings = settings.nai_settings

  return novelSettings && typeof novelSettings === 'object' ? novelSettings : {}
}

function resolveTextGenerationModel(settings: TextGenerationWebUiSettings, type: string): string {
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
      return String(settings.koboldcpp_model ?? '')
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

function resolveTextGenerationServer(settings: AppSettings, type: string): string {
  const textGenerationSettings = resolveTextGenerationSettings(settings)
  const serverUrls =
    textGenerationSettings.server_urls && typeof textGenerationSettings.server_urls === 'object'
      ? textGenerationSettings.server_urls
      : {}
  const typeServer = serverUrls[type]

  if (typeof typeServer === 'string' && typeServer.trim()) {
    return typeServer.trim()
  }

  if (typeof settings.api_server_textgenerationwebui === 'string' && settings.api_server_textgenerationwebui.trim()) {
    return settings.api_server_textgenerationwebui.trim()
  }

  return ''
}

function buildTextGenerationWebUiPayload(
  settings: AppSettings,
  prompt: string,
  stopSequences: string[],
): Record<string, unknown> {
  const textGenerationSettings = resolveTextGenerationSettings(settings)
  const type = String(
    textGenerationSettings.type ?? (settings.api_use_mancer_webui ? 'mancer' : 'ooba'),
  )
  const apiServer = resolveTextGenerationServer(settings, type)

  if (!apiServer) {
    throw new Error('当前 TextGen WebUI 尚未配置 API 地址。')
  }

  const model = resolveTextGenerationModel(textGenerationSettings, type)
  const maxTokens = Number(settings.amount_gen ?? 350)
  const maxContext = Number(settings.max_context ?? 2048)
  const dynamicTemperature = Boolean(textGenerationSettings.dynatemp)

  return {
    prompt,
    model: model || undefined,
    max_new_tokens: maxTokens,
    max_tokens: maxTokens,
    temperature: dynamicTemperature
      ? (Number(textGenerationSettings.min_temp ?? 0) + Number(textGenerationSettings.max_temp ?? 2)) / 2
      : Number(textGenerationSettings.temp ?? 0.7),
    top_p: Number(textGenerationSettings.top_p ?? 0.5),
    typical_p: Number(textGenerationSettings.typical_p ?? 1),
    typical: Number(textGenerationSettings.typical_p ?? 1),
    sampler_seed:
      typeof textGenerationSettings.seed === 'number' && textGenerationSettings.seed >= 0
        ? textGenerationSettings.seed
        : undefined,
    min_p: Number(textGenerationSettings.min_p ?? 0),
    repetition_penalty: Number(textGenerationSettings.rep_pen ?? 1.2),
    frequency_penalty: Number(textGenerationSettings.freq_pen ?? 0),
    presence_penalty: Number(textGenerationSettings.presence_pen ?? 0),
    top_k: Number(textGenerationSettings.top_k ?? 40),
    min_length: Number(textGenerationSettings.min_length ?? 0),
    num_beams: Number(textGenerationSettings.num_beams ?? 1),
    length_penalty: Number(textGenerationSettings.length_penalty ?? 1),
    add_bos_token: textGenerationSettings.add_bos_token !== false,
    dynamic_temperature: dynamicTemperature || undefined,
    dynatemp_low: dynamicTemperature ? Number(textGenerationSettings.min_temp ?? 0) : undefined,
    dynatemp_high: dynamicTemperature ? Number(textGenerationSettings.max_temp ?? 2) : undefined,
    dynatemp_range:
      dynamicTemperature
        ? (Number(textGenerationSettings.max_temp ?? 2) - Number(textGenerationSettings.min_temp ?? 0)) / 2
        : undefined,
    dynatemp_exponent: dynamicTemperature
      ? Number(textGenerationSettings.dynatemp_exponent ?? 1)
      : undefined,
    smoothing_factor: Number(textGenerationSettings.smoothing_factor ?? 0),
    smoothing_curve: Number(textGenerationSettings.smoothing_curve ?? 1),
    dry_allowed_length: Number(textGenerationSettings.dry_allowed_length ?? 2),
    dry_multiplier: Number(textGenerationSettings.dry_multiplier ?? 0),
    dry_base: Number(textGenerationSettings.dry_base ?? 1.75),
    dry_sequence_breakers: String(
      textGenerationSettings.dry_sequence_breakers ?? '["\n", ":", "\"", "*"]',
    ),
    dry_penalty_last_n: Number(textGenerationSettings.dry_penalty_last_n ?? 0),
    max_tokens_second: Number(textGenerationSettings.max_tokens_second ?? 0),
    sampler_priority: Array.isArray(textGenerationSettings.sampler_priority)
      ? textGenerationSettings.sampler_priority
      : undefined,
    samplers: Array.isArray(textGenerationSettings.samplers)
      ? textGenerationSettings.samplers
      : undefined,
    stopping_strings: stopSequences.length ? stopSequences : undefined,
    stop: stopSequences.length ? stopSequences : undefined,
    truncation_length: maxContext,
    ban_eos_token: Boolean(textGenerationSettings.ban_eos_token),
    skip_special_tokens: textGenerationSettings.skip_special_tokens !== false,
    include_reasoning: Boolean(textGenerationSettings.include_reasoning ?? true),
    top_a: Number(textGenerationSettings.top_a ?? 0),
    tfs: Number(textGenerationSettings.tfs ?? 1),
    epsilon_cutoff: Number(textGenerationSettings.epsilon_cutoff ?? 0),
    eta_cutoff: Number(textGenerationSettings.eta_cutoff ?? 0),
    mirostat_mode: Number(textGenerationSettings.mirostat_mode ?? 0),
    mirostat_tau: Number(textGenerationSettings.mirostat_tau ?? 5),
    mirostat_eta: Number(textGenerationSettings.mirostat_eta ?? 0.1),
    api_type: type,
    api_server: apiServer,
    sampler_order: Array.isArray(textGenerationSettings.sampler_order)
      ? textGenerationSettings.sampler_order
      : undefined,
    guidance_scale: Number(textGenerationSettings.guidance_scale ?? 1),
    negative_prompt: String(textGenerationSettings.negative_prompt ?? ''),
    grammar_string: String(textGenerationSettings.grammar_string ?? ''),
    json_schema:
      textGenerationSettings.json_schema && typeof textGenerationSettings.json_schema === 'object'
        ? textGenerationSettings.json_schema
        : undefined,
    ignore_eos: Boolean(textGenerationSettings.ignore_eos_token),
    spaces_between_special_tokens: Boolean(
      textGenerationSettings.spaces_between_special_tokens ?? true,
    ),
    n: Number(textGenerationSettings.n ?? 1),
    provider: Array.isArray(textGenerationSettings.openrouter_providers)
      ? textGenerationSettings.openrouter_providers
      : undefined,
    quantizations: Array.isArray(textGenerationSettings.openrouter_quantizations)
      ? textGenerationSettings.openrouter_quantizations
      : undefined,
    allow_fallbacks: Boolean(textGenerationSettings.openrouter_allow_fallbacks ?? true),
    xtc_threshold: Number(textGenerationSettings.xtc_threshold ?? 0.1),
    xtc_probability: Number(textGenerationSettings.xtc_probability ?? 0),
    nsigma: Number(textGenerationSettings.nsigma ?? 0),
    min_keep: Number(textGenerationSettings.min_keep ?? 0),
  }
}

function selectNovelPrefix(selectedPrefix: string, finalPrompt: string, model: string): string {
  const isNewModel =
    model.includes('clio') || model.includes('kayra') || model.includes('erato')

  if (isNewModel) {
    const tail = finalPrompt.slice(-1500)
    return tail.includes('}') ? 'special_instruct' : selectedPrefix
  }

  return 'vanilla'
}

function buildNovelGenerationPayload(settings: AppSettings, prompt: string): Record<string, unknown> {
  const novelSettings = resolveNovelSettings(settings)
  const model = String(novelSettings.model_novel ?? '')

  if (!model) {
    throw new Error('当前 NovelAI 尚未配置模型。')
  }

  const isErato = model.includes('erato')
  const input = isErato
    ? `<|startoftext|><|reserved_special_token81|>${prompt}`
    : prompt

  return {
    input,
    model,
    use_string: true,
    temperature: Number(novelSettings.temperature ?? 1.5),
    max_length: Number(settings.amount_gen ?? 150),
    min_length: Number(novelSettings.min_length ?? 1),
    tail_free_sampling: Number(novelSettings.tail_free_sampling ?? 0.975),
    repetition_penalty: Number(novelSettings.repetition_penalty ?? 2.25),
    repetition_penalty_range: Number(novelSettings.repetition_penalty_range ?? 2048),
    repetition_penalty_slope: Number(novelSettings.repetition_penalty_slope ?? 0.09),
    repetition_penalty_frequency: Number(novelSettings.repetition_penalty_frequency ?? 0),
    repetition_penalty_presence: Number(novelSettings.repetition_penalty_presence ?? 0.005),
    top_a: Number(novelSettings.top_a ?? 0.08),
    top_p: Number(novelSettings.top_p ?? 0.75),
    top_k: Number(novelSettings.top_k ?? 10),
    min_p: Number(novelSettings.min_p ?? 0),
    math1_temp: Number(novelSettings.math1_temp ?? 1),
    math1_quad: Number(novelSettings.math1_quad ?? 0),
    math1_quad_entropy_scale: Number(novelSettings.math1_quad_entropy_scale ?? 0),
    typical_p: Number(novelSettings.typical_p ?? 0.975),
    mirostat_lr: Number(novelSettings.mirostat_lr ?? 1),
    mirostat_tau: Number(novelSettings.mirostat_tau ?? 5),
    phrase_rep_pen: String(novelSettings.phrase_rep_pen ?? 'off'),
    generate_until_sentence: true,
    use_cache: false,
    return_full_text: false,
    prefix: selectNovelPrefix(String(novelSettings.prefix ?? ''), prompt, model),
    order: Array.isArray(novelSettings.order)
      ? novelSettings.order
      : [1, 5, 0, 2, 3, 4],
  }
}

function buildKoboldGenerationPayload(
  settings: AppSettings,
  prompt: string,
  stopSequences: string[],
): Record<string, unknown> {
  const kaiSettings = resolveKoboldSettings(settings)

  return {
    prompt,
    gui_settings: false,
    sampler_order: Array.isArray(kaiSettings.sampler_order) ? kaiSettings.sampler_order : undefined,
    max_context_length: Number(settings.max_context ?? 2048),
    max_length: Number(settings.amount_gen ?? 350),
    rep_pen: Number(kaiSettings.rep_pen ?? 1.1),
    rep_pen_range: Number(kaiSettings.rep_pen_range ?? 600),
    rep_pen_slope: Number(kaiSettings.rep_pen_slope ?? 0),
    temperature: Number(kaiSettings.temp ?? 1),
    tfs: Number(kaiSettings.tfs ?? 1),
    top_a: Number(kaiSettings.top_a ?? 0),
    top_k: Number(kaiSettings.top_k ?? 0),
    top_p: Number(kaiSettings.top_p ?? 0.95),
    min_p: Number(kaiSettings.min_p ?? 0.01),
    typical: Number(kaiSettings.typical ?? 1),
    use_world_info: false,
    singleline: false,
    stop_sequence: stopSequences.length ? stopSequences : undefined,
    streaming: false,
    can_abort: false,
    mirostat: Number(kaiSettings.mirostat ?? 0),
    mirostat_tau: Number(kaiSettings.mirostat_tau ?? 5),
    mirostat_eta: Number(kaiSettings.mirostat_eta ?? 0.1),
    use_default_badwordsids: Boolean(kaiSettings.use_default_badwordsids),
    grammar: typeof kaiSettings.grammar === 'string' ? kaiSettings.grammar : undefined,
    sampler_seed:
      typeof kaiSettings.seed === 'number' && kaiSettings.seed >= 0 ? kaiSettings.seed : undefined,
    api_server: typeof kaiSettings.api_server === 'string' ? kaiSettings.api_server : '',
  }
}


export async function fetchSettings(
  csrfToken: string,
  signal?: AbortSignal,
): Promise<SettingsPayload> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<SettingsPayload>('tauri_fetch_settings')
}

export async function fetchCharacters(
  csrfToken: string,
  signal?: AbortSignal,
): Promise<CharacterSummary[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<CharacterSummary[]>('tauri_fetch_characters')
}

export async function fetchCharacterChats({
  avatarUrl,
  csrfToken,
  metadata = false,
  signal,
  simple = false,
}: CharacterChatsPayload): Promise<CharacterChatSummary[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void metadata
  void signal
  void simple
  return tauriInvoke<CharacterChatSummary[]>('tauri_fetch_character_chats', {
    avatarUrl,
  })
}

export async function fetchChat({
  avatarUrl,
  csrfToken,
  fileName,
  signal,
}: ChatPayload): Promise<ChatMessage[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<ChatMessage[]>('tauri_fetch_chat', {
    avatarUrl,
    fileName,
  })
}

export async function saveChat({
  avatarUrl,
  characterName,
  chat,
  csrfToken,
  fileName,
  force = false,
  signal,
}: SaveChatPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void characterName
  void csrfToken
  void force
  void signal
  await tauriInvoke('tauri_save_chat', {
    avatarUrl,
    fileName,
    chat,
  })
}

export async function saveSettings({
  csrfToken,
  settings,
  signal,
}: SaveSettingsPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_save_settings', { settings })
}

export async function saveSettingsWithSecret({
  csrfToken,
  secretKey,
  secretValue,
  settings,
  signal,
}: SaveSettingsWithSecretPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_save_settings_with_secret', {
    secretKey,
    secretValue,
    settings,
  })
}

export async function fetchModelProviders(signal?: AbortSignal): Promise<ModelProviderRecord[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void signal
  return tauriInvoke<ModelProviderRecord[]>('tauri_fetch_model_providers')
}

export async function saveModelProvider({
  csrfToken,
  signal,
  ...payload
}: SaveModelProviderPayload): Promise<ModelProviderRecord> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<ModelProviderRecord>('tauri_save_model_provider', { payload })
}

export async function deleteModelProvider({
  csrfToken,
  id,
  signal,
}: DeleteModelProviderPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_delete_model_provider', { id })
}

export async function saveCharacter({
  csrfToken,
  signal,
  ...payload
}: SaveCharacterPayload): Promise<CharacterSummary> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<CharacterSummary>('tauri_save_character', { payload })
}

export async function deleteCharacter({
  avatar,
  csrfToken,
  signal,
}: DeleteCharacterPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_delete_character', { avatar })
}

export async function deleteChat({
  avatarUrl,
  csrfToken,
  fileName,
  signal,
}: DeleteChatPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_delete_chat', { avatarUrl, fileName })
}

export async function renameChat({
  avatarUrl,
  csrfToken,
  fileName,
  nextFileName,
  signal,
}: RenameChatPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_rename_chat', { avatarUrl, fileName, nextFileName })
}

export async function duplicateChat({
  avatarUrl,
  csrfToken,
  fileName,
  nextFileName,
  signal,
}: RenameChatPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_duplicate_chat', { avatarUrl, fileName, nextFileName })
}

export async function exportChatTranscript({
  avatarUrl,
  csrfToken,
  fileName,
  format = 'jsonl',
  signal,
}: ExportChatPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<string>('tauri_export_chat', {
    avatarUrl,
    fileName,
    format,
  })
}

export async function exportLibraryDocument({
  csrfToken,
  domain,
  format = 'json',
  name,
  signal,
}: ExportLibraryDocumentPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<string>('tauri_export_library_document', {
    domain,
    name,
    format,
  })
}

export async function exportProjectManifest({
  csrfToken,
  name,
  signal,
}: DeleteProjectManifestPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<string>('tauri_export_project_manifest', { name })
}

export async function importProjectManifest({
  csrfToken,
  rawJson,
  signal,
}: { csrfToken: string; rawJson: string; signal?: AbortSignal }): Promise<ProjectManifestRecord> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<ProjectManifestRecord>('tauri_import_project_manifest', { rawJson })
}

export async function setProjectPluginBinding({
  csrfToken,
  signal,
  ...payload
}: ProjectPluginBindingPayload): Promise<ProjectManifestRecord> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<ProjectManifestRecord>('tauri_set_project_plugin_binding', {
    payload,
  })
}

export async function checkTextGenerationStatus({
  apiServer,
  apiType,
  csrfToken,
  signal,
}: TextGenerationStatusPayload): Promise<BackendConnectionStatus> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<BackendConnectionStatus>('tauri_check_text_generation_status', {
    apiServer,
    apiType,
  })
}

export async function checkNovelStatus(
  csrfToken: string,
  signal?: AbortSignal,
): Promise<BackendConnectionStatus> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<BackendConnectionStatus>('tauri_check_novel_status')
}

export async function readSecret({
  csrfToken,
  secretKey,
  signal,
}: SecretPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<string>('tauri_read_secret', { secretKey })
}

export async function writeSecret({
  csrfToken,
  secretKey,
  secretValue,
  signal,
}: WriteSecretPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_write_secret', { secretKey, secretValue })
}

export async function checkChatCompletionStatus({
  apiKey,
  apiVersion,
  baseUrl,
  csrfToken,
  deploymentName,
  model,
  protocol,
  signal,
  source,
}: ChatCompletionStatusPayload): Promise<BackendConnectionStatus> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<BackendConnectionStatus>('tauri_check_chat_completion_status', {
    apiKey,
    apiVersion,
    baseUrl,
    deploymentName,
    model,
    protocol,
    source,
  })
}

export async function fetchChatCompletionModels({
  apiKey,
  apiVersion,
  baseUrl,
  csrfToken,
  deploymentName,
  protocol,
  signal,
  source,
}: ChatCompletionModelsPayload): Promise<string[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<string[]>('tauri_fetch_chat_completion_models', {
    apiKey,
    apiVersion,
    baseUrl,
    deploymentName,
    protocol,
    source,
  })
}

export async function fetchModelProviderModels({
  apiKey,
  apiVersion,
  baseUrl,
  capability,
  csrfToken,
  deploymentName,
  protocol,
  providerType,
  signal,
}: FetchModelProviderModelsPayload): Promise<ModelProviderModelsPayload> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<ModelProviderModelsPayload>('tauri_fetch_model_provider_models', {
    apiKey,
    apiVersion,
    baseUrl,
    capability,
    deploymentName,
    protocol,
    providerType,
  })
}

export async function generateChatReply({
  csrfToken,
  messages,
  prompt,
  settings,
  stopSequences = [],
  signal,
  taskKind,
  traceContext,
}: GenerateChatReplyPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  switch (settings.main_api) {
    case 'openai':
      return tauriInvoke<string>('tauri_generate_openai_chat', {
        messages,
        settings,
        taskKind,
        traceContext,
      })

    case 'kobold': {
      if (!prompt?.trim()) {
        throw new Error('当前文本生成主链缺少可发送的 prompt。')
      }

      const payload = buildKoboldGenerationPayload(settings, prompt, stopSequences)
      return tauriInvoke<string>('tauri_generate_kobold', { payload, traceContext })
    }

    case 'koboldhorde': {
      if (!prompt?.trim()) {
        throw new Error('当前 Horde 主链缺少可发送的 prompt。')
      }

      const payload = buildKoboldGenerationPayload(settings, prompt, stopSequences)
      const hordeSettings =
        settings.horde_settings && typeof settings.horde_settings === 'object'
          ? settings.horde_settings
          : {}
      const models = Array.isArray(hordeSettings.models)
        ? hordeSettings.models.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : []

      if (models.length === 0) {
        throw new Error('当前 Horde 没有选中可用模型，请先在原配置里选择至少一个 Horde 模型。')
      }

      return tauriInvoke<string>('tauri_generate_horde_text', {
        models,
        payload,
        traceContext,
        trustedWorkers: Boolean(hordeSettings.trusted_workers_only),
      })
    }

    case 'textgenerationwebui': {
      if (!prompt?.trim()) {
        throw new Error('当前 TextGen 主链缺少可发送的 prompt。')
      }

      const payload = buildTextGenerationWebUiPayload(settings, prompt, stopSequences)
      return tauriInvoke<string>('tauri_generate_text_completion', { payload, traceContext })
    }

    case 'novel': {
      if (!prompt?.trim()) {
        throw new Error('当前 NovelAI 主链缺少可发送的 prompt。')
      }

      const payload = buildNovelGenerationPayload(settings, prompt)
      return tauriInvoke<string>('tauri_generate_novel', { payload, traceContext })
    }

    default:
      throw new Error(`当前 Tauri 聊天生成暂未接入主 API: ${String(settings.main_api ?? 'unknown')}`)
  }
}

export async function generateChatReplyStream({
  csrfToken,
  messages,
  prompt,
  settings,
  stopSequences = [],
  signal,
  taskKind,
  traceContext,
  onChunk,
}: GenerateChatReplyStreamPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void prompt
  void signal
  void stopSequences

  if (settings.main_api !== 'openai') {
    throw new Error('当前仅 OpenAI 兼容聊天链路支持流式传输。')
  }

  const { listen } = await import('@tauri-apps/api/event')
  const streamId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `st-stream-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let accumulated = ''
  let unlisten: null | (() => void) | (() => Promise<void>) = null
  let abortHandler: (() => void) | null = null
  let settled = false

  const cleanup = async () => {
    if (abortHandler && signal) {
      signal.removeEventListener('abort', abortHandler)
      abortHandler = null
    }
    if (unlisten) {
      const dispose = unlisten
      unlisten = null
      await dispose()
    }
  }

  const streamResult = new Promise<string>((resolve, reject) => {
    const settle = (next: () => void) => {
      if (settled) return
      settled = true
      void cleanup().finally(next)
    }

    abortHandler = () => {
      settle(() => reject(new Error('Streaming request aborted.')))
    }

    if (signal?.aborted) {
      abortHandler()
      return
    }

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    const handleEvent = (event: { payload: ChatStreamEvent }) => {
      const payload = event.payload
      if (!payload || payload.streamId !== streamId) {
        return
      }

      if (payload.delta) {
        accumulated += payload.delta
        onChunk(payload.delta, accumulated)
      }

      if (payload.error) {
        settle(() => reject(new Error(payload.error ?? 'Streaming failed.')))
        return
      }

      if (payload.done) {
        settle(() => resolve(accumulated))
      }
    }

    void (async () => {
      try {
        unlisten = await listen<ChatStreamEvent>('st-chat-stream', handleEvent)
      } catch (error) {
        settle(() => reject(error))
      }
    })()
  })

  try {
    while (!unlisten && !settled) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    if (settled) {
      return await streamResult
    }
    await tauriInvoke<ChatStreamStartResult>('tauri_generate_openai_chat_stream', {
      messages,
      settings,
      streamId,
      taskKind,
      traceContext,
    })
    return await streamResult
  } catch (error) {
    await cleanup()
    throw error
  }
}

export async function generateStructuredOutput({
  csrfToken,
  messages,
  schemaId,
  settings,
  signal,
  traceContext,
}: StructuredOutputPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  return tauriInvoke<string>('tauri_generate_structured_output', {
    messages,
    schemaId,
    settings,
    traceContext,
  })
}

export async function extractNarrativeMemory({
  csrfToken,
  messages,
  settings,
  signal,
  traceContext,
}: NarrativeMemoryExtractionPayload): Promise<NarrativeMemoryExtractionResult> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  return tauriInvoke<NarrativeMemoryExtractionResult>('tauri_extract_narrative_memory', {
    messages,
    settings,
    traceContext,
  })
}

export async function fetchNarrativeMemories({
  avatarUrl,
  csrfToken,
  fileName,
  limit,
  query,
  signal,
}: NarrativeMemoryQueryPayload): Promise<NarrativeMemoryEntry[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  return tauriInvoke<NarrativeMemoryEntry[]>('tauri_fetch_narrative_memories', {
    avatarUrl,
    fileName,
    limit,
    query,
  })
}

export async function fetchNarrativeMemoryCandidates({
  avatarUrl,
  csrfToken,
  fileName,
  limit,
  query,
  signal,
}: NarrativeMemoryQueryPayload): Promise<NarrativeMemoryCandidateEntry[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  return tauriInvoke<NarrativeMemoryCandidateEntry[]>('tauri_fetch_narrative_memory_candidates', {
    avatarUrl,
    fileName,
    limit,
    query,
  })
}

export async function fetchMemoryHits({
  avatarUrl,
  csrfToken,
  fileName,
  limit,
  query,
  signal,
}: NarrativeMemoryHitsPayload): Promise<NarrativeMemoryHitEntry[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  return tauriInvoke<NarrativeMemoryHitEntry[]>('tauri_fetch_memory_hits', {
    avatarUrl,
    fileName,
    limit,
    query,
  })
}

export async function clearMemoryHits({
  avatarUrl,
  csrfToken,
  fileName,
  query,
  signal,
}: NarrativeMemoryMutationPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  await tauriInvoke('tauri_clear_memory_hits', {
    avatarUrl,
    fileName,
    query,
  })
}

export async function deleteNarrativeMemory({
  csrfToken,
  memoryId,
  signal,
}: NarrativeMemoryMutationPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  if (!memoryId?.trim()) {
    throw new Error('Memory id is required.')
  }

  void csrfToken
  void signal

  await tauriInvoke('tauri_delete_narrative_memory', {
    memoryId,
  })
}

export async function deleteNarrativeMemoryCandidate({
  candidateId,
  csrfToken,
  signal,
}: NarrativeMemoryMutationPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  if (!candidateId?.trim()) {
    throw new Error('Candidate id is required.')
  }

  void csrfToken
  void signal

  await tauriInvoke('tauri_delete_narrative_memory_candidate', {
    candidateId,
  })
}

export async function retrieveNarrativeMemories({
  avatarUrl,
  csrfToken,
  fileName,
  limit,
  query,
  settings,
  signal,
}: NarrativeMemoryRetrievePayload): Promise<NarrativeMemoryEntry[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  return tauriInvoke<NarrativeMemoryEntry[]>('tauri_retrieve_narrative_memories', {
    avatarUrl,
    fileName,
    limit,
    query,
    settings,
  })
}

export async function reviewNarrativeMemoryCandidate({
  action,
  candidateId,
  csrfToken,
  signal,
}: ReviewNarrativeMemoryCandidatePayload): Promise<{ ok: boolean }> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  return tauriInvoke<{ ok: boolean }>('tauri_review_narrative_memory_candidate', {
    payload: {
      action,
      candidateId,
    },
  })
}

export async function retrieveGenerationContext({
  activeWorldNames,
  avatarUrl,
  csrfToken,
  fileName,
  query,
  settings,
  signal,
}: GenerationContextPayload): Promise<GenerationContextResult> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal

  return tauriInvoke<GenerationContextResult>('tauri_retrieve_generation_context', {
    activeWorldNames,
    avatarUrl,
    fileName,
    query,
    settings,
  })
}

export async function fetchRetrievalJobs({
  csrfToken,
  fileName,
  limit,
  signal,
}: RetrievalJobsPayload): Promise<RetrievalJobEntry[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<RetrievalJobEntry[]>('tauri_fetch_retrieval_jobs', {
    fileName,
    limit,
  })
}

export async function fetchRetrievalHits({
  csrfToken,
  limit,
  queryText,
  signal,
}: RetrievalHitsPayload): Promise<RetrievalHitEntry[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<RetrievalHitEntry[]>('tauri_fetch_retrieval_hits', {
    limit,
    queryText,
  })
}

export async function fetchWorkspaceBootstrap(signal?: AbortSignal): Promise<WorkspaceBootstrap> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  const auth = await fetchAuthBootstrap(signal)

  const [settings, characters] = await Promise.all([
    fetchSettings(auth.csrfToken, signal),
    fetchCharacters(auth.csrfToken, signal),
  ])

  return {
    auth,
    characters,
    settings,
  }
}

export async function fetchWorkspaceCatalog(signal?: AbortSignal): Promise<WorkspaceCatalogPayload> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void signal
  return tauriInvoke<WorkspaceCatalogPayload>('tauri_fetch_workspace_catalog')
}

export async function fetchLibraryDocuments(
  domain: string,
  signal?: AbortSignal,
): Promise<LibraryDocument[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void signal
  return tauriInvoke<LibraryDocument[]>('tauri_fetch_library_documents', { domain })
}

export async function fetchProjectManifests(signal?: AbortSignal): Promise<ProjectManifestRecord[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void signal
  return tauriInvoke<ProjectManifestRecord[]>('tauri_fetch_project_manifests')
}

export async function saveLibraryDocument({
  csrfToken,
  signal,
  ...payload
}: SaveLibraryDocumentPayload): Promise<LibraryDocument> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<LibraryDocument>('tauri_save_library_document', {
    payload: {
      ...payload,
    },
  })
}

export async function saveProjectManifest({
  csrfToken,
  signal,
  ...payload
}: SaveProjectManifestPayload): Promise<ProjectManifestRecord> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<ProjectManifestRecord>('tauri_save_project_manifest', {
    payload,
  })
}

export async function deleteLibraryDocument({
  csrfToken,
  domain,
  name,
  signal,
}: DeleteLibraryDocumentPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_delete_library_document', { domain, name })
}

export async function deleteProjectManifest({
  csrfToken,
  name,
  signal,
}: DeleteProjectManifestPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_delete_project_manifest', { name })
}

export async function fetchWorldStateSnapshot({
  avatarUrl,
  csrfToken,
  fileName,
  signal,
}: WorldStateSnapshotPayload): Promise<WorldStateSnapshotEntry | null> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<WorldStateSnapshotEntry | null>('tauri_fetch_world_state_snapshot', {
    avatarUrl,
    fileName,
  })
}

export async function rebuildWorldStateSnapshot({
  avatarUrl,
  csrfToken,
  fileName,
  lorebookName,
  signal,
}: RebuildWorldStatePayload): Promise<WorldStateSnapshotEntry> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<WorldStateSnapshotEntry>('tauri_rebuild_world_state_snapshot', {
    payload: {
      avatarUrl,
      fileName,
      lorebookName,
    },
  })
}

export async function applyWorldStateUpdates({
  avatarUrl,
  csrfToken,
  fileName,
  signal,
  updates,
}: ApplyWorldStateUpdatesPayload): Promise<WorldStateSnapshotEntry> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<WorldStateSnapshotEntry>('tauri_apply_world_state_updates', {
    payload: {
      avatarUrl,
      fileName,
      updates,
    },
  })
}

export async function fetchLogDocument({
  csrfToken,
  name,
  signal,
}: LogDocumentPayload): Promise<LogDocument> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<LogDocument>('tauri_fetch_log_document', { name })
}

export async function exportLogDocument({
  csrfToken,
  name,
  signal,
}: LogDocumentPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<string>('tauri_export_log_document', { name })
}

export async function exportLogsBundle({
  csrfToken,
  signal,
}: BackupPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<string>('tauri_export_logs_bundle')
}

export async function clearLogDocument({
  csrfToken,
  name,
  signal,
}: LogDocumentPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_clear_log_document', { name })
}

export async function appendRuntimeLog({
  category,
  csrfToken,
  event,
  level,
  message,
  payload,
  signal,
}: RuntimeLogPayload): Promise<void> {
  if (!isTauriDesktop()) {
    return
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_append_runtime_log', {
    category,
    event,
    level,
    message,
    payload,
  })
}

export async function createBackup({
  csrfToken,
  signal,
}: BackupPayload): Promise<LibraryDocument> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<LibraryDocument>('tauri_create_backup')
}

export async function restoreBackup({
  csrfToken,
  name,
  signal,
}: LogDocumentPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_restore_backup', { name })
}

export async function fetchTraceEntries({
  avatarUrl,
  csrfToken,
  fileName,
  limit,
  signal,
}: TraceEntriesPayload): Promise<TraceEntry[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<TraceEntry[]>('tauri_fetch_trace_entries', {
    avatarUrl,
    fileName,
    limit,
  })
}

export async function fetchSessionSummaries({
  avatarUrl,
  csrfToken,
  fileName,
  signal,
}: SessionSummariesPayload): Promise<SessionSummary[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<SessionSummary[]>('tauri_fetch_session_summaries', {
    avatarUrl,
    fileName,
  })
}

export async function saveSessionSummary({
  avatarUrl,
  content,
  csrfToken,
  fileName,
  id,
  signal,
  sourceSignature,
  sourceMessageEnd,
  sourceMessageStart,
  summaryKind,
}: SaveSessionSummaryPayload): Promise<SessionSummary> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<SessionSummary>('tauri_save_session_summary', {
    payload: {
      avatarUrl,
      content,
      fileName,
      id,
      sourceSignature,
      sourceMessageEnd,
      sourceMessageStart,
      summaryKind,
    },
  })
}

export async function deleteSessionSummary({
  avatarUrl,
  csrfToken,
  fileName,
  id,
  signal,
}: DeleteSessionSummaryPayload): Promise<number> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<number>('tauri_delete_session_summary', {
    payload: {
      avatarUrl,
      fileName,
      id,
    },
  })
}

export async function fetchEvalRuns({
  avatarUrl,
  csrfToken,
  fileName,
  limit,
  signal,
}: EvalRunsPayload): Promise<EvalRunEntry[]> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<EvalRunEntry[]>('tauri_fetch_eval_runs', {
    avatarUrl,
    fileName,
    limit,
  })
}

export async function runLocalEval({
  avatarUrl,
  csrfToken,
  fileName,
  signal,
}: EvalRunsPayload): Promise<EvalRunEntry> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<EvalRunEntry>('tauri_run_local_eval', {
    avatarUrl,
    fileName,
  })
}

export async function clearTraceEntries({
  avatarUrl,
  csrfToken,
  fileName,
  signal,
}: TraceEntriesPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_clear_trace_entries', {
    avatarUrl,
    fileName,
  })
}

export async function exportTraceEntries({
  avatarUrl,
  csrfToken,
  fileName,
  signal,
}: TraceEntriesPayload): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  return tauriInvoke<string>('tauri_export_trace_entries', {
    avatarUrl,
    fileName,
  })
}
