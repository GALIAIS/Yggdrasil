import { describe, expect, test, vi } from 'vitest'

import { createMenuActionHandler } from './useMenuActions'

describe('createMenuActionHandler', () => {
  test('routes open-library through workbench shell callback', () => {
    const onSetSection = vi.fn()
    const onOpenLibraryDialog = vi.fn()

    const handleMenuAction = createMenuActionHandler({
      onCreateChat: vi.fn(),
      onOpenLibraryDialog,
      onRefreshWorkspace: vi.fn(),
      onSetSection,
    })

    handleMenuAction('open-library')

    expect(onSetSection).toHaveBeenCalledWith('workbench')
    expect(onOpenLibraryDialog).toHaveBeenCalled()
  })

  test('routes prompt-inspector to generation inspector in workbench', () => {
    const onSetSection = vi.fn()
    const onFocusInspectorTab = vi.fn()

    const handleMenuAction = createMenuActionHandler({
      onCreateChat: vi.fn(),
      onFocusInspectorTab,
      onRefreshWorkspace: vi.fn(),
      onSetSection,
    })

    handleMenuAction('prompt-inspector')

    expect(onSetSection).toHaveBeenCalledWith('workbench')
    expect(onFocusInspectorTab).toHaveBeenCalledWith('generation')
  })

  test('routes test-connection through settings connection flow', () => {
    const onOpenSettingsConnections = vi.fn()
    const onTestConnection = vi.fn()

    const handleMenuAction = createMenuActionHandler({
      onCreateChat: vi.fn(),
      onOpenSettingsConnections,
      onRefreshWorkspace: vi.fn(),
      onSetSection: vi.fn(),
      onTestConnection,
    })

    handleMenuAction('test-connection')

    expect(onOpenSettingsConnections).toHaveBeenCalled()
    expect(onTestConnection).toHaveBeenCalled()
  })
})
