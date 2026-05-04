import { describe, expect, test } from 'vitest'

import { importCharacterFile, parseCharacterJson, parseCharacterSpec } from './character-import'

describe('character-import', () => {
  test('parses flat Yggdrasil-style character json', () => {
    const result = parseCharacterJson(JSON.stringify({
      name: 'Seraphina',
      description: 'Archivist',
      personality: 'Measured',
      scenario: 'Library',
      first_mes: 'Welcome back.',
      mes_example: '<START>',
      system_prompt: 'Stay concise.',
      post_history_instructions: 'Keep continuity.',
      alternate_greetings: ['Hello there.'],
    }))

    expect(result.name).toBe('Seraphina')
    expect(result.description).toBe('Archivist')
    expect(result.alternate_greetings).toEqual(['Hello there.'])
  })

  test('parses nested card payloads', () => {
    const result = parseCharacterSpec({
      data: {
        name: 'Nyra',
        description: 'Scout',
        first_mes: 'Ready to move.',
        alternate_greetings_json: '["Ready again."]',
      },
    }, 'fallback')

    expect(result.name).toBe('Nyra')
    expect(result.first_mes).toBe('Ready to move.')
    expect(result.alternate_greetings).toEqual(['Ready again.'])
  })

  test('imports png cards with embedded chara payload', async () => {
    const payload = {
      name: 'Arcueid',
      description: 'True ancestor princess',
      first_mes: 'You finally came.',
    }
    const file = createPngFile('arcueid-card.png', buildPngWithTextChunk('chara', btoa(JSON.stringify(payload))))

    const result = await importCharacterFile(file)

    expect(result.name).toBe('Arcueid')
    expect(result.description).toBe('True ancestor princess')
    expect(result.first_mes).toBe('You finally came.')
    expect(result.avatar_data_url?.startsWith('data:image/png;base64,')).toBe(true)
  })

  test('falls back to avatar-only png import when no chara chunk exists', async () => {
    const file = createPngFile('portrait.png', buildPngWithTextChunk('note', 'plain-avatar'))

    const result = await importCharacterFile(file)

    expect(result).toMatchObject({
      name: 'portrait',
      description: 'Imported from PNG avatar card.',
    })
    expect(result.avatar_data_url?.startsWith('data:image/png;base64,')).toBe(true)
  })
})

function buildPngWithTextChunk(key: string, value: string): Uint8Array {
  const encoder = new TextEncoder()
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const textPayload = concatBytes(encoder.encode(key), Uint8Array.from([0]), encoder.encode(value))
  const textChunk = buildChunk('tEXt', textPayload)
  const iendChunk = buildChunk('IEND', new Uint8Array())
  return concatBytes(signature, textChunk, iendChunk)
}

function createPngFile(name: string, bytes: Uint8Array): File {
  const blobBytes = new Uint8Array(bytes)
  const file = new File([blobBytes], name, { type: 'image/png' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => blobBytes.buffer,
  })
  return file
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const encoder = new TextEncoder()
  const typeBytes = encoder.encode(type)
  const lengthBytes = writeUint32(data.length)
  const crcBytes = writeUint32(0)
  return concatBytes(lengthBytes, typeBytes, data, crcBytes)
}

function writeUint32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ])
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.length
  }
  return merged
}
