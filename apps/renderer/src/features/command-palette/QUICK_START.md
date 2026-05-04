# Quick start guide - Toast, Command Palette & Keyboard Shortcuts

Follow these 3 simple steps to integrate everything into your `App.tsx`.

// ============================================================================
// STEP 1: Add imports to App.tsx
// ============================================================================

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import { CommandPalette } from '@/features/command-palette'
import { useShortcuts } from '@/hooks/useShortcuts'

// ============================================================================
// STEP 2: Add state for command palette
// ============================================================================

function App() {
  // Existing state...
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // ========================================================================
  // STEP 3: Add keyboard shortcuts hook and command palette
  // ========================================================================

  // Setup keyboard shortcuts (call this early in your component)
  useShortcuts({
    onSend: () => {
      toast('Message sent!')
      // Call your existing handleDraftSubmit
    },
    onRegenerate: () => {
      toast.loading('Regenerating response...')
      // Call your existing regenerate handler
    },
    onCommandPalette: () => setCommandPaletteOpen(true),
    onSettings: () => {
      setSection('settings')
      toast('Opening settings...')
    },
    onToggleLibrary: () => {
      setLibraryCollapsed((prev) => !prev)
      toast('Library toggled')
    },
    onStopGeneration: () => {
      toast('Generation stopped')
      // Call your stop handler
    },
  })

  // ========================================================================
  // Add this to your return JSX (inside <main> element):
  // ========================================================================

  return (
    <main className="ref-shell">
      <div className="ref-app">
        {/* Your existing content */}

        {/* Add Command Palette component */}
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          characters={sortedCharacters.map((char) => ({
            avatar: typeof char.avatar === 'string' ? char.avatar : '',
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

// ============================================================================
// THAT'S IT! Now you have:
// ============================================================================
1. Toast notifications: use `toast('message')` anywhere.
2. Command Palette: press `Ctrl+K` or `Cmd+K`.
3. Keyboard Shortcuts:
   `Ctrl+Enter`, `Ctrl+Shift+R`, `Ctrl+K`, `Ctrl+,`, `Ctrl+B`, `Escape`.
4. Toaster component: already set up in `main.tsx`.

// ============================================================================
// OPTIONAL: Use toast in other components
// ============================================================================

// In any component, just import and use:
// import { toast } from 'sonner'
//
// export function MyComponent() {
//   return (
//     <button onClick={() => toast.success('Hello!')}>
//       Click me
//     </button>
//   )
// }

// ============================================================================
// SEE ALSO:
// ============================================================================

For more detailed information, see:

- `README.md` - full documentation
- `INTEGRATION_GUIDE.md` - detailed examples
- `CommandPalette.tsx` - component source
- `useShortcuts.ts` - hook source
