import { useMemo, type CSSProperties } from 'react'

import {
  parseMessageSegments,
  type MessageRenderRule,
  type MessageRenderingProfile,
  type MessageRenderSegment,
} from '@/lib/chat-rendering'
import { cn } from '@/lib/utils'

export function MessageContentSegments({
  className,
  profile,
  text,
}: {
  className?: string
  profile: MessageRenderingProfile | null | undefined
  text: string
}) {
  const segments = useMemo(() => parseMessageSegments(text, profile), [profile, text])

  return (
    <div className={cn('ref-message-content', className)}>
      {segments.map((segment, index) => (
        <MessageContentSegment
          key={`${segment.ruleId ?? segment.kind}-${index}-${segment.text}`}
          depth={0}
          profile={profile}
          segment={segment}
        />
      ))}
    </div>
  )
}

function MessageContentSegment({
  depth,
  profile,
  segment,
}: {
  depth: number
  profile: MessageRenderingProfile | null | undefined
  segment: MessageRenderSegment
}) {
  const sourceStyle = segment.style
  const style = sourceStyle
    ? ({
        '--segment-accent': sourceStyle.accentColor,
        '--segment-bg': sourceStyle.backgroundTint,
        '--segment-color': sourceStyle.textColor,
        '--segment-font-style': sourceStyle.fontStyle,
        '--segment-font-weight': resolveFontWeight(sourceStyle.fontWeight),
      } as CSSProperties)
    : undefined
  const nestedSegments = useMemo(() => {
    if (!profile || !profile.renderNestedSegments || depth >= 2 || segment.kind === 'plain') {
      return null
    }

    const nestedSource = segment.kind === 'dialogue'
      ? extractDialogueInnerText(segment.text, resolvePrimaryDialogueRule(profile))
      : segment.text
    if (!nestedSource) {
      return null
    }

    const parsed = parseMessageSegments(nestedSource, profile)
    if (parsed.length === 0) {
      return null
    }

    if (
      parsed.length === 1
      && parsed[0]?.kind === segment.kind
      && parsed[0]?.text === segment.text
    ) {
      return null
    }

    const containsStructuredChild = parsed.some((item) => item.kind !== 'plain')
    return containsStructuredChild ? parsed : null
  }, [depth, profile, segment.kind, segment.text])

  return (
    <span
      className={cn(
        'ref-message-segment',
        segment.kind !== 'plain' ? `ref-message-segment-${segment.kind}` : null,
      )}
      style={style}
    >
      {nestedSegments ? (
        <>
          {segment.kind === 'dialogue'
            ? resolveDialogueWrapper(profile, 'open')
            : null}
          {nestedSegments.map((childSegment, index) => (
            <MessageContentSegment
              depth={depth + 1}
              key={`${childSegment.ruleId ?? childSegment.kind}-${depth + 1}-${index}-${childSegment.text}`}
              profile={profile}
              segment={childSegment}
            />
          ))}
          {segment.kind === 'dialogue'
            ? resolveDialogueWrapper(profile, 'close')
            : null}
        </>
      ) : segment.text}
    </span>
  )
}

function resolvePrimaryDialogueRule(
  profile: MessageRenderingProfile | null | undefined,
): MessageRenderRule | null {
  if (!profile) return null
  return profile.template.rules
    .filter((rule) => rule.enabled && rule.kind === 'dialogue' && rule.patternMode === 'wrapped' && 'open' in rule.pattern && 'close' in rule.pattern)
    .sort((left, right) => right.priority - left.priority)[0] ?? null
}

function extractDialogueInnerText(
  text: string,
  rule: MessageRenderRule | null,
): string {
  if (!rule || !('open' in rule.pattern) || !('close' in rule.pattern)) {
    return text
  }

  const open = rule.pattern.open
  const close = rule.pattern.close
  if (
    text.startsWith(open)
    && text.endsWith(close)
    && text.length >= open.length + close.length
  ) {
    return text.slice(open.length, text.length - close.length)
  }

  return text
}

function resolveDialogueWrapper(
  profile: MessageRenderingProfile | null | undefined,
  side: 'close' | 'open',
): string {
  const rule = resolvePrimaryDialogueRule(profile)
  if (!rule || !('open' in rule.pattern) || !('close' in rule.pattern)) {
    return ''
  }

  return rule.pattern[side]
}

function resolveFontWeight(value: string): number {
  switch (value) {
    case 'medium':
      return 500
    case 'semibold':
      return 600
    case 'bold':
      return 700
    case 'normal':
    default:
      return 400
  }
}
