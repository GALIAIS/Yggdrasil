import { describe, expect, it } from 'vitest'

async function loadSubject() {
  return import('./workbench-layout')
}

describe('coerceWorkbenchSection', () => {
  it('returns valid section names as-is', async () => {
    const { coerceWorkbenchSection } = await loadSubject()

    expect(coerceWorkbenchSection('workbench')).toBe('workbench')
    expect(coerceWorkbenchSection('settings')).toBe('settings')
    expect(coerceWorkbenchSection('characters')).toBe('characters')
    expect(coerceWorkbenchSection('story')).toBe('story')
    expect(coerceWorkbenchSection('projects')).toBe('projects')
    expect(coerceWorkbenchSection('lorebooks')).toBe('lorebooks')
    expect(coerceWorkbenchSection('sessions')).toBe('sessions')
    expect(coerceWorkbenchSection('logs')).toBe('logs')
  })

  it('falls back to workbench when the section is unknown', async () => {
    const { coerceWorkbenchSection } = await loadSubject()

    expect(coerceWorkbenchSection('nonexistent')).toBe('workbench')
    expect(coerceWorkbenchSection(null)).toBe('workbench')
    expect(coerceWorkbenchSection(undefined)).toBe('workbench')
    expect(coerceWorkbenchSection(42)).toBe('workbench')
  })
})

describe('pickPersistedSelection', () => {
  it('keeps the persisted avatar and chat when they still exist', async () => {
    const { pickPersistedSelection } = await loadSubject()

    expect(
      pickPersistedSelection({
        section: 'system',
        avatar: 'hero.png',
        chatId: 'chat-2',
        characters: [{ avatar: 'hero.png' }, { avatar: 'mage.png' }],
        chats: [{ file_id: 'chat-1' }, { file_id: 'chat-2' }],
      }),
    ).toEqual({
      section: 'system',
      avatar: 'hero.png',
      chatId: 'chat-2',
    })
  })

  it('drops persisted avatar and chat when they no longer exist', async () => {
    const { pickPersistedSelection } = await loadSubject()

    expect(
      pickPersistedSelection({
        section: 'unknown',
        avatar: 'missing.png',
        chatId: 'chat-z',
        characters: [{ avatar: 'mage.png' }, { avatar: 'hero.png' }],
        chats: [{ file_id: 'chat-a' }, { file_id: 'chat-b' }],
      }),
    ).toEqual({
      section: 'workbench',
      avatar: 'mage.png',
      chatId: 'chat-a',
    })
  })
})

describe('deriveStatusItems', () => {
  it('returns semantic status tokens without coupling to renderer visual semantics', async () => {
    const { deriveStatusItems } = await loadSubject()

    expect(
      deriveStatusItems({
        backendState: 'connected',
        characterName: 'Alice',
        chatId: 'chat-42',
        saveState: 'saving',
      }),
    ).toEqual([
      { slot: 'backend', state: 'connected' },
      { slot: 'character', value: 'Alice' },
      { slot: 'chat', value: 'chat-42' },
      { slot: 'save', state: 'saving' },
    ])
  })

  it('surfaces backend loading and saved states as stable codes', async () => {
    const { deriveStatusItems } = await loadSubject()

    expect(
      deriveStatusItems({
        backendState: 'loading',
        saveState: 'saved',
      }),
    ).toEqual([
      { slot: 'backend', state: 'loading' },
      { slot: 'save', state: 'saved' },
    ])
  })

  it('surfaces backend offline and explicit errors', async () => {
    const { deriveStatusItems } = await loadSubject()

    expect(
      deriveStatusItems({
        backendState: 'offline',
        error: 'integrity conflict',
      }),
    ).toEqual([
      { slot: 'backend', state: 'offline' },
      { slot: 'error', value: 'integrity conflict' },
    ])
  })
})

describe('deriveWorkbenchPanelLayout', () => {
  it('keeps the desktop split layout draggable while enforcing a resource floor', async () => {
    const { deriveWorkbenchPanelLayout } = await loadSubject()

    expect(
      deriveWorkbenchPanelLayout({
        viewportWidth: 1360,
      }),
    ).toEqual({
      isCompact: false,
      resourceDefaultSize: 32.94,
      resourceMinSize: 28.24,
      mainMinSize: 41.18,
    })
  })

  it('falls back to the compact layout when the viewport is too narrow for a stable split view', async () => {
    const { deriveWorkbenchPanelLayout } = await loadSubject()

    expect(
      deriveWorkbenchPanelLayout({
        viewportWidth: 1040,
      }),
    ).toEqual({
      isCompact: true,
      resourceDefaultSize: 43.08,
      resourceMinSize: 36.92,
      mainMinSize: 53.85,
    })
  })
})
