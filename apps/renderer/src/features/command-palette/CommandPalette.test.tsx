import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { CommandPalette } from './CommandPalette'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  CommandInput: () => null,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: () => void
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  CommandSeparator: () => <hr />,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

describe('CommandPalette', () => {
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

  test('dispatches import character action from palette', () => {
    const onAction = vi.fn()

    renderPalette({ onAction })
    clickButtonWithText('commandPalette.actions.importCharacter')

    expect(onAction).toHaveBeenCalledWith('import-character')
  })

  test('dispatches export current chat action from palette', () => {
    const onAction = vi.fn()

    renderPalette({ onAction })
    clickButtonWithText('commandPalette.actions.exportCurrentChat')

    expect(onAction).toHaveBeenCalledWith('export-chat')
  })
})

function renderPalette(overrides: {
  onAction?: (actionId: Parameters<NonNullable<ComponentProps<typeof CommandPalette>['onAction']>>[0]) => void
}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root?.render(
      <CommandPalette
        characters={[]}
        onAction={overrides.onAction}
        onOpenChange={() => undefined}
        open
      />,
    )
  })
}

function clickButtonWithText(text: string) {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find((item) =>
    item.textContent?.includes(text),
  )
  expect(button).not.toBeUndefined()
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
