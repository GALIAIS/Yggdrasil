import { describe, expect, test } from 'vitest'

import { applyMessageRenderingConfigToSettings, resolveMessageRenderingConfigFromSettings } from './chat-rendering-settings'
import { createDefaultMessageRenderingConfig } from './chat-rendering'

describe('chat rendering settings', () => {
  test('falls back for missing config', () => {
    const config = resolveMessageRenderingConfigFromSettings({})

    expect(config.activeTemplateId).toBe('classic-novel')
    expect(config.formatGuide.enabled).toBe(true)
    expect(config.formatGuide.mode).toBe('strict')
    expect(config.renderNestedSegments).toBe(false)
    expect(config.sampleText.length).toBeGreaterThan(0)
  })

  test('writes config onto settings payload', () => {
    const config = createDefaultMessageRenderingConfig()
    config.renderNestedSegments = true
    const next = applyMessageRenderingConfigToSettings({}, config)

    expect(next.message_rendering).toEqual(config)
  })
})
