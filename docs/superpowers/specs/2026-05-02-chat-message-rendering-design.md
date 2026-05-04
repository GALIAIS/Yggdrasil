# Chat Message Rendering Design

## Goal

Provide a richer, configurable chat message rendering system for the Tauri renderer so dialogue, action, thought, narration, and system text can be visually distinguished without mutating stored message content.

## Scope

- Render-time only. SQLite message payloads remain unchanged.
- Built-in rendering templates with user overrides.
- Basic visual editor plus advanced per-rule JSON editing.
- Applies to chat transcript display only in phase one.

## Current Context

The current chat renderer outputs each message body as a single paragraph in [apps/renderer/src/features/chat/ChatMessageCard.tsx](E:/WorkSpace/STavern/apps/renderer/src/features/chat/ChatMessageCard.tsx). The renderer already carries the full settings payload through [apps/renderer/src/features/workspace/WorkbenchShell.tsx](E:/WorkSpace/STavern/apps/renderer/src/features/workspace/WorkbenchShell.tsx), but the transcript card does not yet consume any display-specific message rendering configuration. Settings persistence is already backed by Tauri-side SQLite through `saveSettings` / `saveSettingsWithSecret` in [packages/api-client/src/workspace.ts](E:/WorkSpace/STavern/packages/api-client/src/workspace.ts), and arbitrary renderer-owned keys can live inside `AppSettings`.

## User Experience

Phase one adds:

- Built-in templates:
  - `classic-novel`
  - `roleplay-bracket`
  - `tavern-cinematic`
- Semantic segment rendering for:
  - dialogue
  - action
  - thought
  - narration
  - plain text fallback
  - system text passthrough
- A settings surface where the user can:
  - switch the active template
  - enable or disable rules
  - edit priority
  - edit wrapped delimiters or line prefixes
  - adjust text color, weight, italic, background tint, and left accent line
  - edit a rule as JSON in advanced mode
  - preview the current template against sample text

## Data Model

The renderer stores one structured object in `settings.message_rendering`:

- `activeTemplateId`
- `sampleText`
- `overrides`

`overrides` is keyed by template id, then by rule id, so built-in templates remain immutable defaults while user changes persist cleanly.

Rule model:

- `id`
- `label`
- `kind`: `dialogue | action | thought | narration | plain`
- `patternMode`: `wrapped | linePrefix | regex`
- `priority`
- `enabled`
- `multiline`
- `pattern`
- `style`

`style` contains visual knobs:

- `textColor`
- `fontWeight`
- `fontStyle`
- `backgroundTint`
- `accentColor`

## Parsing Strategy

The parser works in four steps:

1. Normalize the active template by merging defaults with user overrides.
2. Produce candidate matches for each enabled rule.
3. Sort matches by `start`, then higher `priority`, then longer range.
4. Greedily consume non-overlapping matches and fill gaps with `plain` segments.

Phase one supports:

- wrapped delimiters such as `“...”`, `「...」`, `"..."`, `*...*`, `_..._`, `（...）`, `(…)`
- line prefix rules such as `>` or `【旁白】`
- optional advanced regex rules

Nested parsing is intentionally out of scope for phase one. The parser remains flat and deterministic.

## UI Placement

The settings editor lives in [apps/renderer/src/features/settings/SettingsPanel.tsx](E:/WorkSpace/STavern/apps/renderer/src/features/settings/SettingsPanel.tsx) as a dedicated section inside the existing settings workspace. That keeps the feature globally discoverable and matches how other persistent behavior is already configured.

The section includes:

- template selector
- reset to defaults action
- sample preview textarea
- rendered preview surface
- rule list
- selected rule editor
- advanced JSON editor toggle

## Rendering Surface

[apps/renderer/src/features/chat/ChatMessageCard.tsx](E:/WorkSpace/STavern/apps/renderer/src/features/chat/ChatMessageCard.tsx) will switch from a single `<p>` to a segment renderer that outputs inline blocks with semantic classes:

- `ref-message-segment`
- `ref-message-segment-dialogue`
- `ref-message-segment-action`
- `ref-message-segment-thought`
- `ref-message-segment-narration`
- `ref-message-segment-plain`

System messages keep their existing compact mono treatment, but still flow through the same segment pipeline so future expansion stays cheap.

## Testing

Add unit tests for:

- wrapped delimiter parsing
- line prefix parsing
- conflict resolution by priority
- fallback plain segments
- override merging

Build validation:

- `pnpm --filter @yggdrasil/renderer test`
- `pnpm --filter @yggdrasil/renderer build`

## Phase One Boundaries

Included:

- transcript-only rendering
- built-in templates
- persistent overrides
- visual rule editor
- advanced per-rule JSON editing

Excluded:

- editing composer live preview
- export-time transformation
- nested grammar
- provider- or character-specific rendering presets
