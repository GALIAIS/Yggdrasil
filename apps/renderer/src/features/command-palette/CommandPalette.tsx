import { useMemo, useState, type ComponentType } from 'react'
import {
  BriefcaseIcon,
  GitBranchIcon,
  DownloadIcon,
  SettingsIcon,
  BookOpenIcon,
  ActivityIcon,
  CopyIcon,
  PlusIcon,
  RefreshCwIcon,
  LibraryIcon,
  ScaleIcon,
  UploadIcon,
  WaypointsIcon,
} from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { useI18n } from '@/lib/i18n'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  characters?: Array<{ avatar: string; name: string }>
  onAction?: (actionId: CommandPaletteActionId) => void
  onSelectCharacter?: (avatar: string) => void
  onNavigate?: (section: string) => void
}

export type CommandPaletteActionId =
  | 'new-chat'
  | 'refresh-workspace'
  | 'import-character'
  | 'export-chat'
  | 'duplicate-session'
  | 'branch-from-here'
  | 'open-library'
  | 'switch-provider'
  | 'test-connection'
  | 'prompt-inspector'
  | 'token-counter'

type CommandActionItem = {
  id: CommandPaletteActionId
  icon: ComponentType<{ className?: string }>
  label: string
}

export function CommandPalette({
  open,
  onOpenChange,
  characters = [],
  onAction,
  onSelectCharacter,
  onNavigate,
}: CommandPaletteProps) {
  const { t } = useI18n()
  const [searchValue, setSearchValue] = useState('')

  const navigationItems = useMemo(
    () => [
      { id: 'settings', label: t('commandPalette.navigation.openSettings'), icon: SettingsIcon, section: 'settings' },
      { id: 'library', label: t('commandPalette.navigation.openLibrary'), icon: BookOpenIcon, section: 'library' },
      { id: 'logs', label: t('commandPalette.navigation.openLogs'), icon: ActivityIcon, section: 'logs' },
      { id: 'characters', label: t('commandPalette.navigation.openCharacters'), icon: BriefcaseIcon, section: 'characters' },
      { id: 'sessions', label: t('commandPalette.navigation.openSessions'), icon: BookOpenIcon, section: 'sessions' },
    ],
    [t],
  )

  const actionItems = useMemo(
    (): CommandActionItem[] => [
      { id: 'new-chat', label: t('commandPalette.actions.newChat'), icon: PlusIcon },
      { id: 'refresh-workspace', label: t('commandPalette.actions.refreshWorkspace'), icon: RefreshCwIcon },
      { id: 'import-character', label: t('commandPalette.actions.importCharacter'), icon: UploadIcon },
      { id: 'export-chat', label: t('commandPalette.actions.exportCurrentChat'), icon: DownloadIcon },
      { id: 'duplicate-session', label: t('commandPalette.actions.duplicateSession'), icon: CopyIcon },
      { id: 'branch-from-here', label: t('commandPalette.actions.branchCurrentChat'), icon: GitBranchIcon },
      { id: 'open-library', label: t('commandPalette.actions.openLibraryDialog'), icon: LibraryIcon },
      { id: 'switch-provider', label: t('commandPalette.actions.openSettingsConnections'), icon: SettingsIcon },
      { id: 'test-connection', label: t('commandPalette.actions.testConnection'), icon: SettingsIcon },
      { id: 'prompt-inspector', label: t('commandPalette.actions.openPromptInspector'), icon: ScaleIcon },
      { id: 'token-counter', label: t('commandPalette.actions.openContextInspector'), icon: WaypointsIcon },
    ],
    [t],
  )

  const filteredCharacters = useMemo(
    () =>
      characters.filter((char) =>
        char.name.toLowerCase().includes(searchValue.toLowerCase()),
      ),
    [characters, searchValue],
  )

  const filteredNavigation = useMemo(
    () =>
      navigationItems.filter((item) =>
        item.label.toLowerCase().includes(searchValue.toLowerCase()),
      ),
    [navigationItems, searchValue],
  )

  const filteredActions = useMemo(
    () =>
      actionItems.filter((item) =>
        item.label.toLowerCase().includes(searchValue.toLowerCase()),
      ),
    [actionItems, searchValue],
  )

  const handleCharacterSelect = (avatar: string) => {
    onSelectCharacter?.(avatar)
    onOpenChange(false)
    setSearchValue('')
  }

  const handleNavigationSelect = (section: string) => {
    onNavigate?.(section)
    onOpenChange(false)
    setSearchValue('')
  }

  const handleActionSelect = (actionId: CommandPaletteActionId) => {
    onAction?.(actionId)
    onOpenChange(false)
    setSearchValue('')
  }

  const hasResults =
    filteredCharacters.length > 0 ||
    filteredNavigation.length > 0 ||
    filteredActions.length > 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          setSearchValue('')
        }
        onOpenChange(newOpen)
      }}
      title={t('commandPalette.title')}
      description={t('commandPalette.description')}
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder={t('commandPalette.searchPlaceholder')}
          value={searchValue}
          onValueChange={setSearchValue}
        />
        <CommandList>
          {!hasResults && <CommandEmpty>{t('commandPalette.noResults')}</CommandEmpty>}

          {filteredCharacters.length > 0 && (
            <>
              <CommandGroup heading={t('commandPalette.groups.characters')}>
                {filteredCharacters.map((character) => (
                  <CommandItem
                    key={character.avatar}
                    onSelect={() => handleCharacterSelect(character.avatar)}
                  >
                    <BriefcaseIcon className="mr-2 h-4 w-4" />
                    <span>{character.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {(filteredNavigation.length > 0 || filteredActions.length > 0) && (
                <CommandSeparator />
              )}
            </>
          )}

          {filteredNavigation.length > 0 && (
            <>
              <CommandGroup heading={t('commandPalette.groups.navigation')}>
                {filteredNavigation.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => handleNavigationSelect(item.section)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{item.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              {filteredActions.length > 0 && <CommandSeparator />}
            </>
          )}

          {filteredActions.length > 0 && (
            <CommandGroup heading={t('commandPalette.groups.actions')}>
              {filteredActions.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.id}
                    onSelect={() => handleActionSelect(item.id)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <span>{item.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
