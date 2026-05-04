import type { CharacterSummary, WorkspaceCatalogEntry } from '@yggdrasil/api-client'
import { describe, expect, test } from 'vitest'

import {
  resolveCatalogEntrySection,
  toCharacterCatalogEntries,
} from './catalog-entry-helpers'

describe('catalog-entry-helpers', () => {
  test('maps workspace catalog kinds to concrete workbench sections', () => {
    const cases: Array<[WorkspaceCatalogEntry['kind'], ReturnType<typeof resolveCatalogEntrySection>]> = [
      ['chat', 'sessions'],
      ['world', 'lorebooks'],
      ['sysprompt', 'presets'],
      ['asset', 'assets'],
      ['group', 'groups'],
      ['extension', 'extensions'],
      ['archive', 'backups'],
      ['log', 'logs'],
      ['character', 'characters'],
    ]

    cases.forEach(([kind, expected]) => {
      expect(resolveCatalogEntrySection({ kind, name: kind })).toBe(expected)
    })
  })

  test('keeps character avatar ids when projecting characters into catalog entries', () => {
    const characters: CharacterSummary[] = [
      {
        avatar: 'seraphina.png',
        chat_size: 4,
        description: 'Desk companion',
        name: 'Seraphina',
        personality: '',
        scenario: '',
      },
    ]

    const [entry] = toCharacterCatalogEntries(characters)
    expect(entry?.kind).toBe('character')
    expect(entry?.sourceAvatar).toBe('seraphina.png')
  })
})
