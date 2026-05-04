import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { MessageContentSegments } from './MessageContentSegments'
import { createDefaultMessageRenderingConfig, resolveMessageRenderingProfile } from '@/lib/chat-rendering'

describe('MessageContentSegments', () => {
  test('renders only outer narration wrapper by default', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())

    const markup = renderToStaticMarkup(
      <MessageContentSegments
        profile={profile}
        text='> 爱尔奎特·布伦史塔德: *她眨了眨眼，然后露出一个毫无保留的笑容。像是得到了什么意外的礼物一样。*'
      />,
    )

    expect(markup).toContain('ref-message-segment-narration')
    expect(markup).not.toContain('ref-message-segment-action')
    expect(markup).toContain('爱尔奎特·布伦史塔德:')
    expect(markup).toContain('她眨了眨眼，然后露出一个毫无保留的笑容。像是得到了什么意外的礼物一样。')
    expect(markup).not.toContain('&gt;')
    expect(markup).toContain('*她眨了眨眼')
  })

  test('renders only outer dialogue wrapper by default', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())

    const markup = renderToStaticMarkup(
      <MessageContentSegments
        profile={profile}
        text='“爱尔奎特·布伦史塔德: *她眨了眨眼，然后笑了起来。*”'
      />,
    )

    expect(markup).toContain('ref-message-segment-dialogue')
    expect(markup).not.toContain('ref-message-segment-action')
    expect(markup).toContain('爱尔奎特·布伦史塔德:')
    expect(markup).toContain('她眨了眨眼，然后笑了起来。')
    expect(markup).toContain('“')
    expect(markup).toContain('”')
    expect(markup).toContain('*她眨了眨眼')
  })

  test('renders nested wrappers only when enabled', () => {
    const config = createDefaultMessageRenderingConfig()
    config.renderNestedSegments = true
    const profile = resolveMessageRenderingProfile(config)

    const markup = renderToStaticMarkup(
      <MessageContentSegments
        profile={profile}
        text='*她俯身凑近，轻声说：“别乱动。”*'
      />,
    )

    expect(markup).toContain('ref-message-segment-action')
    expect(markup).toContain('ref-message-segment-dialogue')
    expect(markup).toContain('她俯身凑近，轻声说：')
    expect(markup).toContain('“别乱动。”')
  })

  test('keeps nested dialogue literal by default', () => {
    const profile = resolveMessageRenderingProfile(createDefaultMessageRenderingConfig())

    const markup = renderToStaticMarkup(
      <MessageContentSegments
        profile={profile}
        text='*她俯身凑近，轻声说：“别乱动。”*'
      />,
    )

    expect(markup).toContain('ref-message-segment-action')
    expect(markup).not.toContain('ref-message-segment-dialogue')
    expect(markup).toContain('她俯身凑近，轻声说：')
    expect(markup).toContain('“别乱动。”')
  })
})
