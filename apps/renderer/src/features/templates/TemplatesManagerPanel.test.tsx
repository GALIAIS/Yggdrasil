import { afterEach, describe, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { TemplatesManagerPanel } from './TemplatesManagerPanel'

const sectionBrowserState: {
  onOpenRecord?: (record: { id: string; name: string }) => void
} = {}

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/features/workspace/SectionBrowser', () => ({
  SectionBrowser: ({
    onOpenRecord,
  }: {
    onOpenRecord?: (record: { id: string; name: string }) => void
  }) => {
    sectionBrowserState.onOpenRecord = onOpenRecord
    return (
      <button type="button" onClick={() => onOpenRecord?.({ id: 'sysprompt::::Court Brief::1714540800000', name: 'Court Brief' })}>
        open
      </button>
    )
  },
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

describe('TemplatesManagerPanel', () => {
  afterEach(() => {
    sectionBrowserState.onOpenRecord = undefined

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

    expect(onOpenSectionWith).toHaveBeenCalledWith('presets', {
      name: 'Court Brief',
      kind: 'sysprompt',
      domain: 'sysprompts',
    })
    expect(onSetSection).not.toHaveBeenCalled()
  })

  test('falls back to onSetSection when onOpenSectionWith is unavailable', () => {
    const onSetSection = vi.fn()

    renderPanel({ onSetSection })
    clickOpen()

    expect(onSetSection).toHaveBeenCalledWith('presets')
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
      <TemplatesManagerPanel
        catalog={{
          counts: {},
          disabledExtensions: [],
          entries: {
            sysprompts: [
              {
                kind: 'sysprompt',
                name: 'Court Brief',
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
