# Yggdrasil Sandboxed Extension Runtime Design

Date: 2026-05-04
Status: Draft
Scope: Extension runtime, sandboxed script hooks, host capability boundary, session time plugin example

## 1. Background

Yggdrasil already has partial extension-related surfaces, but not a true runtime:

- `apps/renderer/src/features/extensions/ExtensionsPanel.tsx`
  - imports, enables, disables, exports, and deletes extension manifests stored in the library domain
- `apps/renderer/src/lib/extension-import.ts`
  - normalizes imported extension JSON into a stored library document
- `apps/tauri/src-tauri/src/project_store.rs`
  - supports project-level plugin bindings via `project_plugin_bindings`
- `apps/renderer/src/lib/context-assembly.ts`
  - assembles the generation context before model invocation
- `apps/tauri/src-tauri/src/world_state.rs`
  - stores and mutates world-state snapshots per session

Current limitation:

- imported extensions are data artifacts, not executable runtime participants
- there is no plugin lifecycle, no hook dispatcher, no capability model, no script isolation, and no host validation pipeline
- users cannot safely extend session logic such as dynamic time, contextual prompt injection, or derived world-state updates

The user requirement is to add an extension system that:

- allows users to implement most custom logic themselves
- can affect session behavior in useful ways
- does not allow modifications that can break application stability

The chosen direction is:

- first implementation uses a sandboxed script plugin model aligned with option `1`
- interfaces are designed so the execution backend can later migrate toward option `3`
- plugins are not allowed direct access to filesystem, network, SQLite, Tauri commands, DOM, or React state

## 2. Goals

### 2.1 Functional goals

1. Allow user-authored extensions to participate in chat/session workflows through fixed hooks.
2. Allow extensions to:
   - inject prompt context
   - propose session time changes
   - propose world-state patches
   - emit structured notes and UI hints
3. Support project-level and global extension enablement.
4. Provide a first-party example extension for session date/time progression.

### 2.2 Non-functional goals

1. A plugin must never directly crash the app or corrupt persistent data.
2. Plugin execution must be bounded by timeout, result size limits, and schema validation.
3. A failed plugin must degrade to a logged warning and skipped result.
4. Host-owned transactions must remain the only path to persistent mutation.

## 3. Non-goals

This phase does not support:

1. arbitrary local code execution
2. arbitrary outbound network calls
3. plugin-defined custom SQL
4. direct mutation of renderer component state
5. replacement of the main generation pipeline
6. native binary plugins
7. unrestricted third-party package imports

## 4. Current state assessment

### 4.1 What already exists

#### Extension inventory

Extensions are already represented as library documents in the `extensions` domain. This provides:

- storage
- import/export
- enable/disable state
- metadata display

This is a solid base for a runtime registry because the storage model already exists.

#### Project-level binding

`project_store.rs` already persists `plugin_bindings`, which is enough to model:

- globally installed extensions
- per-project enabled extensions
- project-specific extension sets

#### Context injection chokepoint

`context-assembly.ts` is already the right high-leverage place for extension prompt additions because it builds:

- system blocks
- summary blocks
- narrative memory blocks
- lore/world-state/retrieval blocks
- recent chat blocks

This means extension-provided prompt fragments can be added in a controlled and explainable way.

#### Persistent world-state mutation path

`world_state.rs` already provides host-owned update application through `apply_world_state_updates`. That is exactly the correct shape for plugin participation: plugins should propose patches, while the host decides whether and how they persist.

### 4.2 What is missing

1. runtime extension manifest contract
2. executable script entrypoint format
3. hook lifecycle and dispatcher
4. sandbox executor
5. capability boundary
6. result schema validation
7. extension execution logs
8. per-session extension state storage
9. session clock storage and APIs

## 5. Architecture decision

## 5.1 Chosen approach

The first implementation will use:

- a host-managed sandboxed script runtime
- fixed lifecycle hooks
- a narrow host capability API
- schema-validated result contracts

This is intentionally closer to option `1` than full process-isolated option `3`, because:

1. it fits the current repository state
2. it can be integrated into existing context assembly and world-state paths without large architectural churn
3. it can later migrate to a stricter sandbox backend if the interface contract stays stable

## 5.2 Why not start directly with option 3

Option `3` remains the long-term direction for stronger isolation, but it imposes immediate complexity in:

- worker or QuickJS runtime orchestration
- serialization-only host/plugin communication
- plugin debugging and stack trace mapping
- lifecycle state hydration
- extra platform-specific runtime packaging

That cost is not justified before:

- hook contracts are stable
- plugin data model is validated in production
- capability boundaries are proven sufficient

## 6. Design principles

1. Host owns persistence.
2. Plugins propose; host validates and commits.
3. Hooks are explicit and finite.
4. Capabilities are allowlisted, not denylisted.
5. Every plugin result must be deterministic, serializable, and bounded.
6. Failure must be isolated by plugin and by hook invocation.

## 7. Extension package model

Each extension remains stored as a library document, but its JSON shape becomes formalized.

### 7.1 Manifest shape

```json
{
  "id": "session-chrono",
  "name": "Session Chrono",
  "version": "1.0.0",
  "description": "Adds in-session time progression and time-aware prompt context.",
  "author": "Yggdrasil",
  "entry": "plugin.js",
  "permissions": [
    "session.read",
    "session.time.read",
    "session.time.propose",
    "prompt.inject",
    "worldState.read"
  ],
  "hooks": [
    "beforePrompt",
    "afterAssistant",
    "onUserMessageSaved"
  ],
  "configSchema": {
    "type": "object",
    "properties": {
      "autoAdvanceEnabled": { "type": "boolean", "default": true },
      "maxAdvanceMinutesPerTurn": { "type": "integer", "minimum": 1, "maximum": 720, "default": 180 },
      "nightStartHour": { "type": "integer", "minimum": 0, "maximum": 23, "default": 20 },
      "morningStartHour": { "type": "integer", "minimum": 0, "maximum": 23, "default": 6 },
      "nestedRenderEnabled": { "type": "boolean", "default": false }
    },
    "additionalProperties": false
  },
  "limits": {
    "timeoutMs": 120,
    "maxResultBytes": 32768,
    "maxPromptInjections": 4,
    "maxStatePatches": 8
  },
  "script": "export function beforePrompt(ctx, api) { /* ... */ }"
}
```

### 7.2 Storage representation

The imported extension record still lives in the `extensions` library domain, but runtime-specific fields are parsed and validated at load time.

The host should treat each stored extension document as:

- source artifact
- display metadata
- executable contract candidate

The host should not assume the artifact is executable until validation succeeds.

## 8. Runtime architecture

## 8.1 Core runtime components

### ExtensionRegistry

Responsibility:

- load extension documents from library storage
- parse manifests
- reject invalid entries
- expose enabled extension definitions by global/project/session scope

### ExtensionConfigStore

Responsibility:

- persist per-extension user config
- persist per-project overrides
- return merged effective config

### ExtensionSandbox

Responsibility:

- execute user script in a restricted environment
- provide only allowlisted globals
- enforce timeout and output size limits

### ExtensionHookDispatcher

Responsibility:

- resolve active extensions for a given invocation
- order hook execution deterministically
- isolate failures
- aggregate proposed outputs

### ExtensionResultValidator

Responsibility:

- validate plugin results against per-hook schemas
- reject malformed or oversized outputs
- normalize valid outputs into host-owned mutation requests

### ExtensionAuditLog

Responsibility:

- record execution start/end
- record errors, timeouts, rejected outputs
- store enough context for diagnosis

## 8.2 Execution backend

Phase 1 implementation should use a host-controlled JavaScript execution backend with:

- no ambient access to `window`
- no ambient access to `document`
- no `fetch`
- no dynamic import
- no eval chaining beyond the loaded script unit
- no access to filesystem or Tauri command bridge

The exact backend can be implemented in renderer or Tauri, but the interface contract must look like this:

```ts
type ExtensionExecutor = {
  runHook(args: {
    extensionId: string
    scriptSource: string
    hook: ExtensionHookName
    context: SerializableHookContext
    config: Record<string, unknown>
    limits: EffectiveExtensionLimits
  }): Promise<HookExecutionResult>
}
```

This keeps the higher-level dispatcher independent from the underlying runtime so it can later be swapped to a stricter engine.

## 8.3 Hook order

Hooks run in deterministic order:

1. global enabled extensions ordered by `id`
2. project-bound enabled extensions ordered by `id`

Within the same hook invocation:

- each extension runs independently
- no extension can observe another extension's pending outputs directly
- host merges results after validation

This prevents extension-to-extension hidden coupling in phase 1.

## 9. Hook lifecycle

## 9.1 beforePrompt

Purpose:

- derive additional prompt context before assembling final model messages

Allowed output:

- prompt injections
- soft UI notices
- optional time hints

Forbidden:

- direct persistence
- direct chat mutation

Example uses:

- time-of-day context
- scene-mode tags
- style nudges based on recent session events

## 9.2 onUserMessageSaved

Purpose:

- react to a newly saved user message

Allowed output:

- time advancement proposals
- pending world-state patch proposals
- short session notes

Example uses:

- parse "we wait until dusk"
- parse "we camp for the night"

## 9.3 afterAssistant

Purpose:

- react to a completed assistant reply

Allowed output:

- time advancement proposals
- state patch proposals
- trace annotations

Example uses:

- infer that travel consumed two hours
- infer that a quest status became active

## 9.4 Future hooks

Reserved for later:

- `beforeWorldStateApply`
- `beforeMemoryExtract`
- `beforeSessionSummary`
- `decorateInspector`

These should not be included in phase 1 unless needed by a concrete feature.

## 10. Hook context contract

Each hook receives only a serializable readonly context.

### 10.1 Shared context shape

```ts
type SerializableHookContext = {
  app: {
    version: string
    locale: string
  }
  project?: {
    name: string
    enabledExtensionIds: string[]
  }
  character?: {
    avatarUrl?: string
    fileName?: string
    name: string
  }
  session: {
    id: string
    avatarUrl?: string
    fileName?: string
    clock?: SessionClockSnapshot
    worldStateSummary?: SessionWorldStateSummary
    recentMessages: SerializableChatMessage[]
    lastUserMessage?: SerializableChatMessage
    lastAssistantMessage?: SerializableChatMessage
  }
  settings: {
    username?: string
    mainApi?: string
  }
}
```

### 10.2 Message shape

```ts
type SerializableChatMessage = {
  role: "user" | "assistant" | "system"
  name?: string
  text: string
  createdAt?: number
}
```

### 10.3 Session clock shape

```ts
type SessionClockSnapshot = {
  currentTimeIso: string
  timezone: string
  mode: "manual" | "plugin-driven"
  turnIndex: number
  lastAdvancedAt?: number
  recentAdvances: Array<{
    minutes: number
    reason: string
    source: string
    createdAt: number
  }>
}
```

## 11. Host capability API

Plugins do not mutate state directly. They receive a minimal `api` object that can only build host requests.

### 11.1 API shape

```ts
type ExtensionHostApi = {
  addPromptInjection(input: PromptInjectionDraft): void
  proposeTimeAdvance(input: TimeAdvanceDraft): void
  proposeWorldStatePatch(input: WorldStatePatchDraft): void
  addSessionNote(input: SessionNoteDraft): void
  log(input: ExtensionLogDraft): void
}
```

This API is intentionally command-buffer based. Calls only append proposals into an in-memory result buffer. The host validates them after execution.

### 11.2 Prompt injection draft

```ts
type PromptInjectionDraft = {
  label: string
  content: string
  priority?: number
  scope?: "system" | "lore"
}
```

### 11.3 Time advance draft

```ts
type TimeAdvanceDraft = {
  minutes: number
  reason: string
  confidence?: number
}
```

### 11.4 World-state patch draft

```ts
type WorldStatePatchDraft = {
  entity: string
  field: string
  nextValue: string | number | boolean | null | object | unknown[]
  reason: string
}
```

### 11.5 Deliberate exclusions

The API does not expose:

- arbitrary storage reads
- arbitrary storage writes
- command execution
- network
- direct model invocation
- other extension outputs

## 12. Validation and safety model

## 12.1 Script-level limits

Per invocation:

- timeout, default `120ms`
- max result size, default `32KB`
- max prompt injection count
- max state patch count
- max time advance count, default `1`

## 12.2 Host-level validations

### Prompt injections

Reject if:

- empty
- too long
- invalid scope
- too many

### Time advances

Reject if:

- minutes <= 0
- minutes exceeds configured cap
- reason empty
- confidence outside `[0, 1]`

Clamp if:

- plugin proposes a value above effective session maximum

### World-state patches

Reject if:

- entity empty
- field empty
- reason empty
- value exceeds serialization limits

## 12.3 Failure isolation

For each extension hook run:

- timeout -> plugin result discarded, execution logged
- thrown error -> plugin result discarded, execution logged
- invalid output -> plugin result discarded, validation error logged

The host continues processing remaining extensions.

## 12.4 Persistence boundary

Only the host can:

- commit session clock changes
- commit world-state changes
- commit logs
- commit extension config changes

Plugins cannot directly persist anything.

## 13. Data model additions

## 13.1 New storage: extension runtime database

Add `extension_runtime.sqlite` for runtime-owned plugin state.

Tables:

### extension_configs

- `extension_id`
- `scope_type` (`global` / `project`)
- `scope_key`
- `config_json`
- `updated_at`

### extension_execution_logs

- `id`
- `extension_id`
- `hook`
- `session_id`
- `project_name`
- `status` (`ok` / `timeout` / `error` / `invalid_output`)
- `duration_ms`
- `summary`
- `detail_json`
- `created_at`

### session_clocks

- `session_id`
- `avatar`
- `file_name`
- `current_time_iso`
- `timezone`
- `mode`
- `turn_index`
- `updated_at`

### session_clock_advances

- `id`
- `session_id`
- `extension_id`
- `minutes`
- `reason`
- `confidence`
- `created_at`

### extension_session_state

Optional future table for small plugin-owned session-scoped state:

- `extension_id`
- `session_id`
- `state_json`
- `updated_at`

Phase 1 can omit this unless the example plugin truly needs persistence beyond session clock.

## 14. Integration points in the current codebase

## 14.1 Renderer integration

### Extensions panel

`ExtensionsPanel.tsx` remains the inventory UI and should be extended to support:

- validation status
- runtime permissions display
- config editor button
- test run button for installed extensions

### Context assembly

`context-assembly.ts` should gain an extension-provided block phase:

- host resolves `beforePrompt` outputs
- validated prompt injections become additional `ContextBlock`s
- these blocks are labeled for traceability

Recommended source labels:

- `extension.<id>.system`
- `extension.<id>.lore`

### Chat workflow

`features/chat/hooks.ts` and the message save/generate flow should call runtime hooks at safe checkpoints:

1. after user message save -> `onUserMessageSaved`
2. before generation context finalized -> `beforePrompt`
3. after assistant reply save -> `afterAssistant`

## 14.2 Tauri integration

Add host commands for:

- loading validated extension definitions
- saving/fetching extension config
- fetching/applying session clocks
- running extension hooks
- reading extension execution logs

World-state persistence should continue using host-owned functions in `world_state.rs`.

## 15. Example plugin: Session Chrono

## 15.1 Purpose

`session-chrono` adds a persistent in-session clock and lets the AI respond with time-appropriate context while allowing story events to advance time.

## 15.2 Desired behavior

1. The session always has a current in-world datetime.
2. Prompt context includes:
   - current datetime
   - day period
   - last notable time advances
3. User or assistant messages that imply elapsed time can advance the session clock.
4. The assistant naturally reacts differently depending on time of day.

## 15.3 Example plugin manifest

```json
{
  "id": "session-chrono",
  "name": "Session Chrono",
  "version": "1.0.0",
  "description": "Tracks in-session time and injects time-aware prompt context.",
  "permissions": [
    "session.read",
    "session.time.read",
    "session.time.propose",
    "prompt.inject",
    "worldState.read"
  ],
  "hooks": ["beforePrompt", "onUserMessageSaved", "afterAssistant"],
  "limits": {
    "timeoutMs": 120,
    "maxResultBytes": 24576,
    "maxPromptInjections": 2,
    "maxStatePatches": 0
  }
}
```

## 15.4 Example script

```js
function classifyDayPeriod(hour, config) {
  const morningStart = config.morningStartHour ?? 6
  const nightStart = config.nightStartHour ?? 20
  if (hour >= nightStart || hour < morningStart) return "night"
  if (hour < 12) return "morning"
  if (hour < 18) return "afternoon"
  return "evening"
}

function estimateAdvanceFromText(text, config) {
  const raw = String(text || "").toLowerCase()
  if (!raw.trim()) return null
  if (raw.includes("sleep") || raw.includes("rest until morning")) return 480
  if (raw.includes("wait until dusk")) return 240
  if (raw.includes("travel for hours")) return 180
  if (raw.includes("set camp")) return 120
  return null
}

export function beforePrompt(ctx, api, config) {
  const clock = ctx.session.clock
  if (!clock) return
  const current = new Date(clock.currentTimeIso)
  const hour = current.getHours()
  const period = classifyDayPeriod(hour, config)
  api.addPromptInjection({
    label: "Session time",
    scope: "system",
    priority: 860,
    content: [
      `Current in-world time: ${clock.currentTimeIso}`,
      `Day period: ${period}`,
      `Recent advances: ${clock.recentAdvances.map((item) => `${item.minutes}m (${item.reason})`).join(", ") || "none"}`
    ].join("\n")
  })
}

export function onUserMessageSaved(ctx, api, config) {
  if (!config.autoAdvanceEnabled) return
  const text = ctx.session.lastUserMessage?.text ?? ""
  const minutes = estimateAdvanceFromText(text, config)
  if (!minutes) return
  api.proposeTimeAdvance({
    minutes: Math.min(minutes, config.maxAdvanceMinutesPerTurn ?? 180),
    reason: "Derived from user action",
    confidence: 0.8
  })
}

export function afterAssistant(ctx, api, config) {
  if (!config.autoAdvanceEnabled) return
  const text = ctx.session.lastAssistantMessage?.text ?? ""
  const minutes = estimateAdvanceFromText(text, config)
  if (!minutes) return
  api.proposeTimeAdvance({
    minutes: Math.min(minutes, config.maxAdvanceMinutesPerTurn ?? 180),
    reason: "Derived from assistant narrative progression",
    confidence: 0.55
  })
}
```

## 15.5 Host behavior for Session Chrono

The host should:

1. initialize a session clock when a chat is first created
2. load the current session clock before hook execution
3. merge multiple time proposals, but in phase 1 prefer:
   - highest confidence proposal
   - at most one committed time advance per hook
4. persist advances after validation
5. expose the final clock in generation traces

## 16. Prompt interaction model

The extension system must not bypass existing prompt governance.

The final message assembly order should remain:

1. character core system blocks
2. rendering lock block
3. validated extension system injections
4. summaries / memories / lore / directives / world-state
5. recent transcript blocks

Extension content should be inserted as normal `ContextBlock`s so:

- token budgeting remains visible
- trace output remains explainable
- prompt cache boundaries remain analyzable

## 17. Logging and diagnostics

Each extension invocation should emit a structured log record containing:

- extension id
- hook
- session id
- project name
- duration
- status
- validation decisions
- compact result summary

This should integrate with the existing logs infrastructure and be exportable from the logs UI.

Recommended severities:

- `info`: successful run
- `warn`: timeout, skipped invalid output
- `error`: runtime exception, host integration failure

## 18. UI changes

## 18.1 Extensions panel

Add:

- runtime validity badge
- permissions badge list
- configured hooks
- config dialog
- test-run action
- recent execution status

## 18.2 Session UI

For plugins like Session Chrono, add a compact session clock display in chat-side workspace surfaces:

- current in-world time
- last advancement summary
- optional manual correction action

## 18.3 Project UI

Project manifests already support plugin bindings. Add:

- extension picker for project bindings
- effective extension preview
- per-project config override editor

## 19. Security and stability constraints

1. Plugins must not receive raw `invoke` access.
2. Plugins must not receive a database handle.
3. Plugins must not mutate host objects in-place.
4. Plugins must operate on copies of host context.
5. Plugin results must be schema-validated before use.
6. Plugin execution must be time-boxed.
7. Plugin state writes must be host-owned and transactional.

## 20. Testing strategy

## 20.1 Unit tests

Cover:

- manifest parsing
- permission validation
- hook output validation
- time advance clamping
- invalid plugin isolation

## 20.2 Integration tests

Cover:

- extension imported -> validated -> enabled -> executed
- prompt injections show up in context assembly
- Session Chrono advances time on user/assistant events
- plugin failure does not break reply generation

## 20.3 Regression tests

Cover:

- disabled plugin does nothing
- project-unbound plugin does not run in that project
- malformed result is rejected without persistence

## 21. Migration plan

### Phase 1

- formalize extension manifest
- add runtime registry
- add session clock storage
- add `beforePrompt`, `onUserMessageSaved`, `afterAssistant`
- implement Session Chrono example

### Phase 2

- richer config UI
- project-level override UI
- execution logs UI
- optional extension session state store

### Phase 3

- swap executor backend toward stronger isolation
- keep hook contract stable
- support more advanced hooks if required

## 22. Risks

### Risk 1: plugin prompts become prompt spam

Mitigation:

- strict output count limit
- byte limit
- priority-based insertion
- visible trace inspection

### Risk 2: plugins propose incoherent time jumps

Mitigation:

- max minutes cap
- confidence sorting
- one committed advance per hook
- manual correction UI

### Risk 3: runtime leaks hidden host capabilities

Mitigation:

- minimal injected globals
- explicit API object
- serialization boundary
- tests asserting forbidden globals are unavailable

### Risk 4: plugin ecosystem couples to phase-1 executor details

Mitigation:

- document only hook/context/api contracts
- do not expose executor-specific internals

## 23. Recommendation

Implement the first version with the phase-1 sandboxed script model described here.

This gives Yggdrasil:

- practical extensibility now
- a stable capability contract
- a safe path for a time-aware session plugin
- a future migration path to a stronger isolated backend without redoing plugin APIs

## 24. Acceptance criteria

This design is considered implemented when:

1. users can import and enable a validated executable extension
2. the host runs fixed hooks safely without direct plugin persistence rights
3. plugin prompt injections become visible in generation traces
4. plugin time proposals can persist into a session clock
5. the Session Chrono example changes prompt context and advances time in a controlled way
6. a broken extension does not break normal chat generation

