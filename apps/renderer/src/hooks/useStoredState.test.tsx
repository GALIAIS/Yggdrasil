import { afterEach, describe, expect, test } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useStoredState } from './useStoredState'

let container: HTMLDivElement | null = null
let root: Root | null = null

function StoredStateHarness({ storageKey }: { storageKey: string }) {
  const [value, setValue] = useStoredState(storageKey, 'fallback')

  return (
    <div>
      <output data-testid="value">{value}</output>
      <button type="button" onClick={() => setValue('updated-value')}>update</button>
    </div>
  )
}

describe('useStoredState', () => {
  afterEach(() => {
    const mountedRoot = root
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount()
      })
      root = null
    }

    if (container) {
      container.remove()
      container = null
    }

    window.localStorage.clear()
  })

  test('hydrates from localStorage on first render', () => {
    window.localStorage.setItem('st.test.storage', JSON.stringify('persisted-value'))

    renderHarness('st.test.storage')

    expect(readValue()).toBe('persisted-value')
  })

  test('persists updates so a remount restores the last selection', () => {
    renderHarness('st.test.storage')

    const updateButton = container?.querySelector('button')
    act(() => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(window.localStorage.getItem('st.test.storage')).toBe(JSON.stringify('updated-value'))

    act(() => {
      root?.unmount()
    })
    root = null

    renderHarness('st.test.storage')
    expect(readValue()).toBe('updated-value')
  })
})

function renderHarness(storageKey: string) {
  container = document.createElement('div')
  const nextContainer = container
  document.body.appendChild(nextContainer)
  root = createRoot(nextContainer)

  act(() => {
    root?.render(<StoredStateHarness storageKey={storageKey} />)
  })
}

function readValue() {
  return container?.querySelector('[data-testid="value"]')?.textContent
}
