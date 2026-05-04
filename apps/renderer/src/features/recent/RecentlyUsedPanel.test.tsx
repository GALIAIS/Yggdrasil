import { afterEach, describe, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { RecentlyUsedPanel } from './RecentlyUsedPanel'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/features/workspace/SectionBrowser', () => ({
  SectionBrowser: ({
    records,
    onOpenRecord,
  }: {
    records?: Array<{ id: string; name: string }>
    onOpenRecord?: (record: { id: string; name: string }) => void
  }) => (
    <button type="button" onClick={() => records?.[0] && onOpenRecord?.(records[0])}>
      open
    </button>
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

describe('RecentlyUsedPanel', () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }

    if (container) {
      container.remove()
      container = null
    }
  })

  test('uses onOpenSectionWith without falling through to onSetSection', () => {
    const onOpenSectionWith = vi.fn()
    const onSetSection = vi.fn()

    renderPanel({ onOpenSectionWith, onSetSection })
    clickOpen()

    expect(onOpenSectionWith).toHaveBeenCalledWith('groups', {
      name: 'Party Alpha',
      kind: 'group',
      domain: 'groups',
    })
    expect(onSetSection).not.toHaveBeenCalled()
  })

  test('falls back to onSetSection when onOpenSectionWith is unavailable', () => {
    const onSetSection = vi.fn()

    renderPanel({ onSetSection })
    clickOpen()

    expect(onSetSection).toHaveBeenCalledWith('groups')
  })

  test('deep-links character records into the characters section with avatar params', () => {
    const onOpenSectionWith = vi.fn()
    const onSelectCharacter = vi.fn()
    const onSetSection = vi.fn()

    renderCharacterPanel({ onOpenSectionWith, onSelectCharacter, onSetSection })
    clickOpen()

    expect(onOpenSectionWith).toHaveBeenCalledWith('characters', {
      avatar: 'seraphina.png',
      name: 'Seraphina',
    })
    expect(onSelectCharacter).not.toHaveBeenCalled()
    expect(onSetSection).not.toHaveBeenCalled()
  })
})

function renderPanel(overrides: {
  onOpenSectionWith?: (section: string, params?: Record<string, string>) => void
  onSetSection?: (section: string) => void
}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root?.render(
      <RecentlyUsedPanel
        catalog={{
          counts: {},
          disabledExtensions: [],
          entries: {
            groups: [
              {
                kind: 'group',
                name: 'Party Alpha',
                updatedAt: 1714540800000,
              },
            ],
          },
          totalChats: 0,
          totalMessages: 0,
          warningLines: 0,
        }}
        onOpenSectionWith={overrides.onOpenSectionWith as never}
        onSetSection={overrides.onSetSection as never}
        sortedCharacters={[]}
      />,
    )
  })
}

function clickOpen() {
  const button = container?.querySelector('button')
  expect(button).not.toBeNull()
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function renderCharacterPanel(overrides: {
  onOpenSectionWith?: (section: string, params?: Record<string, string>) => void
  onSelectCharacter?: (avatar: string) => void
  onSetSection?: (section: string) => void
}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root?.render(
      <RecentlyUsedPanel
        catalog={{
          counts: {},
          disabledExtensions: [],
          entries: {},
          totalChats: 0,
          totalMessages: 0,
          warningLines: 0,
        }}
        onOpenSectionWith={overrides.onOpenSectionWith as never}
        onSelectCharacter={overrides.onSelectCharacter as never}
        onSetSection={overrides.onSetSection as never}
        sortedCharacters={[
          {
            avatar: 'seraphina.png',
            chat_size: 4,
            date_last_chat: 1714540800000,
            description: 'Court magician',
            name: 'Seraphina',
            tags: [],
          } as never,
        ]}
      />,
    )
  })
}
