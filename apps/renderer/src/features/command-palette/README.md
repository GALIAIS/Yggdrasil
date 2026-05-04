# Yggdrasil React Frontend - Toast, Command Palette & Keyboard Shortcuts

This document explains the three new systems added to the Yggdrasil React frontend: Toast notifications, Command Palette, and Keyboard Shortcuts.

## Overview

### 1. Toast Notifications (Sonner)

Toast notifications provide non-intrusive user feedback for actions and status updates.

**Status**: ✅ Ready to use - `<Toaster />` is configured in `main.tsx`

**Files**:
- `src/main.tsx` - Toaster component added at app root

### 2. Command Palette

A keyboard-driven command interface for quick navigation and actions.

**Status**: ✅ Ready to use

**Files**:
- `src/features/command-palette/CommandPalette.tsx` - Main component
- `src/features/command-palette/index.ts` - Export barrel
- `src/features/command-palette/INTEGRATION_GUIDE.tsx` - Usage examples

### 3. Keyboard Shortcuts

Global keyboard shortcut handling with automatic platform detection (Mac vs Windows).

**Status**: ✅ Ready to use

**Files**:
- `src/hooks/useShortcuts.ts` - Hook implementation

---

## Toast Notifications

### Setup
Already configured in `src/main.tsx`. The `<Toaster />` component is at the app root level.

### Basic Usage

```typescript
import { toast } from 'sonner'

// Simple toast
toast('Hello, World!')

// Success
toast.success('Operation completed!')

// Error
toast.error('Something went wrong')

// Loading (returns toast ID for later updates)
const toastId = toast.loading('Processing...')

// Promise-based (auto-updates)
toast.promise(
  fetchData(),
  {
    loading: 'Loading...',
    success: 'Loaded!',
    error: 'Failed to load',
  }
)

// Update existing toast
toast.success('Done!', { id: toastId })

// Dismiss
toast.dismiss(toastId)
toast.dismiss() // Dismiss all
```

### Options

```typescript
toast('Message', {
  description: 'Optional description',
  duration: 4000, // milliseconds (default: 4000)
  position: 'bottom-right', // top-left, top-center, top-right, etc.
  icon: <IconComponent />,
  closeButton: true,
  action: {
    label: 'Undo',
    onClick: () => { /* ... */ },
  },
})
```

### Common Patterns

```typescript
// Chat saved
toast.success('Chat saved successfully', {
  description: 'Your conversation has been persisted.',
})

// Error with action
toast.error('Failed to save', {
  description: 'An error occurred.',
  action: {
    label: 'Retry',
    onClick: () => { /* retry logic */ },
  },
})

// Generation status
const generateToastId = toast.loading('Generating response...')

// Later...
await generateResponse()
toast.success('Response ready!', { id: generateToastId })
```

---

## Command Palette

### Overview
The Command Palette provides a searchable interface for:
- Characters (quick character switching)
- Navigation (jump to settings, library, logs, etc.)
- Actions (new chat, refresh workspace, toggle library)

### Setup

1. Import the component:
```typescript
import { CommandPalette } from '@/features/command-palette'
```

2. Add to your component:
```typescript
import { useState } from 'react'
import { CommandPalette } from '@/features/command-palette'

function MyComponent() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>Cmd+K</button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  )
}
```

### Props

```typescript
interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  characters?: Array<{ avatar: string; name: string }>
  onSelectCharacter?: (avatar: string) => void
  onNavigate?: (section: string) => void
}
```

### Full Example

```typescript
import { useState, useCallback } from 'react'
import { CommandPalette } from '@/features/command-palette'
import { useShortcuts } from '@/hooks/useShortcuts'

function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [section, setSection] = useState('workbench')

  // Hook up Cmd+K shortcut
  useShortcuts({
    onCommandPalette: () => setCommandPaletteOpen(true),
  })

  return (
    <main>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        characters={sortedCharacters.map(char => ({
          avatar: char.avatar,
          name: getCharacterName(char),
        }))}
        onSelectCharacter={handleSelectCharacter}
        onNavigate={setSection}
      />
    </main>
  )
}
```

### Features

- **Search filtering**: Real-time search across all sections
- **Keyboard navigation**: Arrow keys to navigate, Enter to select, Escape to close
- **Organized sections**: Characters, Navigation, Actions
- **Icon indicators**: Each item shows a relevant icon
- **Keyboard shortcuts**: Display available shortcuts (e.g., "Ctrl+Shift+N")

---

## Keyboard Shortcuts

### Setup

Import the hook:
```typescript
import { useShortcuts } from '@/hooks/useShortcuts'
```

Use in your component:
```typescript
useShortcuts({
  onSend: () => { /* ... */ },
  onRegenerate: () => { /* ... */ },
  onCommandPalette: () => { /* ... */ },
  onSettings: () => { /* ... */ },
  onToggleLibrary: () => { /* ... */ },
  onStopGeneration: () => { /* ... */ },
})
```

### Available Shortcuts

| Action | Windows/Linux | Mac | Callback |
|--------|---------------|-----|----------|
| Send Message | Ctrl+Enter | Cmd+Enter | `onSend` |
| Regenerate | Ctrl+Shift+R | Cmd+Shift+R | `onRegenerate` |
| Command Palette | Ctrl+K or Ctrl+/ | Cmd+K or Cmd+/ | `onCommandPalette` |
| Settings | Ctrl+, | Cmd+, | `onSettings` |
| Toggle Library | Ctrl+B | Cmd+B | `onToggleLibrary` |
| Stop Generation | Escape | Escape | `onStopGeneration` |

### Usage Example

```typescript
import { useCallback, useState } from 'react'
import { useShortcuts } from '@/hooks/useShortcuts'

function App() {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleSend = useCallback(() => {
    console.log('Sending message...')
    // Submit draft message
  }, [])

  const handleRegenerate = useCallback(() => {
    if (isGenerating) return
    console.log('Regenerating...')
    setIsGenerating(true)
    // Generate new response
  }, [isGenerating])

  const handleStopGeneration = useCallback(() => {
    if (!isGenerating) return
    console.log('Stopping generation...')
    setIsGenerating(false)
  }, [isGenerating])

  // Register shortcuts
  useShortcuts({
    onSend: handleSend,
    onRegenerate: handleRegenerate,
    onStopGeneration: handleStopGeneration,
    // ... other handlers
  })

  return <div>Your app content</div>
}
```

### Features

- **Cross-platform**: Automatic Ctrl/Cmd detection based on OS
- **Global scope**: Works anywhere in the app
- **Cleanup**: Removes event listeners on unmount
- **Optional handlers**: Only define handlers you need

### Implementation Details

The hook:
1. Detects if running on Mac using `navigator.platform`
2. Sets up global `keydown` event listener
3. Matches shortcuts against registered handlers
4. Calls appropriate handler if match found
5. Cleans up event listener on unmount

Platform detection logic:
```typescript
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
const ctrlKey = isMac ? event.metaKey : event.ctrlKey
```

---

## Integration in App.tsx

Here's how to integrate all three systems into your main App component:

```typescript
import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { CommandPalette } from '@/features/command-palette'
import { useShortcuts } from '@/hooks/useShortcuts'

function App() {
  // ... existing state ...
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // Keyboard shortcuts
  useShortcuts({
    onSend: () => {
      toast('Message sent!')
      handleDraftSubmit()
    },
    onRegenerate: () => {
      toast.loading('Regenerating...')
      handleRegenerate()
    },
    onCommandPalette: () => setCommandPaletteOpen(true),
    onSettings: () => setSection('settings'),
    onToggleLibrary: () => setLibraryCollapsed(prev => !prev),
    onStopGeneration: () => {
      toast('Generation stopped')
      handleStopGeneration()
    },
  })

  // ... other handlers ...

  return (
    <main className="ref-shell">
      <div className="ref-app">
        {/* Your existing content */}

        {/* Command Palette */}
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          characters={sortedCharacters.map(char => ({
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

---

## Dependencies

All required dependencies are already in `package.json`:

- `sonner` (2.0.7+) - Toast notifications
- `cmdk` (1.1.1+) - Command palette base
- `react` (19.2.4+) - Core framework
- UI components from shadcn/ui (dialog, command, etc.)

---

## Best Practices

### Toast Notifications
1. Use appropriate toast types (success, error, loading)
2. Keep messages concise and actionable
3. Use descriptions for additional context
4. Provide action buttons for important operations
5. Don't spam - one toast at a time per action

### Command Palette
1. Keep command labels clear and consistent
2. Group related commands together
3. Provide helpful descriptions in search
4. Use keyboard shortcuts in labels when applicable
5. Consider filtering based on context

### Keyboard Shortcuts
1. Don't conflict with browser/OS defaults
2. Provide visual feedback via toasts when needed
3. Respect Escape key for cancellation
4. Use platform-appropriate modifiers (Cmd vs Ctrl)
5. Document shortcuts in help or settings

---

## Troubleshooting

### Toast notifications not showing
- Verify `<Toaster />` is in `main.tsx`
- Check that sonner package is installed
- Ensure no CSS issues with z-index

### Command Palette not appearing
- Verify component state management
- Check that characters/actions props are passed
- Ensure Dialog component is working

### Keyboard shortcuts not firing
- Verify hook is called in component
- Check browser console for errors
- Ensure event listeners aren't being blocked
- Test with different key combinations

---

## File Structure

```
src/
├── main.tsx                    # Toaster added here
├── features/
│   └── command-palette/
│       ├── CommandPalette.tsx  # Main component
│       ├── index.ts            # Exports
│       └── INTEGRATION_GUIDE.tsx # Usage examples
└── hooks/
    └── useShortcuts.ts         # Shortcuts hook
```

---

## Next Steps

1. **Integrate into App.tsx**: Follow the "Integration in App.tsx" section above
2. **Wire up handlers**: Connect shortcuts to actual app functions
3. **Customize sections**: Modify Command Palette sections as needed
4. **Test keyboard shortcuts**: Verify all shortcuts work on target platforms
5. **Add more commands**: Extend Command Palette with app-specific commands

For detailed examples, see `src/features/command-palette/INTEGRATION_GUIDE.tsx`.
