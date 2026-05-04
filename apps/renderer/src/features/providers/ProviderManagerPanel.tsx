import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, ModelProviderCapability, ModelProviderRecord, SettingsPayload } from '@yggdrasil/api-client'
import {
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  PlusIcon,
  RefreshCcwIcon,
  SearchIcon,
  ServerIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  useChatCompletionStatusMutation,
  useDeleteModelProviderMutation,
  useModelProviderModelsMutation,
  useModelProvidersQuery,
  useSaveModelProviderMutation,
  useSaveSettingsMutation,
  useSecretQuery,
} from '@/features/workspace/hooks'
import { formatDateTime, formatProtocolLabel, toErrorMessage } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'

const TAURI_LOCAL_TOKEN = 'tauri-local'
const PROVIDER_TYPES = ['custom', 'openai', 'openrouter', 'anthropic', 'gemini', 'jina', 'azure_openai', 'lm_studio', 'ollama'] as const
const PROVIDER_PROTOCOLS = [
  'openai_chat_completions',
  'openai_responses',
  'openai_responses_compact',
  'anthropic_messages',
  'gemini_generate_content',
  'openai_embeddings',
  'ollama_chat',
  'ollama_embeddings',
  'jina_rerank',
  'openai_image_generations',
] as const
const CAPABILITIES = ['chat', 'embedding', 'rerank', 'image', 'speech'] as const
const NO_MODEL_VALUE = '__yggdrasil_no_model__'

type ProviderCapabilityName = typeof CAPABILITIES[number]

type ProviderDraft = {
  apiVersion: string
  baseUrl: string
  capabilities: ModelProviderCapability[]
  deploymentName: string
  enabled: boolean
  id: string
  name: string
  notes: string
  protocol: string
  providerType: string
  secretValue: string
}

export interface ProviderManagerPanelProps {
  settings: SettingsPayload | null
}

export function ProviderManagerPanel({ settings }: ProviderManagerPanelProps) {
  const { t } = useI18n()
  const providersQuery = useModelProvidersQuery()
  const saveProviderMutation = useSaveModelProviderMutation()
  const deleteProviderMutation = useDeleteModelProviderMutation()
  const fetchModelsMutation = useModelProviderModelsMutation()
  const checkChatMutation = useChatCompletionStatusMutation()
  const saveSettingsMutation = useSaveSettingsMutation()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<ProviderDraft>(() => createProviderDraft())
  const [dirty, setDirty] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ModelProviderRecord | null>(null)
  const [refreshingCapability, setRefreshingCapability] = useState<ProviderCapabilityName | null>(null)

  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data])
  const filteredProviders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return providers
    return providers.filter((provider) =>
      [
        provider.name,
        provider.providerType,
        provider.protocol,
        provider.baseUrl,
        provider.notes ?? '',
        ...provider.capabilities.flatMap((capability) => [
          capability.capability,
          capability.defaultModel,
          ...capability.models,
        ]),
      ].join(' ').toLowerCase().includes(query),
    )
  }, [providers, searchQuery])

  const activeProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedId) ?? null,
    [providers, selectedId],
  )

  const secretQuery = useSecretQuery(activeProvider?.secretKey ?? '', Boolean(activeProvider?.secretKey))
  const secretLoading = Boolean(activeProvider?.secretKey) && secretQuery.isLoading

  useEffect(() => {
    if (providers.length === 0) {
      setSelectedId('')
      return
    }

    if (selectedId === '' && dirty) {
      return
    }

    if (!providers.some((provider) => provider.id === selectedId)) {
      setSelectedId(providers[0]?.id ?? '')
    }
  }, [dirty, providers, selectedId])

  useEffect(() => {
    if (!activeProvider || dirty) return
    setDraft(createProviderDraft(activeProvider))
  }, [activeProvider, dirty])

  useEffect(() => {
    if (!activeProvider || dirty) return
    if (typeof secretQuery.data !== 'string') return
    setDraft((current) => ({
      ...current,
      secretValue: secretQuery.data ?? '',
    }))
  }, [activeProvider, dirty, secretQuery.data])

  const stats = useMemo(() => {
    const capabilityCount = providers.reduce((sum, provider) => (
      sum + provider.capabilities.filter((capability) => capability.enabled).length
    ), 0)
    const modelCount = providers.reduce((sum, provider) => (
      sum + provider.capabilities.reduce((inner, capability) => inner + capability.models.length, 0)
    ), 0)
    return {
      capabilityCount,
      enabledCount: providers.filter((provider) => provider.enabled).length,
      modelCount,
    }
  }, [providers])

  const updateDraft = (patch: Partial<ProviderDraft>) => {
    setDirty(true)
    setDraft((current) => ({ ...current, ...patch }))
  }

  const handleProviderTypeChange = (providerType: string) => {
    const protocol = defaultProtocolForProviderType(providerType)
    updateDraft({
      providerType,
      protocol,
      baseUrl: defaultBaseUrlForProviderType(providerType, protocol),
    })
  }

  const handleProtocolChange = (protocol: string) => {
    updateDraft((() => {
      const baseUrl = defaultBaseUrlForProviderType(draft.providerType, protocol)
      const currentBaseUrl = draft.baseUrl.trim()
      const previousDefault = defaultBaseUrlForProviderType(draft.providerType, draft.protocol)
      return {
        protocol,
        baseUrl: !currentBaseUrl || currentBaseUrl === previousDefault ? baseUrl : draft.baseUrl,
      }
    })())
  }

  const updateCapability = (
    capabilityName: ProviderCapabilityName,
    patch: Partial<ModelProviderCapability>,
  ) => {
    setDirty(true)
    setDraft((current) => ({
      ...current,
      capabilities: current.capabilities.map((capability) => (
        capability.capability === capabilityName
          ? { ...capability, ...patch }
          : capability
      )),
    }))
  }

  const handleCreate = () => {
    setSelectedId('')
    setDraft(createProviderDraft())
    setDirty(true)
    setPendingDelete(null)
  }

  const handleSave = async () => {
    try {
      const saved = await saveProviderMutation.mutateAsync({
        apiVersion: draft.apiVersion || null,
        baseUrl: draft.baseUrl,
        capabilities: draft.capabilities,
        csrfToken: TAURI_LOCAL_TOKEN,
        deploymentName: draft.deploymentName || null,
        enabled: draft.enabled,
        id: draft.id || null,
        name: draft.name,
        notes: draft.notes || null,
        protocol: draft.protocol || null,
        providerType: draft.providerType,
        secretValue: draft.secretValue.trim() || null,
      })
      setSelectedId(saved.id)
      setDraft(createProviderDraft(saved, draft.secretValue))
      setDirty(false)
      toast.success(t('providersPanel.feedback.saved'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteProviderMutation.mutateAsync({
        csrfToken: TAURI_LOCAL_TOKEN,
        id: pendingDelete.id,
      })
      if (selectedId === pendingDelete.id) {
        setSelectedId('')
        setDraft(createProviderDraft())
        setDirty(false)
      }
      setPendingDelete(null)
      toast.success(t('providersPanel.feedback.deleted'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const handleRefreshModels = async (capabilityName: ProviderCapabilityName) => {
    setRefreshingCapability(capabilityName)
    try {
      const result = await fetchModelsMutation.mutateAsync({
        apiKey: draft.secretValue,
        apiVersion: draft.apiVersion || null,
        baseUrl: draft.baseUrl,
        capability: capabilityName,
        csrfToken: TAURI_LOCAL_TOKEN,
        deploymentName: draft.deploymentName || null,
        protocol: draft.protocol || null,
        providerType: draft.providerType,
      })
      const currentCapability = resolveCapability(draft.capabilities, capabilityName)
      const currentDefault = currentCapability.defaultModel.trim()
      const nextDefaultModel =
        (currentDefault && result.models.includes(currentDefault))
          ? currentDefault
          : result.models[0] || ''
      updateCapability(capabilityName, {
        models: result.models,
        defaultModel: nextDefaultModel,
      })
      toast.success(t('providersPanel.feedback.modelsRefreshed', { count: result.models.length }))
    } catch (error) {
      toast.error(toErrorMessage(error))
    } finally {
      setRefreshingCapability(null)
    }
  }

  const handleTestChat = async () => {
    const chatCapability = resolveCapability(draft.capabilities, 'chat')
    const chatModel = getCapabilityPrimaryModel(chatCapability)
    if (!chatModel) {
      toast.error(t('providersPanel.feedback.modelRequired'))
      return
    }
    try {
      const result = await checkChatMutation.mutateAsync({
        apiKey: draft.secretValue,
        apiVersion: draft.apiVersion || undefined,
        baseUrl: draft.baseUrl,
        csrfToken: TAURI_LOCAL_TOKEN,
        deploymentName: draft.deploymentName || undefined,
        model: chatModel,
        protocol: draft.protocol || undefined,
        source: draft.providerType,
      })
      toast.success(t('providersPanel.feedback.chatTested', { message: result.message }))
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const handleApplyChat = async () => {
    if (!settings?.settings) return
    const chatModel = getCapabilityPrimaryModel(resolveCapability(draft.capabilities, 'chat'))
    if (!chatModel) {
      toast.error(t('providersPanel.feedback.modelRequired'))
      return
    }
    try {
      const nextSettings = applyProviderToChatSettings(settings.settings, draft)
      nextSettings.openai_model = chatModel
      if (nextSettings.oai_settings && typeof nextSettings.oai_settings === 'object') {
        nextSettings.oai_settings = {
          ...nextSettings.oai_settings,
          openai_model: chatModel,
        }
      }
      await saveSettingsMutation.mutateAsync({
        csrfToken: TAURI_LOCAL_TOKEN,
        settings: nextSettings,
      })
      toast.success(t('providersPanel.feedback.appliedChat'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const handleApplyEmbedding = async () => {
    if (!settings?.settings) return
    const embeddingModel = getCapabilityPrimaryModel(resolveCapability(draft.capabilities, 'embedding'))
    if (!embeddingModel) {
      toast.error(t('providersPanel.feedback.modelRequired'))
      return
    }
    try {
      const nextSettings = applyProviderToEmbeddingSettings(settings.settings, draft)
      nextSettings.narrative_embedding_model = embeddingModel
      if (nextSettings.oai_settings && typeof nextSettings.oai_settings === 'object') {
        nextSettings.oai_settings = {
          ...nextSettings.oai_settings,
          narrative_embedding_model: embeddingModel,
        }
      }
      await saveSettingsMutation.mutateAsync({
        csrfToken: TAURI_LOCAL_TOKEN,
        settings: nextSettings,
      })
      toast.success(t('providersPanel.feedback.appliedEmbedding'))
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const activeCapabilities = draft.capabilities.filter((capability) => capability.enabled)
  const chatModel = getCapabilityPrimaryModel(resolveCapability(draft.capabilities, 'chat'))
  const embeddingModel = getCapabilityPrimaryModel(resolveCapability(draft.capabilities, 'embedding'))
  const protocolOptions = useMemo(() => availableProtocolsForProviderType(draft.providerType), [draft.providerType])

  return (
    <>
      <div className="grid h-full min-h-0 min-w-0 overflow-hidden gap-3 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
          <CardHeader className="border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                  <ServerIcon className="size-4" />
                  <span className="min-w-0 truncate">{t('nav.providers')}</span>
                </CardTitle>
                <CardDescription>
                  {t('providersPanel.description')}
                </CardDescription>
              </div>
              <Button className="min-w-0 gap-2 rounded-sm" size="sm" type="button" onClick={handleCreate}>
                <PlusIcon className="size-4" />
                <span className="min-w-0 truncate">{t('providersPanel.actions.new')}</span>
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              <ProviderMetric label={t('providersPanel.metrics.enabled')} value={stats.enabledCount} />
              <ProviderMetric label={t('providersPanel.metrics.capabilities')} value={stats.capabilityCount} />
              <ProviderMetric label={t('providersPanel.metrics.models')} value={stats.modelCount} />
            </div>
            <div className="ref-section-search">
              <SearchIcon className="size-4" />
              <Input
                className="ref-section-search-input"
                placeholder={t('sectionBrowser.searchPlaceholder', { title: t('nav.providers') })}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <ScrollArea className="h-full min-w-0 overflow-hidden">
              <div className="flex min-w-0 flex-col gap-2 p-3">
                {filteredProviders.map((provider) => {
                  const capabilityLabels = provider.capabilities
                    .filter((capability) => capability.enabled)
                    .map((capability) => capability.capability)
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(provider.id)
                        setDraft(createProviderDraft(provider))
                        setDirty(false)
                      }}
                      className={`w-full min-w-0 overflow-hidden rounded-sm border px-3 py-3 text-left ${
                        provider.id === selectedId
                          ? 'border-[rgba(194,154,89,0.34)] bg-[rgba(255,245,222,0.06)]'
                          : 'border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)]'
                      }`}
                    >
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <strong className="min-w-0 truncate text-sm text-stone-100">{provider.name}</strong>
                        <div className="min-w-0 justify-self-end overflow-hidden">
                          <Badge className="max-w-full min-w-0 truncate rounded-sm uppercase tracking-widest" variant={provider.enabled ? 'default' : 'outline'}>
                            <span className="min-w-0 truncate">{provider.providerType}</span>
                          </Badge>
                        </div>
                      </div>
                      <p className="yggdrasil-support-text mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
                        <span className="yggdrasil-support-text-strong shrink-0">{formatProtocolLabel(provider.protocol)}</span>
                        <span className="shrink-0 text-[rgba(170,145,114,0.72)]">/</span>
                        <span className="min-w-0 truncate">
                          {provider.baseUrl || t('common.unconfigured')}
                        </span>
                      </p>
                      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 overflow-hidden">
                        {capabilityLabels.length > 0 ? capabilityLabels.map((capability) => (
                           <Badge key={capability} className="min-w-0 rounded-sm" variant="outline">
                             <span className="min-w-0 truncate">{t(`providersPanel.capabilities.${capability}`)}</span>
                           </Badge>
                        )) : (
                          <Badge className="min-w-0 rounded-sm" variant="outline">
                            <span className="min-w-0 truncate">{t('common.disabled')}</span>
                          </Badge>
                        )}
                        {provider.hasSecret ? (
                          <Badge className="min-w-0 rounded-sm" variant="outline">
                            <KeyRoundIcon className="mr-1 size-3" />
                            <span className="min-w-0 truncate">{t('providersPanel.secretSaved')}</span>
                          </Badge>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
                {!providersQuery.isPending && filteredProviders.length === 0 ? (
                  <div className="rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.02)] px-3 py-6 text-sm text-stone-400/85">
                    {t('providersPanel.empty')}
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-sm border border-[rgba(194,154,89,0.16)] bg-[rgba(24,19,16,0.72)] shadow-none">
          <CardHeader className="shrink-0 border-b border-[rgba(194,154,89,0.12)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold text-stone-100">
                  <span className="block min-w-0 truncate">{draft.name || t('providersPanel.detailTitle')}</span>
                </CardTitle>
                <CardDescription>
                  {activeProvider?.updatedAt
                    ? t('providersPanel.updatedAt', { time: formatDateTime(activeProvider.updatedAt) })
                    : t('providersPanel.newDescription')}
                </CardDescription>
              </div>
              <div className="flex min-w-0 flex-wrap justify-end gap-2">
                  <Button
                    className="min-w-0 gap-2 rounded-sm"
                  type="button"
                  variant="outline"
                  disabled={!chatModel || checkChatMutation.isPending}
                  onClick={() => void handleTestChat()}
                >
                  <CheckCircle2Icon className="size-4" />
                    <span className="min-w-0 truncate">{t('providersPanel.actions.testChat')}</span>
                </Button>
                  <Button
                    className="min-w-0 gap-2 rounded-sm"
                  type="button"
                  variant="outline"
                  disabled={!settings?.settings || !chatModel || saveSettingsMutation.isPending}
                  onClick={() => void handleApplyChat()}
                >
                  <CopyIcon className="size-4" />
                    <span className="min-w-0 truncate">{t('providersPanel.actions.applyChat')}</span>
                </Button>
                  <Button
                    className="min-w-0 rounded-sm"
                  type="button"
                  disabled={saveProviderMutation.isPending || secretLoading}
                  onClick={() => void handleSave()}
                >
                    <span className="min-w-0 truncate">{saveProviderMutation.isPending ? t('common.loading') : t('common.save')}</span>
                </Button>
                {activeProvider ? (
                  <Button
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    title={t('common.delete')}
                    onClick={() => setPendingDelete(activeProvider)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <ScrollArea className="h-full min-w-0 overflow-hidden">
              <div className="grid min-w-0 gap-4 p-4">
                <div className="grid min-w-0 gap-3 lg:grid-cols-3">
                  <ProviderMetric label={t('providersPanel.summary.providerType')} value={draft.providerType} />
                  <ProviderMetric label={t('providersPanel.summary.protocol')} value={formatProtocolLabel(draft.protocol)} />
                  <ProviderMetric label={t('providersPanel.summary.primaryModel')} value={chatModel || embeddingModel || t('common.unconfigured')} />
                </div>

                <section className="grid min-w-0 gap-3 overflow-hidden rounded-sm border border-[rgba(194,154,89,0.14)] bg-[rgba(255,245,222,0.025)] p-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-stone-100">{t('providersPanel.sections.identity')}</h3>
                    <p className="yggdrasil-support-text">{t('providersPanel.sections.identityDescription')}</p>
                  </div>
                  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
                    <div className="grid min-w-0 gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="provider-name">{t('providersPanel.fields.name')}</FieldLabel>
                        <FieldContent>
                          <Input
                            id="provider-name"
                            value={draft.name}
                            onChange={(event) => updateDraft({ name: event.target.value })}
                            placeholder={t('providersPanel.placeholders.name')}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="provider-type">{t('providersPanel.fields.type')}</FieldLabel>
                        <FieldContent>
                          <Select value={draft.providerType} onValueChange={handleProviderTypeChange}>
                            <SelectTrigger id="provider-type" className="w-full min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROVIDER_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {t(`providersPanel.providerTypes.${type}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="provider-protocol">{t('providersPanel.fields.protocol')}</FieldLabel>
                        <FieldContent>
                          <Select value={draft.protocol} onValueChange={handleProtocolChange}>
                            <SelectTrigger id="provider-protocol" className="w-full min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {protocolOptions.map((protocol) => (
                                <SelectItem key={protocol} value={protocol}>
                                  {formatProtocolLabel(protocol)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="provider-base-url">{t('providersPanel.fields.baseUrl')}</FieldLabel>
                        <FieldContent>
                          <Input
                            id="provider-base-url"
                            value={draft.baseUrl}
                            onChange={(event) => updateDraft({ baseUrl: event.target.value })}
                            placeholder={t('providersPanel.placeholders.baseUrl')}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="provider-api-key">{t('providersPanel.fields.apiKey')}</FieldLabel>
                        <FieldContent>
                          <Input
                            id="provider-api-key"
                            type="password"
                            value={draft.secretValue}
                            onChange={(event) => updateDraft({ secretValue: event.target.value })}
                            placeholder={activeProvider?.hasSecret ? t('providersPanel.placeholders.savedSecret') : t('providersPanel.placeholders.apiKey')}
                          />
                        </FieldContent>
                      </Field>
                      {draft.providerType === 'azure_openai' ? (
                        <>
                          <Field>
                            <FieldLabel htmlFor="provider-deployment">{t('providersPanel.fields.deployment')}</FieldLabel>
                            <FieldContent>
                              <Input
                                id="provider-deployment"
                                value={draft.deploymentName}
                                onChange={(event) => updateDraft({ deploymentName: event.target.value })}
                                placeholder={t('providersPanel.placeholders.deployment')}
                              />
                            </FieldContent>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="provider-api-version">{t('providersPanel.fields.apiVersion')}</FieldLabel>
                            <FieldContent>
                              <Input
                                id="provider-api-version"
                                value={draft.apiVersion}
                                onChange={(event) => updateDraft({ apiVersion: event.target.value })}
                                placeholder={t('providersPanel.placeholders.apiVersion')}
                              />
                            </FieldContent>
                          </Field>
                        </>
                      ) : null}
                    </div>
                    <div className="yggdrasil-panel-muted grid min-w-0 content-start gap-3 overflow-hidden p-3">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="yggdrasil-metric-card-label uppercase tracking-widest">{t('providersPanel.fields.enabled')}</p>
                          <p className="yggdrasil-support-text mt-1">
                            {t('providersPanel.enabledDescription')}
                          </p>
                        </div>
                        <Switch
                          checked={draft.enabled}
                          onCheckedChange={(checked) => updateDraft({ enabled: checked })}
                        />
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1.5 overflow-hidden">
                        {activeCapabilities.length > 0 ? activeCapabilities.map((capability) => (
                          <Badge className="min-w-0 rounded-sm" key={capability.capability} variant="outline">
                            <span className="min-w-0 truncate">{t(`providersPanel.capabilities.${capability.capability}`)}</span>
                          </Badge>
                        )) : (
                          <Badge className="min-w-0 rounded-sm" variant="outline">
                            <span className="min-w-0 truncate">{t('common.disabled')}</span>
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid min-w-0 gap-3 overflow-hidden rounded-sm border border-[rgba(194,154,89,0.14)] bg-[rgba(255,245,222,0.02)] p-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-stone-100">{t('providersPanel.capabilityMatrixTitle')}</h3>
                      <p className="yggdrasil-support-text">{t('providersPanel.capabilityMatrixDescription')}</p>
                    </div>
                    <Button
                      className="min-w-0 gap-2 rounded-sm"
                      type="button"
                      variant="outline"
                      disabled={!settings?.settings || !embeddingModel || saveSettingsMutation.isPending}
                      onClick={() => void handleApplyEmbedding()}
                    >
                      <CopyIcon className="size-4" />
                      <span className="min-w-0 truncate">{t('providersPanel.actions.applyEmbedding')}</span>
                    </Button>
                  </div>

                  <div className="min-w-0 overflow-hidden rounded-sm border border-[rgba(194,154,89,0.14)]">
                    {CAPABILITIES.map((capabilityName) => {
                      const capability = resolveCapability(draft.capabilities, capabilityName)
                      const modelOptions = uniqueStrings([
                        capability.defaultModel,
                        ...capability.models,
                      ])
                      const selectedModel = capability.defaultModel.trim() || NO_MODEL_VALUE
                      const isRefreshingThisCapability = refreshingCapability === capabilityName
                      return (
                        <div
                          key={capabilityName}
                            className="grid min-w-0 gap-3 overflow-hidden border-b border-[rgba(194,154,89,0.1)] bg-[rgba(255,245,222,0.025)] p-3 last:border-b-0 xl:grid-cols-[minmax(0,160px)_minmax(0,1fr)_minmax(0,112px)]"
                          >
                          <label className="flex min-w-0 items-center gap-3 text-sm font-medium text-stone-100">
                            <Checkbox
                              checked={capability.enabled}
                              onCheckedChange={(checked) => updateCapability(capabilityName, { enabled: checked === true })}
                            />
                            <span className="min-w-0 truncate">{t(`providersPanel.capabilities.${capabilityName}`)}</span>
                          </label>
                          <Select
                            value={selectedModel}
                            onValueChange={(value) => {
                              if (value === NO_MODEL_VALUE) {
                                updateCapability(capabilityName, { defaultModel: '' })
                                return
                              }
                              updateCapability(capabilityName, {
                                defaultModel: value,
                                models: uniqueStrings([...capability.models, value]),
                              })
                            }}
                          >
                            <SelectTrigger className="w-full min-w-0" aria-label={t(`providersPanel.capabilities.${capabilityName}`)}>
                              <SelectValue placeholder={t('providersPanel.placeholders.defaultModel')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_MODEL_VALUE}>{t('common.unconfigured')}</SelectItem>
                              {modelOptions.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            className="w-full min-w-0 gap-2 rounded-sm xl:self-start"
                            type="button"
                            variant="outline"
                            disabled={fetchModelsMutation.isPending}
                            onClick={() => void handleRefreshModels(capabilityName)}
                          >
                            <RefreshCcwIcon className={`size-4 ${isRefreshingThisCapability ? 'animate-spin' : ''}`} />
                            <span className="min-w-0 truncate">{t('common.refresh')}</span>
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="grid min-w-0 gap-3 overflow-hidden rounded-sm border border-[rgba(194,154,89,0.14)] bg-[rgba(255,245,222,0.02)] p-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-stone-100">{t('providersPanel.sections.notes')}</h3>
                    <p className="yggdrasil-support-text">{t('providersPanel.sections.notesDescription')}</p>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="provider-notes">{t('providersPanel.fields.notes')}</FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="provider-notes"
                        className="min-h-28"
                        value={draft.notes}
                        onChange={(event) => updateDraft({ notes: event.target.value })}
                        placeholder={t('providersPanel.placeholders.notes')}
                      />
                    </FieldContent>
                  </Field>
                </section>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('providersPanel.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? t('providersPanel.deleteDescription', { name: pendingDelete.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ProviderMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-sm border border-[rgba(194,154,89,0.12)] bg-[rgba(255,245,222,0.025)] px-2 py-2">
      <p className="yggdrasil-metric-card-label min-w-0 truncate uppercase tracking-widest">{label}</p>
      <p className="yggdrasil-metric-card-value mt-1 min-w-0 truncate text-sm">{value}</p>
    </div>
  )
}

function createProviderDraft(provider?: ModelProviderRecord | null, secretValue = ''): ProviderDraft {
  const providerType = provider?.providerType ?? 'custom'
  const protocol = provider?.protocol ?? defaultProtocolForProviderType(providerType)
  const capabilities = normalizeCapabilities(provider?.capabilities)
  return {
    apiVersion: provider?.apiVersion ?? '',
    baseUrl: provider?.baseUrl ?? defaultBaseUrlForProviderType(providerType, protocol),
    capabilities,
    deploymentName: provider?.deploymentName ?? '',
    enabled: provider?.enabled ?? true,
    id: provider?.id ?? '',
    name: provider?.name ?? '',
    notes: provider?.notes ?? '',
    protocol,
    providerType,
    secretValue,
  }
}

function defaultProtocolForProviderType(providerType: string): string {
  switch (providerType) {
    case 'anthropic':
      return 'anthropic_messages'
    case 'gemini':
      return 'gemini_generate_content'
    case 'jina':
      return 'jina_rerank'
    case 'lm_studio':
      return 'openai_chat_completions'
    case 'ollama':
      return 'ollama_chat'
    case 'azure_openai':
    case 'openai':
    case 'openrouter':
    case 'custom':
    default:
      return 'openai_chat_completions'
  }
}

function defaultBaseUrlForProviderType(providerType: string, protocol: string): string {
  switch (providerType) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'anthropic':
      return 'https://api.anthropic.com/v1'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta'
    case 'jina':
      return 'https://api.jina.ai/v1'
    case 'lm_studio':
      return 'http://127.0.0.1:1234/v1'
    case 'ollama':
      return protocol === 'ollama_chat' || protocol === 'ollama_embeddings'
        ? 'http://127.0.0.1:11434'
        : 'http://127.0.0.1:11434/v1'
    case 'azure_openai':
      return ''
    case 'openai':
    case 'custom':
    default:
      return 'https://api.openai.com/v1'
  }
}

function availableProtocolsForProviderType(providerType: string): readonly string[] {
  switch (providerType) {
    case 'anthropic':
      return ['anthropic_messages']
    case 'gemini':
      return ['gemini_generate_content']
    case 'jina':
      return ['jina_rerank']
    case 'lm_studio':
      return ['openai_chat_completions', 'openai_responses', 'openai_responses_compact', 'openai_embeddings']
    case 'ollama':
      return ['ollama_chat', 'ollama_embeddings', 'openai_chat_completions', 'openai_embeddings']
    case 'azure_openai':
      return ['openai_chat_completions', 'openai_embeddings']
    case 'openrouter':
    case 'openai':
    case 'custom':
    default:
      return PROVIDER_PROTOCOLS
  }
}

function normalizeCapabilities(capabilities: ModelProviderCapability[] | undefined): ModelProviderCapability[] {
  return CAPABILITIES.map((capabilityName) => {
    const existing = capabilities?.find((capability) => capability.capability === capabilityName)
    return {
      capability: capabilityName,
      enabled: existing?.enabled ?? capabilityName === 'chat',
      defaultModel: existing?.defaultModel ?? '',
      models: existing?.models ?? [],
    }
  })
}

function resolveCapability(
  capabilities: ModelProviderCapability[],
  capabilityName: ProviderCapabilityName,
): ModelProviderCapability {
  return capabilities.find((capability) => capability.capability === capabilityName)
    ?? { capability: capabilityName, enabled: false, defaultModel: '', models: [] }
}

function getCapabilityPrimaryModel(capability: ModelProviderCapability): string {
  return capability.defaultModel.trim() || capability.models.find((model) => model.trim())?.trim() || ''
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))
}

function applyProviderToChatSettings(settings: AppSettings, draft: ProviderDraft): AppSettings {
  const chatCapability = resolveCapability(draft.capabilities, 'chat')
  const model = getCapabilityPrimaryModel(chatCapability)
  const models = Array.from(new Set([...chatCapability.models, model].filter(Boolean)))
  const nextOpenAiSettings = settings.oai_settings && typeof settings.oai_settings === 'object'
    ? settings.oai_settings
    : {}

  return {
    ...settings,
    main_api: 'openai',
    chat_model_provider_id: draft.id,
    chat_completion_source: draft.providerType === 'azure_openai' ? 'azure_openai' : 'openai',
    reverse_proxy: draft.providerType === 'openai' || draft.providerType === 'openrouter' ? draft.baseUrl : '',
    azure_base_url: draft.providerType === 'azure_openai' ? draft.baseUrl : '',
    azure_deployment_name: draft.providerType === 'azure_openai' ? draft.deploymentName : '',
    azure_api_version: draft.providerType === 'azure_openai' ? draft.apiVersion : settings.azure_api_version,
    azure_openai_model: draft.providerType === 'azure_openai' ? model : '',
    openai_model: model,
    chat_completion_model_names: models,
    oai_settings: {
      ...nextOpenAiSettings,
      chat_model_provider_id: draft.id,
      chat_completion_source: draft.providerType === 'azure_openai' ? 'azure_openai' : 'openai',
      reverse_proxy: draft.providerType === 'openai' || draft.providerType === 'openrouter' ? draft.baseUrl : '',
      azure_base_url: draft.providerType === 'azure_openai' ? draft.baseUrl : '',
      azure_deployment_name: draft.providerType === 'azure_openai' ? draft.deploymentName : '',
      azure_api_version: draft.providerType === 'azure_openai' ? draft.apiVersion : nextOpenAiSettings.azure_api_version,
      azure_openai_model: draft.providerType === 'azure_openai' ? model : '',
      openai_model: model,
      chat_completion_model_names: models,
    },
  }
}

function applyProviderToEmbeddingSettings(settings: AppSettings, draft: ProviderDraft): AppSettings {
  const embeddingCapability = resolveCapability(draft.capabilities, 'embedding')
  const model = getCapabilityPrimaryModel(embeddingCapability)
  const nextOpenAiSettings = settings.oai_settings && typeof settings.oai_settings === 'object'
    ? settings.oai_settings
    : {}

  return {
    ...settings,
    narrative_embedding_enabled: Boolean(model),
    narrative_embedding_provider_id: draft.id,
    narrative_embedding_source: draft.providerType === 'azure_openai' ? 'azure_openai' : 'openai',
    narrative_embedding_base_url: draft.baseUrl,
    narrative_embedding_model: model,
    oai_settings: {
      ...nextOpenAiSettings,
      narrative_embedding_provider_id: draft.id,
      narrative_embedding_enabled: Boolean(model),
      narrative_embedding_source: draft.providerType === 'azure_openai' ? 'azure_openai' : 'openai',
      narrative_embedding_base_url: draft.baseUrl,
      narrative_embedding_model: model,
    },
  }
}
