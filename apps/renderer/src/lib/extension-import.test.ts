import { describe, expect, test } from 'vitest'

import { parseExtensionImport } from './extension-import'

describe('parseExtensionImport', () => {
  test('normalizes extension manifest fields', () => {
    const result = parseExtensionImport(
      JSON.stringify({
        display_name: 'Tavern Tools',
        version: '1.2.0',
        author: 'ST Team',
        homepage: 'https://example.com/tools',
        description: 'Utility helpers',
        type: 'tooling',
      }),
      'tavern-tools.json',
    )

    expect(result.name).toBe('Tavern Tools')
    expect(result.kind).toBe('extension')
    expect(result.tags).toContain('tooling')
    expect(result.tags).toContain('version:1.2.0')
    expect(result.tags).toContain('author:ST Team')
    expect(result.tags).toContain('linked')
    expect(result.contentText).toContain('"name": "Tavern Tools"')
  })

  test('falls back to file name when manifest name is missing', () => {
    const result = parseExtensionImport(JSON.stringify({ version: '0.1.0' }), 'quick-pack.json')
    expect(result.name).toBe('quick-pack')
  })

  test('parses exported extension documents', () => {
    const result = parseExtensionImport(
      JSON.stringify({
        domain: 'extensions',
        name: 'Tavern Tools',
        kind: 'extension',
        content: {
          display_name: 'Tavern Tools',
          version: '1.2.0',
          author: 'ST Team',
          homepage: 'https://example.com/tools',
          description: 'Utility helpers',
          type: 'tooling',
        },
      }),
      'tavern-tools-export.json',
    )

    expect(result.name).toBe('Tavern Tools')
    expect(result.tags).toContain('tooling')
    expect(result.tags).toContain('version:1.2.0')
  })

  test('throws on invalid json', () => {
    expect(() => parseExtensionImport('{', 'broken.json')).toThrow('broken.json 不是有效的 JSON 文件。')
  })
})
