import { describe, expect, test } from 'vitest'

import {
  createDefaultMessageRenderingConfig,
  parseMessageSegments,
  resolveMessageRenderingProfile,
  upsertRuleOverride,
} from './chat-rendering'

describe('chat rendering parser', () => {
  test('parses wrapped dialogue and plain gaps', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())
    const segments = parseMessageSegments('她说：“你好。” 然后离开。', profile)

    expect(segments.map((segment) => segment.kind)).toEqual(['plain', 'dialogue', 'plain'])
    expect(segments[1]?.text).toBe('“你好。”')
  })

  test('parses action and thought in same message', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())
    const segments = parseMessageSegments('*她放下杯子。*（现在该说实话了。）', profile)

    expect(segments.map((segment) => segment.kind)).toEqual(['action', 'thought'])
  })

  test('hides narration line prefix markers in rendered output', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())
    const segments = parseMessageSegments('> 火光摇曳\n普通正文', profile)

    expect(segments[0]?.kind).toBe('narration')
    expect(segments[0]?.text).toBe('火光摇曳')
    expect(segments[1]?.kind).toBe('plain')
  })

  test('renders unmatched opening wrappers as wrapped content fallback', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())
    const segments = parseMessageSegments('“带路吧。但你欠我一个解释，金发的。', profile)

    expect(segments).toEqual([
      expect.objectContaining({
        kind: 'dialogue',
        text: '“带路吧。但你欠我一个解释，金发的。”',
      }),
    ])
  })

  test('parses mixed wrapper aliases as the same dialogue segment', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())
    const segments = parseMessageSegments('「带路吧。”', profile)

    expect(segments).toEqual([
      expect.objectContaining({
        kind: 'dialogue',
        text: '“带路吧。”',
      }),
    ])
  })

  test('respects rule disable override', () => {
    const base = createDefaultMessageRenderingConfig()
    const next = upsertRuleOverride(base, base.activeTemplateId, 'cn-action-star', {
      enabled: false,
    })
    const profile = resolveMessageRenderingProfile(next)
    const segments = parseMessageSegments('*她放下杯子。*', profile)

    expect(segments).toEqual([{ kind: 'plain', text: '*她放下杯子。*' }])
  })

  test('parses line prefix narration', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())
    const segments = parseMessageSegments('> 火光摇曳\n普通正文', profile)

    expect(segments[0]?.kind).toBe('narration')
    expect(segments[1]?.kind).toBe('plain')
  })
})
