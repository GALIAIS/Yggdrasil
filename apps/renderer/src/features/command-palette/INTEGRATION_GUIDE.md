# Example integration guide for Toast, Command Palette, and Keyboard Shortcuts

This file demonstrates how to integrate the three new systems into your Yggdrasil app.
Copy these patterns into your actual components as needed.

## Integration examples

## 1. Toast notifications

Toast notifications are now available globally via the `toast` function.
The Toaster component is already set up in `main.tsx`.

```tsx
import { toast } from 'sonner'

export function ToastExamples() {
  return (
    <>
      <button onClick={() => toast('Hello World')}>Show Toast</button>

      <button
        onClick={() =>
          toast.success('Chat saved successfully', {
            description: 'Your conversation has been persisted.',
          })
        }
      >
        Success
      </button>

      <button
        onClick={() =>
          toast.error('Failed to save chat', {
            description: 'An error occurred while saving.',
          })
        }
      >
        Error
      </button>

      <button
        onClick={() => {
          const toastId = toast.loading('Generating response...')
          // toast.success('Done!', { id: toastId })
        }}
      >
        Loading
      </button>

      <button
        onClick={() => {
          toast.promise(new Promise((resolve) => setTimeout(() => resolve('Success!'), 2000)), {
            loading: 'Loading...',
            success: 'Loaded successfully!',
            error: 'Failed to load.',
          })
        }}
      >
        Promise Toast
      </button>
    </>
  )
}
```

## 2. Command palette integration

Use the `CommandPalette` component in your app.

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import { CommandPalette } from '@/features/command-palette/CommandPalette'

export function CommandPaletteIntegration() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const characters = [
    { avatar: 'char1.jpg', name: 'Lyra Ashenfall' },
    { avatar: 'char2.jpg', name: 'Shadow Knight' },
  ]

  const handleNavigate = (section: string) => {
    console.log('Navigate to:', section)
    toast(`Navigating to ${section}`)
  }

  const handleSelectCharacter = (avatar: string) => {
    console.log('Selected character:', avatar)
    toast.success(`Character selected: ${avatar}`)
  }

  return (
    <>
      <button onClick={() => setCommandPaletteOpen(true)}>Open Command Palette</button>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        characters={characters}
        onSelectCharacter={handleSelectCharacter}
        onNavigate={handleNavigate}
      />
    </>
  )
}
```

## 3. Keyboard shortcuts integration

Use `useShortcuts` in your app component.

```tsx
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { CommandPalette } from '@/features/command-palette/CommandPalette'
import { useShortcuts } from '@/hooks/useShortcuts'

export function AppWithShortcuts() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const handleSendMessage = useCallback(() => {
    console.log('Send message (Ctrl+Enter)')
    toast('Message sent!')
  }, [])

  const handleRegenerate = useCallback(() => {
    console.log('Regenerate (Ctrl+Shift+R)')
    toast('Regenerating response...')
  }, [])

  const handleOpenSettings = useCallback(() => {
    console.log('Open Settings (Ctrl+,)')
    toast('Opening settings...')
  }, [])

  const handleToggleLibrary = useCallback(() => {
    console.log('Toggle Library (Ctrl+B)')
    toast('Toggling library...')
  }, [])

  const handleStopGeneration = useCallback(() => {
    console.log('Stop Generation (Escape)')
    toast('Generation stopped')
  }, [])

  useShortcuts({
    onSend: handleSendMessage,
    onRegenerate: handleRegenerate,
    onCommandPalette: () => setCommandPaletteOpen(true),
    onSettings: handleOpenSettings,
    onToggleLibrary: handleToggleLibrary,
    onStopGeneration: handleStopGeneration,
  })

  return (
    <div>
      <p>Press Ctrl+K to open Command Palette</p>
      <p>Press Ctrl+Enter to send message</p>
      <p>Press Ctrl+Shift+R to regenerate</p>
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </div>
  )
}
```

## 4. Full integration in App component

Example of how to integrate everything in `App.tsx`.

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import { CommandPalette } from '@/features/command-palette/CommandPalette'
import { useShortcuts } from '@/hooks/useShortcuts'

function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  useShortcuts({
    onSend: () => {
      toast('Message sent!')
      handleDraftSubmit(...)
    },
    onRegenerate: () => {
      toast('Regenerating...')
    },
    onCommandPalette: () => setCommandPaletteOpen(true),
    onSettings: () => setSection('settings'),
    onToggleLibrary: () => setLibraryCollapsed((prev) => !prev),
    onStopGeneration: () => {
      toast('Stopped generation')
    },
  })

  return (
    <main className="ref-shell">
      <div className="ref-app">
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          characters={sortedCharacters.map((char) => ({
            avatar: char.avatar,
            name: getCharacterName(char),
          }))}
          onSelectCharacter={handleSelectCharacter}
          onNavigate={setSection}
        />
      </div>
    </main>
  )
}
```
