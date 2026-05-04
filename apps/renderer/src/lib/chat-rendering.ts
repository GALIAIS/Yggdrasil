export type MessageRenderKind =
  | 'dialogue'
  | 'action'
  | 'thought'
  | 'narration'
  | 'plain'

export type MessageRenderPatternMode = 'wrapped' | 'linePrefix' | 'regex'

export type MessageRenderFontWeight = 'normal' | 'medium' | 'semibold' | 'bold'

export type MessageRenderFontStyle = 'normal' | 'italic'

export type WrappedPattern = {
  close: string
  open: string
}

export type LinePrefixPattern = {
  prefix: string
}

export type RegexPattern = {
  expression: string
  flags?: string
}

export type MessageRenderPattern = WrappedPattern | LinePrefixPattern | RegexPattern

export type MessageRenderStyle = {
  accentColor: string
  backgroundTint: string
  fontStyle: MessageRenderFontStyle
  fontWeight: MessageRenderFontWeight
  textColor: string
}

export type MessageRenderRule = {
  enabled: boolean
  id: string
  kind: MessageRenderKind
  label: string
  multiline: boolean
  pattern: MessageRenderPattern
  patternMode: MessageRenderPatternMode
  priority: number
  style: MessageRenderStyle
}

export type MessageRenderTemplate = {
  description: string
  id: string
  name: string
  rules: MessageRenderRule[]
}

export type MessageRenderRuleOverride = Partial<
  Omit<MessageRenderRule, 'id' | 'kind' | 'label'>
> & {
  style?: Partial<MessageRenderStyle>
}

export type MessageRenderingConfig = {
  activeTemplateId: string
  formatGuide: MessageRenderingFormatGuide
  overrides: Record<string, Record<string, MessageRenderRuleOverride>>
  renderNestedSegments: boolean
  sampleText: string
}

export type MessageRenderingProfile = {
  renderNestedSegments: boolean
  template: MessageRenderTemplate
}

export type MessageRenderingFormatMode = 'balanced' | 'strict'

export type MessageRenderingFormatGuide = {
  customInstruction: string
  enabled: boolean
  mode: MessageRenderingFormatMode
}

export type MessageRenderSegment = {
  kind: MessageRenderKind
  ruleId?: string
  style?: MessageRenderStyle
  text: string
}

const DEFAULT_SAMPLE_TEXT = [
  '“别靠近那扇门。”',
  '*她抬手拦住你，披风边角擦过桌沿。*',
  '（如果他现在进去，事情就会失控。）',
  '> 火光在木梁上轻轻晃动，整间大厅都安静了一瞬。',
  '你注意到她的目光始终停在门缝后的黑暗里。',
].join('\n')

const BASE_STYLE: MessageRenderStyle = {
  accentColor: 'rgba(171, 132, 78, 0.7)',
  backgroundTint: 'transparent',
  fontStyle: 'normal',
  fontWeight: 'normal',
  textColor: 'rgba(228,214,189,0.92)',
}

function createRule(
  input: Omit<MessageRenderRule, 'enabled' | 'multiline' | 'priority' | 'style'> &
    Partial<Pick<MessageRenderRule, 'enabled' | 'multiline' | 'priority'>> & {
      style?: Partial<MessageRenderStyle>
    },
): MessageRenderRule {
  return {
    ...input,
    enabled: input.enabled ?? true,
    multiline: input.multiline ?? false,
    priority: input.priority ?? 100,
    style: {
      ...BASE_STYLE,
      ...input.style,
    },
  }
}

export const BUILT_IN_MESSAGE_RENDER_TEMPLATES: MessageRenderTemplate[] = [
  {
    id: 'classic-novel',
    name: 'Classic Novel',
    description: 'Use bright quoted dialogue, subdued actions, and soft thought asides.',
    rules: [
      createRule({
        id: 'cn-dialogue-curly',
        kind: 'dialogue',
        label: 'Curly Quote Dialogue',
        patternMode: 'wrapped',
        pattern: { open: '“', close: '”' },
        priority: 220,
        style: {
          textColor: 'rgba(241, 220, 178, 0.98)',
          fontWeight: 'semibold',
          accentColor: 'rgba(196, 154, 90, 0.78)',
        },
      }),
      createRule({
        id: 'cn-dialogue-straight',
        kind: 'dialogue',
        label: 'Straight Quote Dialogue',
        patternMode: 'wrapped',
        pattern: { open: '"', close: '"' },
        priority: 210,
        style: {
          textColor: 'rgba(236, 215, 171, 0.96)',
          fontWeight: 'semibold',
          accentColor: 'rgba(196, 154, 90, 0.72)',
        },
      }),
      createRule({
        id: 'cn-action-star',
        kind: 'action',
        label: 'Asterisk Action',
        patternMode: 'wrapped',
        pattern: { open: '*', close: '*' },
        priority: 180,
        style: {
          textColor: 'rgba(188, 204, 215, 0.92)',
          fontStyle: 'italic',
          backgroundTint: 'rgba(77, 106, 126, 0.12)',
          accentColor: 'rgba(106, 146, 172, 0.68)',
        },
      }),
      createRule({
        id: 'cn-thought-round',
        kind: 'thought',
        label: 'Round Bracket Thought',
        patternMode: 'wrapped',
        pattern: { open: '（', close: '）' },
        priority: 160,
        style: {
          textColor: 'rgba(190, 176, 222, 0.92)',
          fontStyle: 'italic',
          backgroundTint: 'rgba(104, 84, 132, 0.12)',
          accentColor: 'rgba(133, 107, 168, 0.72)',
        },
      }),
      createRule({
        id: 'cn-narration-prefix',
        kind: 'narration',
        label: 'Quoted Narration Prefix',
        patternMode: 'linePrefix',
        pattern: { prefix: '>' },
        priority: 120,
        multiline: true,
        style: {
          textColor: 'rgba(199, 185, 159, 0.88)',
          backgroundTint: 'rgba(116, 89, 55, 0.1)',
          accentColor: 'rgba(126, 98, 64, 0.64)',
        },
      }),
    ],
  },
  {
    id: 'roleplay-bracket',
    name: 'Roleplay Bracket',
    description: 'Lean into RP formatting with Japanese quotes, bracket thoughts, and stage directions.',
    rules: [
      createRule({
        id: 'rb-dialogue-jp',
        kind: 'dialogue',
        label: 'Japanese Quote Dialogue',
        patternMode: 'wrapped',
        pattern: { open: '「', close: '」' },
        priority: 220,
        style: {
          textColor: 'rgba(244, 224, 186, 0.98)',
          fontWeight: 'bold',
          accentColor: 'rgba(204, 159, 91, 0.82)',
        },
      }),
      createRule({
        id: 'rb-action-star',
        kind: 'action',
        label: 'Stage Direction',
        patternMode: 'wrapped',
        pattern: { open: '*', close: '*' },
        priority: 190,
        style: {
          textColor: 'rgba(174, 214, 202, 0.92)',
          fontStyle: 'italic',
          backgroundTint: 'rgba(72, 110, 97, 0.14)',
          accentColor: 'rgba(88, 148, 131, 0.72)',
        },
      }),
      createRule({
        id: 'rb-thought-square',
        kind: 'thought',
        label: 'Internal Monologue',
        patternMode: 'wrapped',
        pattern: { open: '(', close: ')' },
        priority: 170,
        style: {
          textColor: 'rgba(194, 176, 222, 0.92)',
          fontStyle: 'italic',
          backgroundTint: 'rgba(92, 77, 121, 0.12)',
          accentColor: 'rgba(124, 103, 168, 0.68)',
        },
      }),
      createRule({
        id: 'rb-narration-bracket',
        kind: 'narration',
        label: 'Narration Label',
        patternMode: 'linePrefix',
        pattern: { prefix: '【旁白】' },
        priority: 150,
        multiline: true,
        style: {
          textColor: 'rgba(209, 197, 173, 0.88)',
          backgroundTint: 'rgba(125, 98, 65, 0.12)',
          accentColor: 'rgba(125, 98, 65, 0.7)',
        },
      }),
    ],
  },
  {
    id: 'tavern-cinematic',
    name: 'Tavern Cinematic',
    description: 'Blend quoted lines, visual action blocks, and cinematic narration for scene-heavy chats.',
    rules: [
      createRule({
        id: 'tc-dialogue-curly',
        kind: 'dialogue',
        label: 'Primary Dialogue',
        patternMode: 'wrapped',
        pattern: { open: '“', close: '”' },
        priority: 230,
        style: {
          textColor: 'rgba(247, 229, 190, 0.99)',
          fontWeight: 'bold',
          backgroundTint: 'rgba(112, 72, 31, 0.12)',
          accentColor: 'rgba(210, 167, 94, 0.86)',
        },
      }),
      createRule({
        id: 'tc-action-underscore',
        kind: 'action',
        label: 'Scene Action',
        patternMode: 'wrapped',
        pattern: { open: '_', close: '_' },
        priority: 200,
        style: {
          textColor: 'rgba(171, 205, 220, 0.94)',
          fontStyle: 'italic',
          backgroundTint: 'rgba(63, 88, 108, 0.14)',
          accentColor: 'rgba(103, 142, 172, 0.78)',
        },
      }),
      createRule({
        id: 'tc-thought-round',
        kind: 'thought',
        label: 'Inner Voice',
        patternMode: 'wrapped',
        pattern: { open: '（', close: '）' },
        priority: 175,
        style: {
          textColor: 'rgba(204, 184, 231, 0.94)',
          fontStyle: 'italic',
          backgroundTint: 'rgba(94, 78, 126, 0.12)',
          accentColor: 'rgba(136, 113, 177, 0.76)',
        },
      }),
      createRule({
        id: 'tc-narration-prefix',
        kind: 'narration',
        label: 'Cinematic Narration',
        patternMode: 'linePrefix',
        pattern: { prefix: '>' },
        priority: 130,
        multiline: true,
        style: {
          textColor: 'rgba(205, 192, 169, 0.9)',
          backgroundTint: 'rgba(80, 63, 42, 0.1)',
          accentColor: 'rgba(131, 100, 63, 0.72)',
        },
      }),
    ],
  },
]

const TEMPLATE_MAP = new Map(BUILT_IN_MESSAGE_RENDER_TEMPLATES.map((template) => [template.id, template]))

export function createDefaultMessageRenderingConfig(): MessageRenderingConfig {
  return {
    activeTemplateId: BUILT_IN_MESSAGE_RENDER_TEMPLATES[0]?.id ?? 'classic-novel',
    formatGuide: {
      customInstruction: '',
      enabled: true,
      mode: 'strict',
    },
    overrides: {},
    renderNestedSegments: false,
    sampleText: DEFAULT_SAMPLE_TEXT,
  }
}

export function getMessageRenderingTemplate(templateId: string): MessageRenderTemplate | null {
  return TEMPLATE_MAP.get(templateId) ?? null
}

export function resolveMessageRenderingProfile(
  config: MessageRenderingConfig | null | undefined,
): MessageRenderingProfile {
  const fallback = BUILT_IN_MESSAGE_RENDER_TEMPLATES[0]
  const template = getMessageRenderingTemplate(config?.activeTemplateId ?? '') ?? fallback
  const templateOverrides = config?.overrides?.[template.id] ?? {}

  return {
    renderNestedSegments: Boolean(config?.renderNestedSegments),
    template: {
      ...template,
      rules: template.rules.map((rule) => applyRuleOverride(rule, templateOverrides[rule.id])),
    },
  }
}

function applyRuleOverride(
  rule: MessageRenderRule,
  override: MessageRenderRuleOverride | undefined,
): MessageRenderRule {
  if (!override) {
    return rule
  }

  return {
    ...rule,
    ...override,
    pattern: override.pattern ?? rule.pattern,
    style: {
      ...rule.style,
      ...(override.style ?? {}),
    },
  }
}

type CandidateMatch = {
  end: number
  kind: MessageRenderKind
  priority: number
  ruleId: string
  style: MessageRenderStyle
  text: string
  start: number
}

export function parseMessageSegments(
  text: string,
  profile: MessageRenderingProfile | null | undefined,
): MessageRenderSegment[] {
  if (!text) {
    return [{ kind: 'plain', text: '' }]
  }

  if (!profile) {
    return [{ kind: 'plain', text }]
  }

  const candidates = profile.template.rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) => collectRuleMatches(text, rule))
    .sort((left, right) => {
      if (left.start !== right.start) return left.start - right.start
      if (left.priority !== right.priority) return right.priority - left.priority
      return (right.end - right.start) - (left.end - left.start)
    })

  const accepted: CandidateMatch[] = []
  let cursor = 0

  for (const candidate of candidates) {
    if (candidate.start < cursor) {
      continue
    }

    accepted.push(candidate)
    cursor = candidate.end
  }

  if (accepted.length === 0) {
    return [{ kind: 'plain', text }]
  }

  const segments: MessageRenderSegment[] = []
  let position = 0

  for (const candidate of accepted) {
    if (candidate.start > position) {
      segments.push({
        kind: 'plain',
        text: text.slice(position, candidate.start),
      })
    }

    segments.push({
      kind: candidate.kind,
      ruleId: candidate.ruleId,
      style: candidate.style,
      text: candidate.text,
    })
    position = candidate.end
  }

  if (position < text.length) {
    segments.push({
      kind: 'plain',
      text: text.slice(position),
    })
  }

  return segments.filter((segment) => segment.text.length > 0)
}

function collectRuleMatches(text: string, rule: MessageRenderRule): CandidateMatch[] {
  switch (rule.patternMode) {
    case 'wrapped':
      return collectWrappedMatches(text, rule)
    case 'linePrefix':
      return collectLinePrefixMatches(text, rule)
    case 'regex':
      return collectRegexMatches(text, rule)
    default:
      return []
  }
}

function collectWrappedMatches(text: string, rule: MessageRenderRule): CandidateMatch[] {
  if (!isWrappedPattern(rule.pattern)) {
    return []
  }

  const aliases = resolveWrappedAliases(rule)
  if (aliases.length === 0) {
    return []
  }

  const primaryAlias = aliases[0]
  const open = primaryAlias.open
  const close = primaryAlias.close

  const expression = `${escapeForRegex(open)}([\\s\\S]*?)${escapeForRegex(close)}`
  const flags = `g${rule.multiline ? '' : ''}`
  const regex = new RegExp(expression, flags)
  const matches: CandidateMatch[] = []

  for (const match of text.matchAll(regex)) {
    const value = match[0]
    const inner = match[1] ?? ''
    const start = match.index ?? -1
    if (start < 0 || !value) continue
    if (!rule.multiline && value.includes('\n')) continue
    matches.push({
      end: start + value.length,
      kind: rule.kind,
      priority: rule.priority,
      ruleId: rule.id,
      style: rule.style,
      text: buildRenderedWrappedText(rule, inner, value),
      start,
    })
  }

  for (const alias of aliases) {
    let openIndex = text.indexOf(alias.open)
    while (openIndex >= 0) {
      const scopeEnd = rule.multiline
        ? text.length
        : resolveLineEnd(text, openIndex + alias.open.length)
      const scope = text.slice(openIndex + alias.open.length, scopeEnd)
      const closingMatch = findEarliestAliasClose(scope, aliases)
      const inner = closingMatch
        ? scope.slice(0, closingMatch.index).trim()
        : scope.replace(/^\s+/u, '').trimEnd()

      if (inner.length > 0) {
        const rawText = text.slice(
          openIndex,
          closingMatch
            ? openIndex + alias.open.length + closingMatch.index + closingMatch.close.length
            : scopeEnd,
        )
        matches.push({
          end: closingMatch
            ? openIndex + alias.open.length + closingMatch.index + closingMatch.close.length
            : scopeEnd,
          kind: rule.kind,
          priority: closingMatch ? rule.priority - 1 : rule.priority - 2,
          ruleId: rule.id,
          style: rule.style,
          text: buildRenderedWrappedText(rule, inner, rawText),
          start: openIndex,
        })
      }

      openIndex = text.indexOf(alias.open, openIndex + alias.open.length)
    }
  }

  return dedupeCandidateMatches(matches)
}

function collectLinePrefixMatches(text: string, rule: MessageRenderRule): CandidateMatch[] {
  if (!isLinePrefixPattern(rule.pattern)) {
    return []
  }

  const prefix = rule.pattern.prefix.trim()
  if (!prefix) {
    return []
  }

  const matches: CandidateMatch[] = []
  let offset = 0

  for (const line of text.split('\n')) {
    const rawLine = line
    const lineWithBreak = offset + rawLine.length
    const trimmed = rawLine.trimStart()
    const leadingOffset = rawLine.length - trimmed.length

    if (trimmed.startsWith(prefix)) {
      const start = offset + leadingOffset
      const prefixedLine = text.slice(start, lineWithBreak)
      const content = prefixedLine
        .slice(prefix.length)
        .replace(/^\s+/u, '')
      matches.push({
        end: lineWithBreak,
        kind: rule.kind,
        priority: rule.priority,
        ruleId: rule.id,
        style: rule.style,
        text: content,
        start,
      })
    }

    offset = lineWithBreak + 1
  }

  return matches
}

function collectRegexMatches(text: string, rule: MessageRenderRule): CandidateMatch[] {
  if (!isRegexPattern(rule.pattern)) {
    return []
  }

  const expression = rule.pattern.expression.trim()
  if (!expression) {
    return []
  }

  let regex: RegExp
  try {
    regex = new RegExp(expression, normalizeRegexFlags(rule.pattern.flags))
  } catch {
    return []
  }

  const matches: CandidateMatch[] = []
  for (const match of text.matchAll(regex)) {
    const value = match[0]
    const start = match.index ?? -1
    if (start < 0 || !value) continue
    matches.push({
      end: start + value.length,
      kind: rule.kind,
      priority: rule.priority,
      ruleId: rule.id,
      style: rule.style,
      text: value,
      start,
    })
  }

  return matches
}

function normalizeRegexFlags(flags: string | undefined): string {
  const source = `${flags ?? ''}g`
  return Array.from(new Set(source.split(''))).join('')
}

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function resolveLineEnd(text: string, fromIndex: number): number {
  const nextLineBreak = text.indexOf('\n', fromIndex)
  return nextLineBreak < 0 ? text.length : nextLineBreak
}

function resolveWrappedAliases(rule: MessageRenderRule): Array<{ close: string; open: string }> {
  if (!isWrappedPattern(rule.pattern)) {
    return []
  }

  const aliases = [
    { open: rule.pattern.open, close: rule.pattern.close },
    ...aliasesForKind(rule.kind),
  ]

  return aliases.filter((alias, index, source) =>
    alias.open
    && alias.close
    && source.findIndex((candidate) => candidate.open === alias.open && candidate.close === alias.close) === index,
  )
}

function findEarliestAliasClose(
  value: string,
  aliases: Array<{ close: string; open: string }>,
): { close: string; index: number } | null {
  let bestMatch: { close: string; index: number } | null = null

  for (const alias of aliases) {
    const index = value.indexOf(alias.close)
    if (index < 0) continue
    if (!bestMatch || index < bestMatch.index || (index === bestMatch.index && alias.close.length > bestMatch.close.length)) {
      bestMatch = { close: alias.close, index }
    }
  }

  return bestMatch
}

function dedupeCandidateMatches(matches: CandidateMatch[]): CandidateMatch[] {
  const seen = new Set<string>()
  return matches.filter((match) => {
    const key = `${match.ruleId}:${match.start}:${match.end}:${match.text}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function buildRenderedWrappedText(
  rule: MessageRenderRule,
  inner: string,
  rawValue: string,
): string {
  if (rule.kind !== 'dialogue' || !isWrappedPattern(rule.pattern)) {
    return inner
  }

  const trimmedInner = inner.trim()
  if (!trimmedInner) {
    return rawValue
  }

  return `${rule.pattern.open}${trimmedInner}${rule.pattern.close}`
}

function isWrappedPattern(pattern: MessageRenderPattern): pattern is WrappedPattern {
  return 'open' in pattern && 'close' in pattern
}

function isLinePrefixPattern(pattern: MessageRenderPattern): pattern is LinePrefixPattern {
  return 'prefix' in pattern
}

function isRegexPattern(pattern: MessageRenderPattern): pattern is RegexPattern {
  return 'expression' in pattern
}

export function cloneMessageRenderingConfig(
  config: MessageRenderingConfig,
): MessageRenderingConfig {
  return JSON.parse(JSON.stringify(config)) as MessageRenderingConfig
}

export function buildMessageRenderingInstruction(
  config: MessageRenderingConfig | null | undefined,
): string {
  const resolvedConfig = config ?? createDefaultMessageRenderingConfig()
  const profile = resolveMessageRenderingProfile(resolvedConfig)
  const formatGuide = resolvedConfig.formatGuide

  if (!formatGuide.enabled) {
    return ''
  }

  const ruleLines = buildRuleInstructionLines(profile.template.rules)
  if (ruleLines.length === 0) {
    return ''
  }

  const header =
    formatGuide.mode === 'strict'
      ? 'Output formatting contract: follow these markers exactly, do not invent alternative delimiters, and treat this as a hard requirement for the reply.'
      : 'Preferred output formatting: keep these markers consistent whenever they fit the scene.'

  const enforcementLine =
    formatGuide.mode === 'strict'
      ? 'Every non-empty line or paragraph in the reply must match one allowed format below. If a sentence does not fit dialogue, action, or thought, write it as narration using the narration marker.'
      : 'Use plain text only for neutral connective prose that does not belong to one of the marked categories.'

  const customInstruction = formatGuide.customInstruction.trim()

  return [
    header,
    enforcementLine,
    ...ruleLines.map((line, index) => `${index + 1}. ${line}`),
    'Do not explain the format, do not add labels like "Dialogue:" or "Thought:", and do not wrap the whole reply in code fences.',
    formatGuide.mode === 'strict'
      ? 'Before sending, quickly verify that the reply uses only the allowed markers and that no bare dialogue or bare action remains.'
      : '',
    customInstruction ? `Additional formatting preference:\n${customInstruction}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildMessageRenderingLockInstruction(
  config: MessageRenderingConfig | null | undefined,
): string {
  const resolvedConfig = config ?? createDefaultMessageRenderingConfig()
  const profile = resolveMessageRenderingProfile(resolvedConfig)
  const formatGuide = resolvedConfig.formatGuide

  if (!formatGuide.enabled || formatGuide.mode !== 'strict') {
    return ''
  }

  const ruleLines = buildRuleInstructionLines(profile.template.rules)
  if (ruleLines.length === 0) {
    return ''
  }

  return [
    'Final reply format lock for this turn:',
    'Use only the exact markers below. Do not output bare dialogue, bare actions, or unlabeled inner thoughts.',
    'If any content does not fit dialogue, action, or thought, render it as narration with the narration marker.',
    ...ruleLines.map((line, index) => `${index + 1}. ${line}`),
  ].join('\n')
}

export function buildMessageRenderingCheatSheet(
  config: MessageRenderingConfig | null | undefined,
): string {
  const resolvedConfig = config ?? createDefaultMessageRenderingConfig()
  const profile = resolveMessageRenderingProfile(resolvedConfig)
  const ruleLines = buildRuleInstructionLines(profile.template.rules)

  return ruleLines.map((line, index) => `${index + 1}. ${line}`).join('\n')
}

export function normalizeStrictMessageRenderingOutput(
  text: string,
  config: MessageRenderingConfig | null | undefined,
): string {
  const resolvedConfig = config ?? createDefaultMessageRenderingConfig()
  if (!resolvedConfig.formatGuide.enabled || resolvedConfig.formatGuide.mode !== 'strict') {
    return text
  }

  const profile = resolveMessageRenderingProfile(resolvedConfig)
  const topRules = new Map<MessageRenderKind, MessageRenderRule>()

  for (const kind of ['dialogue', 'action', 'thought', 'narration'] as const) {
    const rule = profile.template.rules
      .filter((candidate) => candidate.enabled && candidate.kind === kind)
      .sort((left, right) => right.priority - left.priority)[0]
    if (rule) {
      topRules.set(kind, rule)
    }
  }

  const paragraphs = text.split(/\n{2,}/)
  const normalizedParagraphs = paragraphs.map((paragraph) =>
    normalizeStrictParagraph(paragraph, topRules),
  )

  return normalizedParagraphs.join('\n\n').trim()
}

function buildRuleInstructionLines(rules: MessageRenderRule[]): string[] {
  const orderedKinds: MessageRenderKind[] = ['dialogue', 'action', 'thought', 'narration']
  const lines: string[] = []

  for (const kind of orderedKinds) {
    const rule = rules
      .filter((candidate) => candidate.enabled && candidate.kind === kind)
      .sort((left, right) => right.priority - left.priority)[0]

    if (!rule) continue
    const description = describeRulePattern(rule)
    if (!description) continue
    lines.push(`${resolveKindLabel(kind)} uses ${description}.`)
  }

  return lines
}

function describeRulePattern(rule: MessageRenderRule): string {
  switch (rule.patternMode) {
    case 'wrapped':
      if ('open' in rule.pattern && 'close' in rule.pattern) {
        return `matching wrappers ${rule.pattern.open}...${rule.pattern.close}`
      }
      return ''
    case 'linePrefix':
      if ('prefix' in rule.pattern) {
        return `a line that begins with ${rule.pattern.prefix}`
      }
      return ''
    case 'regex':
      if ('expression' in rule.pattern) {
        return `the regex pattern /${rule.pattern.expression}/${rule.pattern.flags ?? 'g'}`
      }
      return ''
    default:
      return ''
  }
}

function normalizeStrictParagraph(
  paragraph: string,
  rules: Map<MessageRenderKind, MessageRenderRule>,
): string {
  const trimmed = paragraph.trim()
  if (!trimmed) {
    return ''
  }

  const normalizedWrapped =
    normalizeWrappedParagraph(trimmed, rules.get('dialogue')) ??
    normalizeWrappedParagraph(trimmed, rules.get('action')) ??
    normalizeWrappedParagraph(trimmed, rules.get('thought'))

  if (normalizedWrapped) {
    return normalizedWrapped
  }

  const narrationRule = rules.get('narration')
  if (narrationRule?.patternMode === 'linePrefix' && isLinePrefixPattern(narrationRule.pattern)) {
    const prefix = narrationRule.pattern.prefix.trim()
    if (prefix && !trimmed.startsWith(prefix)) {
      return `${prefix} ${trimmed}`.trim()
    }
  }

  return trimmed
}

function normalizeWrappedParagraph(
  paragraph: string,
  rule: MessageRenderRule | undefined,
): string | null {
  if (!rule || rule.patternMode !== 'wrapped' || !isWrappedPattern(rule.pattern)) {
    return null
  }

  const body = unwrapAliasWrappedText(paragraph, resolveWrappedAliases(rule))
  if (body == null) {
    return null
  }

  return `${rule.pattern.open}${body}${rule.pattern.close}`
}

function unwrapAliasWrappedText(
  value: string,
  aliases: Array<{ close: string; open: string }>,
): string | null {
  const trimmed = value.trim()
  const openingAlias = aliases.find((alias) =>
    trimmed.startsWith(alias.open) && trimmed.length > alias.open.length,
  )
  const closingAlias = aliases.find((alias) =>
    trimmed.endsWith(alias.close) && trimmed.length > alias.close.length,
  )

  if (openingAlias && closingAlias) {
    return trimmed
      .slice(openingAlias.open.length, trimmed.length - closingAlias.close.length)
      .trim()
  }

  for (const alias of aliases) {
    if (
      trimmed.startsWith(alias.open) &&
      trimmed.endsWith(alias.close) &&
      trimmed.length >= alias.open.length + alias.close.length
    ) {
      return trimmed.slice(alias.open.length, trimmed.length - alias.close.length).trim()
    }
  }

  for (const alias of aliases) {
    if (trimmed.startsWith(alias.open) && trimmed.length > alias.open.length) {
      return trimmed.slice(alias.open.length).trim()
    }
    if (trimmed.endsWith(alias.close) && trimmed.length > alias.close.length) {
      return trimmed.slice(0, trimmed.length - alias.close.length).trim()
    }
  }

  return null
}

function aliasesForKind(kind: MessageRenderKind): Array<{ close: string; open: string }> {
  switch (kind) {
    case 'dialogue':
      return [
        { open: '“', close: '”' },
        { open: '"', close: '"' },
        { open: '「', close: '」' },
        { open: '『', close: '』' },
      ]
    case 'action':
      return [
        { open: '*', close: '*' },
        { open: '_', close: '_' },
      ]
    case 'thought':
      return [
        { open: '（', close: '）' },
        { open: '(', close: ')' },
        { open: '【', close: '】' },
      ]
    default:
      return []
  }
}

function resolveKindLabel(kind: MessageRenderKind): string {
  switch (kind) {
    case 'dialogue':
      return 'Spoken dialogue'
    case 'action':
      return 'Action and physical beats'
    case 'thought':
      return 'Inner thought'
    case 'narration':
      return 'Narration'
    case 'plain':
    default:
      return 'Plain text'
  }
}

export function upsertRuleOverride(
  config: MessageRenderingConfig,
  templateId: string,
  ruleId: string,
  override: MessageRenderRuleOverride,
): MessageRenderingConfig {
  return {
    ...config,
    overrides: {
      ...config.overrides,
      [templateId]: {
        ...(config.overrides[templateId] ?? {}),
        [ruleId]: override,
      },
    },
  }
}
