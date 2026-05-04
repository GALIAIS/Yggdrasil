import { describe, expect, test } from 'vitest'

import { inferAssetKind, parseAssetImport } from './asset-import'

describe('asset-import', () => {
  test('infers image assets', () => {
    expect(inferAssetKind('image/png')).toBe('image')
  })

  test('infers audio assets', () => {
    expect(inferAssetKind('audio/mpeg')).toBe('audio')
  })

  test('infers video assets', () => {
    expect(inferAssetKind('video/mp4')).toBe('video')
  })

  test('forces background kind for background domain', () => {
    expect(inferAssetKind('image/png', 'backgrounds')).toBe('background')
  })

  test('parses exported asset wrapper json', () => {
    const parsed = parseAssetImport(
      JSON.stringify({
        domain: 'assets',
        kind: 'image',
        name: 'Moon Portrait',
        tags: ['portrait', 'moon'],
        content: {
          fileName: 'moon.png',
          mimeType: 'image/png',
          size: 1024,
          dataUrl: 'data:image/png;base64,AAA=',
        },
      }),
      'moon-export.json',
    )

    expect(parsed).toEqual({
      domain: 'assets',
      kind: 'image',
      name: 'Moon Portrait',
      tags: ['portrait', 'moon'],
      contentText: JSON.stringify(
        {
          fileName: 'moon.png',
          mimeType: 'image/png',
          size: 1024,
          dataUrl: 'data:image/png;base64,AAA=',
        },
        null,
        2,
      ),
    })
  })
})
