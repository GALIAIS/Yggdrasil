import type { SettingsPayload, WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { stringifySettingValue } from './formatters'

export interface SettingSummaryItem {
  id: string
  label: string
  value: string
}

export interface GenerationReadiness {
  blockers: string[]
  summary: string
}

type Translator = (key: string, params?: Record<string, string | number>) => string

export function buildSettingsSummary(settingsPayload: SettingsPayload | null, t: Translator): SettingSummaryItem[] {
  const settings = settingsPayload?.settings
  const hordeModelCount = Array.isArray(settings?.horde_settings?.models)
    ? settings.horde_settings.models.filter((item): item is string => typeof item === 'string').length
    : 0

  return [
    { id: 'username', label: t('settingsData.summary.username'), value: stringifySettingValue(settings?.username) },
    { id: 'mainApi', label: t('settingsData.summary.mainApi'), value: stringifySettingValue(settings?.main_api) },
    {
      id: 'chatCompletionSource',
      label: t('settingsData.summary.chatCompletionSource'),
      value: stringifySettingValue(settings?.chat_completion_source),
    },
    {
      id: 'openAiModel',
      label: t('settingsData.summary.openAiModel'),
      value: stringifySettingValue(settings?.openai_model),
    },
    { id: 'maxContext', label: t('settingsData.summary.maxContext'), value: stringifySettingValue(settings?.max_context) },
    { id: 'amountGen', label: t('settingsData.summary.amountGen'), value: stringifySettingValue(settings?.amount_gen) },
    {
      id: 'textgenType',
      label: t('settingsData.summary.textgenType'),
      value: stringifySettingValue(settings?.textgenerationwebui_settings?.type),
    },
    {
      id: 'novelModel',
      label: t('settingsData.summary.novelModel'),
      value: stringifySettingValue(settings?.nai_settings?.model_novel),
    },
    {
      id: 'hordeModelCount',
      label: t('settingsData.summary.hordeModelCount'),
      value: hordeModelCount > 0 ? String(hordeModelCount) : t('common.unconfigured'),
    },
    {
      id: 'swipes',
      label: t('settingsData.summary.swipes'),
      value:
        typeof settings?.swipes === 'boolean'
          ? settings.swipes
            ? t('settingsData.states.enabled')
            : t('settingsData.states.disabled')
          : t('common.unconfigured'),
    },
    {
      id: 'accountMode',
      label: t('settingsData.summary.accountMode'),
      value: settingsPayload?.enable_accounts ? t('settingsData.states.multiAccount') : t('settingsData.states.singleAccount'),
    },
    {
      id: 'extensions',
      label: t('settingsData.summary.extensions'),
      value: settingsPayload?.enable_extensions ? t('settingsData.states.enabled') : t('settingsData.states.disabled'),
    },
    {
      id: 'extensionsAutoUpdate',
      label: t('settingsData.summary.extensionsAutoUpdate'),
      value: settingsPayload?.enable_extensions_auto_update ? t('settingsData.states.enabled') : t('settingsData.states.disabled'),
    },
  ]
}

export function buildPresetInventory(
  settings: SettingsPayload | null,
  t: Translator,
  catalog?: WorkspaceCatalogPayload | null,
): SettingSummaryItem[] {
  if (!settings) {
    return []
  }

  return [
    {
      id: 'openAiPresets',
      label: t('settingsData.inventory.openAiPresets'),
      value: String(catalog?.counts.openaiPresets ?? settings.openai_setting_names?.length ?? 0),
    },
    {
      id: 'novelAiPresets',
      label: t('settingsData.inventory.novelAiPresets'),
      value: String(catalog?.counts.novelPresets ?? settings.novelai_setting_names?.length ?? 0),
    },
    {
      id: 'textgenPresets',
      label: t('settingsData.inventory.textgenPresets'),
      value: String(catalog?.counts.textgenPresets ?? settings.textgenerationwebui_preset_names?.length ?? 0),
    },
    {
      id: 'koboldPresets',
      label: t('settingsData.inventory.koboldPresets'),
      value: String(catalog?.counts.koboldPresets ?? settings.koboldai_setting_names?.length ?? 0),
    },
    {
      id: 'themes',
      label: t('settingsData.inventory.themes'),
      value: String(catalog?.counts.themes ?? settings.themes?.length ?? 0),
    },
    {
      id: 'worlds',
      label: t('settingsData.inventory.worlds'),
      value: String(catalog?.counts.worlds ?? settings.world_names?.length ?? 0),
    },
    {
      id: 'quickReplies',
      label: t('settingsData.inventory.quickReplies'),
      value: String(catalog?.counts.quickReplies ?? settings.quickReplyPresets?.length ?? 0),
    },
    {
      id: 'instructs',
      label: t('settingsData.inventory.instructs'),
      value: String(catalog?.counts.instructs ?? settings.instruct?.length ?? 0),
    },
  ]
}

export function buildGenerationReadiness(
  mainApi: string,
  options: {
    azureApiVersion?: string
    azureDeploymentName?: string
    chatCompletionBaseUrl?: string
    chatCompletionModel?: string
    chatCompletionSource?: string
    hordeModelCount?: number
    novelModel?: string
    textgenApiServer?: string
    textgenModel?: string
    textgenType?: string
  },
  t: Translator,
): GenerationReadiness {
  const blockers: string[] = []

  switch (mainApi) {
    case 'openai':
      if (!options.chatCompletionSource?.trim()) {
        blockers.push(t('settingsData.readiness.chatSourceMissing'))
      }
      if (!options.chatCompletionModel?.trim()) {
        blockers.push(t('settingsData.readiness.chatModelMissing'))
      }
      if (
        ['custom', 'azure_openai'].includes(options.chatCompletionSource?.trim() ?? '') &&
        !options.chatCompletionBaseUrl?.trim()
      ) {
        blockers.push(t('settingsData.readiness.chatBaseUrlMissing'))
      }
      if (options.chatCompletionSource?.trim() === 'azure_openai' && !options.azureDeploymentName?.trim()) {
        blockers.push(t('settingsData.readiness.chatAzureDeploymentMissing'))
      }
      break
    case 'koboldhorde':
      if (!options.hordeModelCount || options.hordeModelCount <= 0) {
        blockers.push(t('settingsData.readiness.hordeMissing'))
      }
      break
    case 'textgenerationwebui':
      if (!options.textgenApiServer?.trim()) {
        blockers.push(t('settingsData.readiness.textgenServerMissing'))
      }
      if (!options.textgenType?.trim()) {
        blockers.push(t('settingsData.readiness.textgenTypeMissing'))
      }
      break
    case 'novel':
      if (!options.novelModel?.trim()) {
        blockers.push(t('settingsData.readiness.novelModelMissing'))
      }
      break
    default:
      break
  }

  if (blockers.length > 0) {
    return {
      blockers,
      summary: t('settingsData.readiness.pendingSummary', {
        mainApi: mainApi || t('settingsPanel.notSelected'),
        count: blockers.length,
      }),
    }
  }

  if (!mainApi.trim()) {
    return {
      blockers: [],
      summary: t('settingsData.readiness.noPrimaryApi'),
    }
  }

  const suffix =
    mainApi === 'openai'
      ? ` · ${options.chatCompletionSource?.trim() || t('common.unknown')}`
      : mainApi === 'textgenerationwebui'
      ? ` · ${options.textgenType?.trim() || t('common.unknown')}`
      : mainApi === 'novel'
        ? ` · ${options.novelModel?.trim() || t('common.unknown')}`
        : mainApi === 'koboldhorde'
          ? ` · ${t('settingsData.readiness.modelsSuffix', { count: options.hordeModelCount ?? 0 })}`
          : ''

  return {
    blockers: [],
    summary: t('settingsData.readiness.readySummary', {
      mainApi,
      suffix,
    }),
  }
}
