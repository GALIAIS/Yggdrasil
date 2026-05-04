import type { CharacterSummary, SettingsPayload, WorkspaceCatalogPayload } from '@yggdrasil/api-client'
import { describe, expect, test } from 'vitest'

import enUS from '@/locales/en-US'
import { buildSectionBrowserData } from './section-browser-data'

function t(key: string, params?: Record<string, string | number>) {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, enUS)

  if (typeof value !== 'string') {
    return key
  }

  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''))
}

describe('buildSectionBrowserData', () => {
  test('builds the sessions page from real catalog entries', () => {
    const catalog: WorkspaceCatalogPayload = {
      counts: { chatFiles: 3 },
      disabledExtensions: [],
      entries: {
        sessions: [
          {
            kind: 'chat',
            name: 'Seraphina - 2026-04-25 16-43-19',
            itemCount: 14,
            note: 'Latest real transcript',
            tags: ['Seraphina'],
            updatedAt: Date.UTC(2026, 3, 25, 8, 43, 19),
          },
        ],
      },
      totalChats: 3,
      totalMessages: 42,
      warningLines: 0,
    }

    const result = buildSectionBrowserData({
      catalog,
      section: 'sessions',
      settings: null,
      sortedCharacters: [],
      t,
    })

    expect(result.records[0]?.name).toBe('Seraphina - 2026-04-25 16-43-19')
    expect(result.records[0]?.status).toBe('Latest real transcript')
    expect(result.metrics[0]?.value).toBe('3')
    expect(result.activity[0]?.label).toBe('Seraphina - 2026-04-25 16-43-19')
  })

  test('marks disabled extensions from backend state', () => {
    const catalog: WorkspaceCatalogPayload = {
      counts: { extensions: 2, logs: 1 },
      disabledExtensions: ['scene-macros'],
      entries: {
        extensions: [
          {
            kind: 'extension',
            name: 'scene-macros',
            disabled: true,
            tags: ['extension'],
            updatedAt: Date.UTC(2026, 3, 29, 12, 0, 0),
          },
          {
            kind: 'extension',
            name: 'tts-narrator',
            tags: ['extension'],
            updatedAt: Date.UTC(2026, 3, 30, 12, 0, 0),
          },
        ],
      },
      totalChats: 0,
      totalMessages: 0,
      warningLines: 4,
    }

    const result = buildSectionBrowserData({
      catalog,
      section: 'extensions',
      settings: null,
      sortedCharacters: [],
      t,
    })

    expect(result.metrics[1]?.value).toBe('1')
    expect(result.records.find((item) => item.name === 'scene-macros')?.status).toBe('Disabled')
  })

  test('combines catalog and real characters in the library view', () => {
    const settings: SettingsPayload = {
      rawSettings: '{}',
      settings: {},
      context: [],
      enable_accounts: false,
      enable_extensions: true,
      enable_extensions_auto_update: false,
      instruct: [],
      koboldai_setting_names: [],
      novelai_setting_names: [],
      openai_setting_names: [],
      quickReplyPresets: [],
      reasoning: [],
      sysprompt: [],
      textgenerationwebui_preset_names: [],
      themes: [],
      world_names: [],
    }

    const characters: CharacterSummary[] = [
      {
        avatar: 'default_Seraphina.png',
        name: 'Seraphina',
        description: 'Local workspace character',
        chat_size: 5,
        date_last_chat: Date.UTC(2026, 3, 30, 10, 0, 0),
        personality: '',
        scenario: '',
      },
    ]

    const catalog: WorkspaceCatalogPayload = {
      counts: { worlds: 1, assets: 2, groups: 0 },
      disabledExtensions: [],
      entries: {
        worlds: [
          {
            kind: 'world',
            name: 'Eldoria',
            tags: ['lorebook'],
            updatedAt: Date.UTC(2026, 3, 20, 0, 0, 0),
          },
        ],
        assets: [
          {
            kind: 'image',
            name: 'hero-banner',
            sizeBytes: 2048,
            tags: ['asset'],
            updatedAt: Date.UTC(2026, 3, 28, 0, 0, 0),
          },
        ],
      },
      totalChats: 1,
      totalMessages: 10,
      warningLines: 0,
    }

    const result = buildSectionBrowserData({
      catalog,
      section: 'library',
      settings,
      sortedCharacters: characters,
      t,
    })

    expect(result.records.some((item) => item.name === 'Seraphina')).toBe(true)
    expect(result.records.some((item) => item.name === 'Eldoria')).toBe(true)
    expect(result.metrics[0]?.value).toBe('3')
  })
})
