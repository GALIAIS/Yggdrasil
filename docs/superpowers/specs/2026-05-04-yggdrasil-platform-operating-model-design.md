# Yggdrasil Platform Operating Model Design

Date: 2026-05-04
Status: Draft
Scope: Product operating model, page migration, object model, narrative starboard MVP

## 1. Problem statement

The current product still inherits too much of the SillyTavern mental model:

- character is the primary asset
- chat is the primary entry
- world book is a supporting attachment
- most non-chat pages feel like side management surfaces

That model is useful for single-character roleplay, but it is too narrow for the target direction.

Yggdrasil should become a world-driven narrative platform where users can:

1. build or import a setting
2. create or bind multiple actors
3. run different play modes inside the same world
4. observe and steer world evolution over time
5. extend runtime behavior through safe plugins

The key shift is:

- chat becomes one runtime view
- not the definition of the whole product

## 2. Product thesis

Yggdrasil should be organized around four layers.

### 2.1 Creation layer

This layer owns authoring and curation:

- worlds
- characters
- presets
- scenarios
- resources
- plugins
- model providers

### 2.2 Orchestration layer

This layer defines how authored assets combine into runnable experiences:

- projects
- campaigns
- scenes
- role bindings
- world-state policies
- model routing
- extension bindings

### 2.3 Play layer

This layer is the user-facing runtime:

- single-character chat
- multi-actor scene play
- script-driven chapter mode
- world simulation mode

### 2.4 Runtime rules layer

This layer governs what happens every turn:

- context assembly
- memory selection
- retrieval
- world-state mutation
- summarization
- plugin hooks
- narrative director actions

This fourth layer is not optional infrastructure. It is the stable engine boundary that both built-in systems and user-authored extensions must use.

## 3. Experience modes

The user idea of "mode switching" is correct, but the modes need strict definitions so the product stays coherent.

### 3.1 Character-centric mode

Primary asset:

- character

Primary action:

- open a session with one lead actor

Use case:

- classic tavern roleplay
- companion interaction
- focused first-person narrative play

### 3.2 Script-centric mode

Primary asset:

- scenario or chapter

Primary action:

- progress through scenes, beats, objectives, and branching events

Use case:

- visual-novel-like flow
- authored campaigns
- quest chains

### 3.3 World-centric mode

Primary asset:

- world

Primary action:

- inspect locations, factions, timelines, global rules, and evolving world state

Use case:

- setting exploration
- simulation-heavy roleplay
- persistent campaign sandbox

### 3.4 Runtime-centric mode

Primary asset:

- current playable affordances

Primary action:

- choose what to do now: speak, travel, inspect, rest, trigger event, ask director, advance time

Use case:

- game-like interaction loop
- mobile or controller-first use later
- non-chat-first UX

## 4. Primary entry: Narrative Starboard

The main entry should not be "open last chat and stare at messages."

The main entry should be a visual operating surface: `叙事星盘 / Narrative Starboard`.

It is not a static dashboard. It is a live state board that answers:

1. where am I
2. who is active
3. what is changing
4. what can I do next
5. what part of the world needs attention

### 4.1 Starboard responsibilities

The starboard should unify:

- recent sessions
- active projects
- current world clock
- unresolved events
- active character groupings
- scene recommendations
- world-state alerts
- resource health
- model and plugin runtime status

### 4.2 Starboard visual grammar

The first version should avoid fake cinematic complexity.

It should use:

- a central world/project focus card
- orbiting or radial linked panels for sessions, actors, events, and locations
- lightweight motion for freshness, not decoration
- explicit status chips for time, tension, progress, and outstanding actions

### 4.3 Starboard interaction goals

From the starboard, a user should be able to:

1. resume the last active session exactly where they left it
2. open the current project scene
3. switch play mode without losing state
4. inspect world-state changes from the latest turn
5. trigger director tools
6. create a new scene, branch, or side session

## 5. Current page to new platform mapping

The existing page set should be preserved where possible, but reinterpreted around the platform model.

### 5.1 Tavern

Current meaning:

- single chat surface

New meaning:

- `Play` workspace

Sub-views:

- Session
- Scene
- Party
- Director

This remains the primary runtime surface, but it should be entered from the starboard or a project, not treated as the whole app.

### 5.2 Content

Current meaning:

- mixed storage for characters, world books, presets

New meaning:

- `Assets`

Sub-views:

- Characters
- Worlds
- Presets
- Scenarios
- Extensions

This is the authoring and library surface.

### 5.3 Resources

Current meaning:

- detached knowledge and support material

New meaning:

- `Knowledge`

Sub-views:

- Resource library
- Embedding jobs
- Retrieval groups
- Snapshots and imports

This becomes the knowledge substrate for retrieval, not a miscellaneous page.

### 5.4 Project / Story

Current meaning:

- partial workspace shell

New meaning:

- `Projects`

Sub-views:

- Campaigns
- Scenes
- Role bindings
- Runtime bindings
- Event queue

This is the orchestration center where assets become playable worlds.

### 5.5 Settings

Current meaning:

- app config

New meaning:

- `System`

Sub-views:

- Providers
- Models
- Rendering
- Logs
- Updates
- About

### 5.6 Maintenance / provider management

Current meaning:

- mixed operational surfaces

New meaning:

- folded under `System`, except provider-aware runtime actions that belong in Projects or Knowledge

## 6. Information architecture

The top-level product navigation should become:

1. Starboard
2. Play
3. Projects
4. Assets
5. Knowledge
6. System

This is a better fit than exposing chat, content, settings, and utility pages as flat siblings with equal weight.

## 7. Core object model

The data model must represent authored canon, runtime instances, and derived state as separate concerns.

### 7.1 Canon entities

These are reusable authored assets:

- `World`
- `Character`
- `Preset`
- `Scenario`
- `LoreEntry`
- `ResourceDocument`
- `ExtensionPackage`
- `ModelProvider`
- `ModelCapabilityProfile`

These should be editable, exportable, cloneable, and attachable across multiple projects.

### 7.2 Orchestration entities

These assemble canon into a runnable experience:

- `Project`
- `Campaign`
- `SceneTemplate`
- `ProjectCharacterBinding`
- `ProjectWorldBinding`
- `ProjectPresetBinding`
- `ProjectExtensionBinding`
- `ProjectModelRouting`

Important principle:

- a character is not a session
- a world book is not the world
- a project is the composition boundary

### 7.3 Runtime entities

These are play-state objects:

- `Session`
- `SessionThread`
- `Turn`
- `WorldStateSnapshot`
- `SessionClock`
- `EventInstance`
- `ObjectiveState`
- `ActorPresence`
- `RuntimeDirective`
- `SummarySlice`

These are mutable and time-bound.

### 7.4 Derived intelligence entities

These are machine-generated but persistent enough to matter:

- `EmbeddingChunk`
- `RetrievalIndex`
- `RerankTrace`
- `ContextPlan`
- `StateUpdateProposal`
- `NarrativeSuggestion`
- `MemoryDigest`

These should never be confused with authored truth. They are operational derivatives.

## 8. Entity relationships

The most important relationships are:

1. one `World` can back many `Projects`
2. one `Project` can bind many `Characters`
3. one `Project` can expose many `Play modes`
4. one `Project` can produce many `Sessions`
5. one `Session` produces many `Turns`
6. one `Turn` may produce zero or more `StateUpdateProposal`
7. validated proposals mutate `WorldStateSnapshot`
8. one `Project` can enable many `ExtensionPackage`
9. one `ModelProvider` can expose many models of different capabilities

## 9. Storage strategy

The product already moved toward split SQLite storage. That direction should continue and become explicit.

### 9.1 Suggested database boundaries

- `app.sqlite`
  - settings
  - UI preferences
  - navigation persistence
  - recent activity
- `assets.sqlite`
  - characters
  - worlds
  - presets
  - scenarios
  - extensions
- `projects.sqlite`
  - projects
  - campaigns
  - bindings
  - scene graphs
- `sessions.sqlite`
  - chats
  - messages
  - session metadata
  - clocks
  - summaries
- `knowledge.sqlite`
  - resources
  - chunks
  - embedding jobs
  - retrieval groups
- `runtime.sqlite`
  - world-state snapshots
  - state update proposals
  - event queue
  - runtime traces
  - extension execution logs

### 9.2 Why this split matters

It gives:

- lower blast radius on corruption
- easier export and backup by domain
- cleaner migration ownership
- better future multi-workspace support

## 10. Mode switching model

Mode switching must not create fake duplicate state.

The same project should be playable through multiple views over one shared runtime.

Example:

- Character mode opens `Session A`
- World mode inspects the same session's world-state and current time
- Runtime mode exposes available actions for the same underlying session
- Script mode advances the same project scene graph

The switch changes:

- layout
- controls
- emphasis

It does not create a separate save unless the user explicitly forks.

## 11. Narrative Starboard MVP

The first version should stay disciplined. It should not attempt a fully simulated galaxy map.

### 11.1 MVP modules

1. Active project focus
2. Recent session strip
3. World clock and latest state delta
4. Actor presence panel
5. Event queue summary
6. Suggested next actions
7. Provider/runtime health

### 11.2 MVP interactions

1. Resume last session
2. Open session list for current project
3. Open project scene
4. Jump to world-state details
5. Trigger director action
6. Create branch session

### 11.3 What is intentionally excluded from MVP

- freeform node editor
- drag-everything graph canvas
- real-time multiplayer
- autonomous large-scale simulation
- user-authored custom starboard widgets

Those can come later once the runtime contracts stabilize.

## 12. Runtime and extension relationship

The sandboxed extension runtime should be treated as a first-class platform dependency, not a peripheral plugin page.

### 12.1 Built-in systems should also use the runtime contract

Whenever reasonable, built-in logic should flow through the same hook system used by user extensions:

- session time progression
- director suggestions
- state proposal generation
- structured narration helpers

This reduces the split between "official logic" and "plugin logic."

### 12.2 Capability tiers

The extension system should eventually support at least three capability bands:

1. prompt and UI hint
2. runtime proposal and orchestration
3. approved tool adapters such as embedding, rerank, scheduling, import transforms

The host must still own persistence and validation.

## 13. Immediate implementation implications

This operating model implies concrete next steps for the codebase.

### 13.1 Renderer

- add `Starboard` as a top-level section
- remap navigation labels to the new information architecture
- make `Play` a view-switching workspace rather than a single chat identity
- separate authoring surfaces from orchestration surfaces

### 13.2 Tauri

- formalize domain repositories around the split SQLite model
- add project-centric queries that can hydrate the starboard in one round-trip
- expose runtime traces, clock state, event queue, and world-state deltas as first-class commands

### 13.3 Data migrations

- migrate "world book attached to session" semantics toward project/world bindings
- persist last active project, session, and mode
- preserve legacy chat behavior as one play mode, not as the only mode

## 14. Rollout order

Recommended order:

1. finish extension runtime foundation
2. add top-level `Starboard` shell and persistence of last active context
3. refactor navigation into `Play / Projects / Assets / Knowledge / System`
4. formalize project bindings and world ownership
5. build world-centric and runtime-centric views over the same session state
6. expand scenario and campaign orchestration

## 15. Success criteria

This design is successful when:

1. users no longer need to think of the app as "a tavern clone with extra pages"
2. one world can meaningfully host multiple sessions, actors, and play modes
3. users can re-enter exactly the same active runtime context after page switch or restart
4. world, script, character, and runtime views feel like different lenses over one system
5. extension runtime becomes the safe default path for advanced custom behavior

## 16. Recommendation

Do not continue adding isolated chat-first features onto the current mental model.

Instead:

- treat `Narrative Starboard` as the new front door
- treat `Project` as the composition boundary
- treat `Session` as one runtime instance inside that boundary
- treat `World` as a first-class asset, not a sidecar
- treat the sandboxed runtime as core infrastructure

That is the cleanest path from the current codebase toward a broader narrative platform without discarding the existing chat value.
