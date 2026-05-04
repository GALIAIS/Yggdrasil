import { describe, expect, test } from 'vitest'
import type { SettingsPayload } from '@yggdrasil/api-client'

import { buildGenerationReadiness, buildSettingsSummary } from './settings'

const messages: Record<string, string> = {
  'settingsData.summary.username': 'Username',
  'settingsData.summary.mainApi': 'Primary API',
  'settingsData.summary.maxContext': 'Max Context',
  'settingsData.summary.amountGen': 'Generation Length',
  'settingsData.summary.textgenType': 'TextGen Type',
  'settingsData.summary.novelModel': 'Novel Model',
  'settingsData.summary.hordeModelCount': 'Horde Model Count',
  'settingsData.summary.swipes': 'Swipes',
  'settingsData.summary.accountMode': 'Account Mode',
  'settingsData.summary.extensions': 'Extensions',
  'settingsData.summary.extensionsAutoUpdate': 'Extension Auto Update',
  'settingsData.states.enabled': 'Enabled',
  'settingsData.states.disabled': 'Disabled',
  'settingsData.states.multiAccount': 'Multi-account enabled',
  'settingsData.states.singleAccount': 'Single-account / disabled',
  'settingsData.readiness.hordeMissing': 'At least one Horde model is required for the Horde primary chain.',
  'settingsData.readiness.chatAzureDeploymentMissing':
    'The Azure OpenAI primary chain is missing a deployment name.',
  'settingsData.readiness.textgenServerMissing': 'The TextGen primary chain is missing an API address.',
  'settingsData.readiness.textgenTypeMissing': 'The TextGen primary chain is missing an API type.',
  'settingsData.readiness.novelModelMissing': 'The NovelAI primary chain is missing a model.',
  'settingsData.readiness.pendingSummary': 'Pending {{count}} for {{mainApi}}',
  'settingsData.readiness.noPrimaryApi': 'No primary API selected yet.',
  'settingsData.readiness.modelsSuffix': '{{count}} models',
  'settingsData.readiness.readySummary': 'Ready {{mainApi}}{{suffix}}',
  'settingsPanel.notSelected': 'Not selected',
  'common.unconfigured': 'Unconfigured',
  'common.unknown': 'Unknown',
}

const t = (key: string, params?: Record<string, string | number>) =>
  (messages[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''))

describe('buildSettingsSummary', () => {
  test('includes textgen, novel, and horde desktop summary fields', () => {
    const payload: SettingsPayload = {
      rawSettings: '{}',
      settings: {
        username: 'Tester',
        main_api: 'textgenerationwebui',
        max_context: 4096,
        amount_gen: 512,
        swipes: true,
        textgenerationwebui_settings: {
          type: 'llamacpp',
        },
        nai_settings: {
          model_novel: 'kayra-v1',
        },
        horde_settings: {
          models: ['koboldcpp/L3-8B-Stheno-v3.2'],
        },
      },
      enable_accounts: true,
      enable_extensions: true,
      enable_extensions_auto_update: false,
    }

    const summary = buildSettingsSummary(payload, t)

    expect(summary).toEqual(
      expect.arrayContaining([
        { id: 'textgenType', label: 'TextGen Type', value: 'llamacpp' },
        { id: 'novelModel', label: 'Novel Model', value: 'kayra-v1' },
        { id: 'hordeModelCount', label: 'Horde Model Count', value: '1' },
      ]),
    )
  })
})

describe('buildGenerationReadiness', () => {
  test('reports blockers for missing horde models', () => {
    const result = buildGenerationReadiness('koboldhorde', {
      hordeModelCount: 0,
    }, t)

    expect(result.blockers).toContain('At least one Horde model is required for the Horde primary chain.')
  })

  test('reports blockers for missing azure deployment name', () => {
    const result = buildGenerationReadiness(
      'openai',
      {
        chatCompletionBaseUrl: 'https://example.openai.azure.com',
        chatCompletionModel: 'gpt-4.1',
        chatCompletionSource: 'azure_openai',
      },
      t,
    )

    expect(result.blockers).toContain(
      'The Azure OpenAI primary chain is missing a deployment name.',
    )
  })

  test('accepts ready textgen minimum config', () => {
    const result = buildGenerationReadiness('textgenerationwebui', {
      textgenApiServer: 'http://127.0.0.1:5000',
      textgenType: 'ooba',
      textgenModel: '',
    }, t)

    expect(result.blockers).toEqual([])
    expect(result.summary).toContain('Ready textgenerationwebui')
  })
})
