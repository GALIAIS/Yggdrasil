# Chat Message Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable, persistent chat message rendering templates and rule editing to the renderer so transcript text can visually distinguish dialogue, action, thought, and narration.

**Architecture:** Add a renderer-side parsing module that converts raw message text into semantic segments using built-in templates plus persisted user overrides. Thread the resolved rendering profile from settings into the transcript components and expose a settings UI for editing templates, rule styles, and advanced per-rule JSON.

**Tech Stack:** React, TypeScript, existing renderer settings persistence, Vitest, Tauri-backed SQLite via `saveSettings`.

---

### Task 1: Define rendering models and parser

**Files:**
- Create: `apps/renderer/src/lib/chat-rendering.ts`
- Test: `apps/renderer/src/lib/chat-rendering.test.ts`

- [ ] Define template, rule, override, segment, and editor state types.
- [ ] Add built-in templates and default sample text.
- [ ] Implement override merge helpers.
- [ ] Implement wrapped, line-prefix, and regex candidate extraction.
- [ ] Implement deterministic non-overlapping segment assembly.
- [ ] Add parser unit tests covering priority, fallback, and override behavior.

### Task 2: Thread rendering config through transcript rendering

**Files:**
- Modify: `apps/renderer/src/features/chat/ChatMessageCard.tsx`
- Modify: `apps/renderer/src/features/chat/ChatTranscriptCard.tsx`
- Modify: `apps/renderer/src/features/workspace/AppSectionLayout.tsx`
- Modify: `apps/renderer/src/features/workspace/WorkbenchShell.tsx`
- Modify: `apps/renderer/src/index.css`

- [ ] Resolve the active rendering config from settings in the workspace shell path.
- [ ] Pass rendering config into transcript and message card components.
- [ ] Replace the single-paragraph renderer with semantic segment rendering.
- [ ] Add transcript segment classes and theme-consistent styles.
- [ ] Preserve existing system and editing behavior.

### Task 3: Add settings persistence helpers

**Files:**
- Modify: `packages/api-client/src/workspace.ts`
- Modify: `apps/renderer/src/lib/workspace-runtime.ts`
- Create: `apps/renderer/src/lib/chat-rendering-settings.ts`
- Test: `apps/renderer/src/lib/chat-rendering-settings.test.ts`

- [ ] Extend `AppSettings` with typed `message_rendering` support.
- [ ] Add helpers to read, normalize, and write rendering config safely.
- [ ] Add tests for malformed payload fallback and merge behavior.

### Task 4: Build settings UI for templates and rules

**Files:**
- Modify: `apps/renderer/src/features/settings/SettingsPanel.tsx`
- Modify: `apps/renderer/src/index.css`

- [ ] Add a “message rendering” section with active template select.
- [ ] Add preview sample textarea and live rendered preview.
- [ ] Add rule list with enable, priority, and summary display.
- [ ] Add basic editor controls for delimiters, colors, weight, italic, background, and accent line.
- [ ] Add advanced JSON editor for the selected rule with parse validation.
- [ ] Wire saves into existing settings mutation flow.

### Task 5: Verify and polish

**Files:**
- Modify: files above as needed

- [ ] Run targeted unit tests for chat rendering modules.
- [ ] Run full renderer build.
- [ ] Fix any typing, runtime, or visual regressions uncovered by tests/build.
- [ ] Update plan checkboxes if execution continues task by task.
