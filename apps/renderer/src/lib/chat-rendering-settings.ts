import type { AppSettings } from '@yggdrasil/api-client'

import {
  createDefaultMessageRenderingConfig,
  type MessageRenderingConfig,
} from './chat-rendering'

const SETTINGS_KEY = 'message_rendering'

export function resolveMessageRenderingConfigFromSettings(
  settings: AppSettings | null | undefined,
): MessageRenderingConfig {
  const fallback = createDefaultMessageRenderingConfig()
  const candidate = settings?.[SETTINGS_KEY]

  if (!candidate || typeof candidate !== 'object') {
    return fallback
  }

  const record = candidate as Record<string, unknown>
  return {
    activeTemplateId:
      typeof record.activeTemplateId === 'string' && record.activeTemplateId.trim()
        ? record.activeTemplateId
        : fallback.activeTemplateId,
    formatGuide:
      record.formatGuide && typeof record.formatGuide === 'object'
        ? {
            customInstruction:
              typeof (record.formatGuide as Record<string, unknown>).customInstruction === 'string'
                ? (record.formatGuide as Record<string, unknown>).customInstruction as string
                : fallback.formatGuide.customInstruction,
            enabled:
              typeof (record.formatGuide as Record<string, unknown>).enabled === 'boolean'
                ? (record.formatGuide as Record<string, unknown>).enabled as boolean
                : fallback.formatGuide.enabled,
            mode:
              (record.formatGuide as Record<string, unknown>).mode === 'strict'
                ? 'strict'
                : fallback.formatGuide.mode,
          }
        : fallback.formatGuide,
    overrides:
      record.overrides && typeof record.overrides === 'object'
        ? (record.overrides as MessageRenderingConfig['overrides'])
        : fallback.overrides,
    renderNestedSegments:
      typeof record.renderNestedSegments === 'boolean'
        ? record.renderNestedSegments
        : fallback.renderNestedSegments,
    sampleText:
      typeof record.sampleText === 'string'
        ? record.sampleText
        : fallback.sampleText,
  }
}

export function applyMessageRenderingConfigToSettings(
  settings: AppSettings,
  config: MessageRenderingConfig,
): AppSettings {
  return {
    ...settings,
    [SETTINGS_KEY]: config,
  }
}
