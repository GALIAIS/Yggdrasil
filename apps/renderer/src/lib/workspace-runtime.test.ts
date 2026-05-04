import { describe, expect, test } from 'vitest'
import type { AppSettings } from '@yggdrasil/api-client'

import {
  applyChatCompletionModelCache,
  applyCurrentModelToSettings,
  applyOpenAiBehaviorToSettings,
  applyGenerationParameterToSettings,
  resolveCurrentModel,
  resolveProviderGenerationParameters,
  resolveOpenAiReasoningEffort,
  resolveOpenAiStreamingEnabled,
  resolveCurrentModelOptions,
} from './workspace-runtime'

describe('resolveCurrentModelOptions', () => {
  test('deduplicates chat completion models from current settings', () => {
    const settings: AppSettings = {
      main_api: 'openai',
      openai_model: 'model-a',
      azure_openai_model: 'model-a',
      oai_settings: {
        openai_model: 'model-b',
      },
    }

    expect(resolveCurrentModelOptions(settings)).toEqual([
      'model-a',
      'model-b',
    ])
  })

  test('collects active and fallback text generation models', () => {
    const settings: AppSettings = {
      main_api: 'textgenerationwebui',
      textgenerationwebui_settings: {
        type: 'openrouter',
        openrouter_model: 'openrouter/auto',
        custom_model: 'fallback/custom',
      },
    }

    expect(resolveCurrentModel(settings)).toBe('openrouter/auto')
    expect(resolveCurrentModelOptions(settings)).toEqual([
      'openrouter/auto',
      'fallback/custom',
    ])
  })

  test('returns all configured horde models', () => {
    const settings: AppSettings = {
      main_api: 'koboldhorde',
      horde_settings: {
        models: ['model-a', 'model-b', 'model-a'],
      },
    }

    expect(resolveCurrentModelOptions(settings)).toEqual(['model-a', 'model-b'])
  })

  test('includes persisted chat completion cache for openai model pickers', () => {
    const settings: AppSettings = {
      chat_completion_model_names: ['model-c', 'model-d'],
      main_api: 'openai',
      openai_model: 'model-c',
    }

    expect(resolveCurrentModelOptions(settings)).toEqual([
      'model-c',
      'model-d',
    ])
  })

  test('prefers azure model when azure chat completion source is active', () => {
    const settings: AppSettings = {
      azure_openai_model: 'azure/deployment-a',
      chat_completion_model_names: ['fallback-openai', 'azure/deployment-a'],
      chat_completion_source: 'azure_openai',
      main_api: 'openai',
      oai_settings: {
        azure_openai_model: 'azure/deployment-b',
        chat_completion_source: 'azure_openai',
        openai_model: 'nested-fallback-openai',
      },
      openai_model: 'fallback-openai',
    }

    expect(resolveCurrentModel(settings)).toBe('azure/deployment-a')
    expect(resolveCurrentModelOptions(settings)).toEqual([
      'fallback-openai',
      'azure/deployment-a',
      'nested-fallback-openai',
      'azure/deployment-b',
    ])
  })
})

describe('applyCurrentModelToSettings', () => {
  test('writes a novel model back into nai settings', () => {
    const settings: AppSettings = {
      main_api: 'novel',
      nai_settings: {
        model_novel: 'old-model',
      },
    }

    expect(applyCurrentModelToSettings(settings, 'kayra-v1')).toMatchObject({
      nai_settings: {
        model_novel: 'kayra-v1',
      },
    })
  })

  test('writes a koboldcpp textgen model back into its dedicated provider slot', () => {
    const settings: AppSettings = {
      main_api: 'textgenerationwebui',
      textgenerationwebui_settings: {
        type: 'koboldcpp',
        koboldcpp_model: 'kobold-old',
      },
    }

    expect(applyCurrentModelToSettings(settings, 'llama-new')).toMatchObject({
      textgenerationwebui_settings: {
        type: 'koboldcpp',
        koboldcpp_model: 'llama-new',
      },
    })
  })

  test('reads huggingface textgen model from the active provider slot', () => {
    const settings: AppSettings = {
      main_api: 'textgenerationwebui',
      textgenerationwebui_settings: {
        type: 'huggingface',
        huggingface_model: 'hf/model-a',
      },
    }

    expect(resolveCurrentModel(settings)).toBe('hf/model-a')
  })

  test('keeps root and nested openai model in sync', () => {
    const settings: AppSettings = {
      chat_completion_model_names: ['existing-model'],
      main_api: 'openai',
      oai_settings: {},
      openai_model: 'old-model',
    }

    expect(applyCurrentModelToSettings(settings, 'new-model')).toMatchObject({
      chat_completion_model_names: ['existing-model', 'new-model'],
      openai_model: 'new-model',
      oai_settings: {
        chat_completion_model_names: ['existing-model', 'new-model'],
        openai_model: 'new-model',
      },
    })
  })
})

describe('applyGenerationParameterToSettings', () => {
  test('syncs openai output tokens into both generic and provider-specific fields', () => {
    const settings: AppSettings = {
      main_api: 'openai',
      oai_settings: {},
    }

    expect(applyGenerationParameterToSettings(settings, 'amount_gen', 1536)).toMatchObject({
      amount_gen: 1536,
      openai_max_tokens: 1536,
      oai_settings: {
        openai_max_tokens: 1536,
      },
    })
  })

  test('writes textgen repetition penalty into textgenerationwebui settings', () => {
    const settings: AppSettings = {
      main_api: 'textgenerationwebui',
      textgenerationwebui_settings: {
        rep_pen: 1.1,
      },
    }

    expect(applyGenerationParameterToSettings(settings, 'rep_pen', 1.35)).toMatchObject({
      textgenerationwebui_settings: {
        rep_pen: 1.35,
      },
    })
  })

  test('writes openai stream and reasoning behavior into both root and nested settings', () => {
    const settings: AppSettings = {
      main_api: 'openai',
      oai_settings: {},
    }

    const withStreaming = applyOpenAiBehaviorToSettings(settings, 'stream_openai', true)
    const withReasoning = applyOpenAiBehaviorToSettings(withStreaming, 'reasoning_effort_openai', 'high')

    expect(withReasoning).toMatchObject({
      stream_openai: true,
      reasoning_effort_openai: 'high',
      oai_settings: {
        stream_openai: true,
        reasoning_effort_openai: 'high',
      },
    })
  })
})

describe('provider parameter helpers', () => {
  test('resolves openai inspector parameters from provider-specific fields', () => {
    const settings: AppSettings = {
      amount_gen: 900,
      freq_pen_openai: 0.4,
      main_api: 'openai',
      temp_openai: 0.65,
      top_p_openai: 0.82,
    }

    expect(resolveProviderGenerationParameters(settings)).toEqual({
      amount_gen: 900,
      penaltyField: 'freq_pen',
      penaltyValue: 0.4,
      temp: 0.65,
      top_p: 0.82,
    })
  })

  test('persists fetched model cache into settings payload', () => {
    const settings: AppSettings = {
      main_api: 'openai',
      oai_settings: {},
    }

    expect(applyChatCompletionModelCache(settings, ['a', 'b', 'a'])).toMatchObject({
      chat_completion_model_names: ['a', 'b'],
      oai_settings: {
        chat_completion_model_names: ['a', 'b'],
      },
    })
  })

  test('round-trips refreshed chat completion models into control-bar options', () => {
    const settings: AppSettings = {
      chat_completion_source: 'custom',
      main_api: 'openai',
      oai_settings: {},
      openai_model: 'model-a',
    }

    const nextSettings = applyChatCompletionModelCache(settings, [
      'model-a',
      'model-b',
      'model-a',
    ])

    expect(resolveCurrentModel(nextSettings)).toBe('model-a')
    expect(resolveCurrentModelOptions(nextSettings)).toEqual([
      'model-a',
      'model-b',
    ])
  })

  test('resolves openai streaming and reasoning flags from synced settings', () => {
    const settings: AppSettings = {
      main_api: 'openai',
      stream_openai: true,
      reasoning_effort_openai: 'medium',
      oai_settings: {},
    }

    expect(resolveOpenAiStreamingEnabled(settings)).toBe(true)
    expect(resolveOpenAiReasoningEffort(settings)).toBe('medium')
  })
})
