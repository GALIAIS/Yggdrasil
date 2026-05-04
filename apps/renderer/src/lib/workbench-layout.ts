export type WorkbenchSection =
  | 'workbench'
  | 'settings'
  | 'system'
  | 'sessions'
  | 'templates'
  | 'recently-used'
  | 'library'
  | 'characters'
  | 'story'
  | 'projects'
  | 'lorebooks'
  | 'presets'
  | 'assets'
  | 'groups'
  | 'extensions'
  | 'backups'
  | 'logs'
  | 'providers'

export type WorkbenchBackendState = 'loading' | 'connected' | 'offline'

export type WorkbenchSaveState = 'idle' | 'saving' | 'saved'

export interface WorkbenchCharacterLike {
  avatar?: string | null
}

export interface WorkbenchChatLike {
  file_id?: string | null
}

export interface PickPersistedSelectionInput {
  section?: unknown
  avatar?: string | null
  chatId?: string | null
  characters?: readonly WorkbenchCharacterLike[]
  chats?: readonly WorkbenchChatLike[]
}

export interface WorkbenchSelection {
  section: WorkbenchSection
  avatar: string | null
  chatId: string | null
}

export interface DeriveStatusItemsInput {
  backendState: WorkbenchBackendState
  characterName?: string | null
  chatId?: string | null
  saveState?: WorkbenchSaveState
  error?: string | null
}

export type WorkbenchStatusSlot = 'backend' | 'character' | 'chat' | 'save' | 'error'

export interface WorkbenchStatusItem {
  slot: WorkbenchStatusSlot
  state?: WorkbenchBackendState | WorkbenchSaveState
  value?: string
}

export interface WorkbenchPanelLayoutInput {
  viewportWidth: number
  resourceMinPx?: number
  resourceDefaultPx?: number
  mainMinPx?: number
  compactBreakpointPx?: number
}

export interface WorkbenchPanelLayout {
  isCompact: boolean
  resourceDefaultSize: number
  resourceMinSize: number
  mainMinSize: number
}

const WORKBENCH_SECTIONS: readonly WorkbenchSection[] = [
  'workbench',
  'settings',
  'system',
  'sessions',
  'templates',
  'recently-used',
  'library',
  'characters',
  'story',
  'projects',
  'lorebooks',
  'presets',
  'assets',
  'groups',
  'extensions',
  'backups',
  'logs',
  'providers',
]
const DEFAULT_RESOURCE_MIN_PX = 384
const DEFAULT_RESOURCE_DEFAULT_PX = 448
const DEFAULT_MAIN_MIN_PX = 560
const DEFAULT_COMPACT_BREAKPOINT_PX = 1180

export function coerceWorkbenchSection(value: unknown): WorkbenchSection {
  return typeof value === 'string' && WORKBENCH_SECTIONS.includes(value as WorkbenchSection)
    ? (value as WorkbenchSection)
    : 'workbench'
}

function firstAvatar(characters: readonly WorkbenchCharacterLike[]): string | null {
  for (const character of characters) {
    if (typeof character.avatar === 'string' && character.avatar) {
      return character.avatar
    }
  }

  return null
}

function firstChatId(chats: readonly WorkbenchChatLike[]): string | null {
  for (const chat of chats) {
    if (typeof chat.file_id === 'string' && chat.file_id) {
      return chat.file_id
    }
  }

  return null
}

export function pickPersistedSelection({
  section,
  avatar,
  chatId,
  characters = [],
  chats = [],
}: PickPersistedSelectionInput): WorkbenchSelection {
  const nextAvatar =
    typeof avatar === 'string' && avatar && characters.some((item) => item.avatar === avatar)
      ? avatar
      : firstAvatar(characters)

  const nextChatId =
    nextAvatar && typeof chatId === 'string' && chatId && chats.some((item) => item.file_id === chatId)
      ? chatId
      : nextAvatar
        ? firstChatId(chats)
        : null

  return {
    section: coerceWorkbenchSection(section),
    avatar: nextAvatar,
    chatId: nextChatId,
  }
}

function createBackendItem(backendState: WorkbenchBackendState): WorkbenchStatusItem {
  return { slot: 'backend', state: backendState }
}

function createSaveItem(saveState: WorkbenchSaveState): WorkbenchStatusItem | null {
  switch (saveState) {
    case 'saving':
    case 'saved':
      return { slot: 'save', state: saveState }
    default:
      return null
  }
}

export function deriveStatusItems({
  backendState,
  characterName,
  chatId,
  saveState = 'idle',
  error,
}: DeriveStatusItemsInput): WorkbenchStatusItem[] {
  const items: WorkbenchStatusItem[] = [createBackendItem(backendState)]

  if (typeof characterName === 'string' && characterName.trim()) {
    items.push({
      slot: 'character',
      value: characterName.trim(),
    })
  }

  if (typeof chatId === 'string' && chatId.trim()) {
    items.push({ slot: 'chat', value: chatId.trim() })
  }

  const saveItem = createSaveItem(saveState)
  if (saveItem) {
    items.push(saveItem)
  }

  if (typeof error === 'string' && error.trim()) {
    items.push({ slot: 'error', value: error.trim() })
  }

  return items
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pxToPercent(valuePx: number, viewportWidth: number): number {
  if (viewportWidth <= 0) {
    return 0
  }

  return (valuePx / viewportWidth) * 100
}

export function deriveWorkbenchPanelLayout({
  viewportWidth,
  resourceMinPx = DEFAULT_RESOURCE_MIN_PX,
  resourceDefaultPx = DEFAULT_RESOURCE_DEFAULT_PX,
  mainMinPx = DEFAULT_MAIN_MIN_PX,
  compactBreakpointPx = DEFAULT_COMPACT_BREAKPOINT_PX,
}: WorkbenchPanelLayoutInput): WorkbenchPanelLayout {
  const safeViewportWidth = Math.max(viewportWidth, 1)
  const isCompact = safeViewportWidth < compactBreakpointPx

  const resourceMinSize = clamp(pxToPercent(resourceMinPx, safeViewportWidth), 24, 42)
  const mainMinSize = clamp(pxToPercent(mainMinPx, safeViewportWidth), 36, 68)
  const resourceMaxSize = Math.max(resourceMinSize, 100 - mainMinSize)
  const resourceDefaultSize = clamp(
    pxToPercent(resourceDefaultPx, safeViewportWidth),
    resourceMinSize,
    resourceMaxSize,
  )

  return {
    isCompact,
    resourceDefaultSize: roundPercent(resourceDefaultSize),
    resourceMinSize: roundPercent(resourceMinSize),
    mainMinSize: roundPercent(mainMinSize),
  }
}
