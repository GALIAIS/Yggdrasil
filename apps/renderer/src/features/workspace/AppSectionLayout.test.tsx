import type { CharacterSummary } from '@yggdrasil/api-client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import {
  type AppSectionLayoutProps,
  AppSectionInspectorPanel,
  AppSectionMainPanel,
  AppSectionResourcePanel,
} from './AppSectionLayout'
import { preloadWorkbenchSection } from './workbenchSectionPreload'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

vi.mock('@/features/settings/SettingsWorkspace', () => ({
  SettingsWorkspace: ({ slot }: { slot: 'resource' | 'main' | 'inspector' }) => (
    <div data-testid={`settings-${slot}`}>
      {slot === 'resource' ? '设置目录' : slot === 'main' ? '账本设置' : '设置概览'}
    </div>
  ),
}))

vi.mock('@/features/system/SystemWorkspace', () => ({
  SystemWorkspace: ({ slot }: { slot: 'resource' | 'main' | 'inspector' }) => (
    <div data-testid={`system-${slot}`}>
      {slot === 'resource' ? '系统目录' : slot === 'main' ? '系统工作区' : '系统概览'}
    </div>
  ),
}))

vi.mock('@/features/library/LibraryPanel', () => ({
  LibraryPanel: ({
    selectedCharacterAvatar,
  }: {
    selectedCharacterAvatar?: string
  }) => (
    <div className="xl:grid-rows-[auto_minmax(0,1fr)]">
      <div className="xl:h-[22rem]">角色资源</div>
      <div className="min-h-0">
        {selectedCharacterAvatar ? '会话资源' : '先选择一个角色'}
        <button disabled={!selectedCharacterAvatar} type="button">新建会话</button>
      </div>
    </div>
  ),
}))

vi.mock('@/features/chat/ChatTranscriptCard', () => ({
  ChatTranscriptCard: ({
    selectedChatId,
  }: {
    selectedChatId?: string
  }) => (
    <div>
      <div>{selectedChatId ? '消息与输入区。' : '还没有打开聊天'}</div>
      <textarea id="draft-message" placeholder="输入第一条消息" />
      <button type="button">创建并生成</button>
    </div>
  ),
}))

vi.mock('@/features/logs/LogsPanel', () => ({
  LogsPanel: ({ initialSelectedName }: { initialSelectedName?: string }) => (
    <div data-testid="logs-panel">{initialSelectedName ?? 'no-log-selection'}</div>
  ),
}))

vi.mock('@/features/groups/GroupsPanel', () => ({
  GroupsPanel: ({ initialSelectedName }: { initialSelectedName?: string }) => (
    <div data-testid="groups-panel">{initialSelectedName ?? 'no-group-selection'}</div>
  ),
}))

vi.mock('@/features/sessions/SessionManagerPanel', () => ({
  SessionManagerPanel: ({ sessions }: { sessions?: Array<{ name: string; note?: string }> }) => (
    <div data-testid="sessions-panel">
      {(sessions ?? []).map((session) => (
        <div key={session.name}>
          <span>{session.name}</span>
          <span>{session.note ?? ''}</span>
        </div>
      ))}
    </div>
  ),
}))

vi.mock('@/features/characters/CharacterManagerPanel', () => ({
  CharacterManagerPanel: ({ selectedAvatar }: { selectedAvatar?: string }) => (
    <div data-testid="characters-panel">{selectedAvatar ?? 'no-character-selection'}</div>
  ),
}))

vi.mock('@/features/story/StoryBoardPanel', () => ({
  StoryBoardPanel: ({
    initialSelectedKind,
    initialSelectedName,
  }: {
    initialSelectedKind?: string
    initialSelectedName?: string
  }) => (
    <div data-testid="story-panel">
      {initialSelectedKind ?? 'story-kind'}
      {':'}
      {initialSelectedName ?? 'story-name'}
    </div>
  ),
}))

vi.mock('@/features/projects/ProjectManagerPanel', () => ({
  ProjectManagerPanel: ({ initialSelectedName }: { initialSelectedName?: string }) => (
    <div data-testid="projects-panel">{initialSelectedName ?? 'no-project-selection'}</div>
  ),
}))

vi.mock('@/components/ui/slider', () => ({
  Slider: () => <div data-testid="mock-slider" />,
}))

vi.mock('./SectionBrowser', () => ({
  SectionBrowser: ({
    records,
    emptyTitle,
    emptyDescription,
  }: {
    records?: Array<{ name: string; status: string }>
    emptyTitle?: string
    emptyDescription?: string
  }) => (
    <div>
      {records && records.length > 0 ? (
        records.map((record) => (
          <div key={record.name}>
            <span>{record.name}</span>
            <span>{record.status}</span>
          </div>
        ))
      ) : (
        <div>
          <span>{emptyTitle}</span>
          <span>{emptyDescription}</span>
        </div>
      )}
    </div>
  ),
}))

describe('AppSectionLayout', () => {
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

  test('places settings content in the main panel for settings section', async () => {
    const props = createProps({ section: 'settings' })
    renderShell(props)
    await flushSuspense()
    await flushSuspense()

    expect(querySlot('main-panel')?.textContent).toContain('账本设置')
    expect(querySlot('resource-panel')?.textContent).toContain('设置目录')
    expect(querySlot('inspector')?.textContent).toContain('设置概览')
    expect(querySlot('inspector')?.textContent).not.toContain('Section')
  })

  test('places workbench explorer cards in the resource panel and transcript in the main panel', () => {
    const props = createProps({
      section: 'workbench',
      selectedCharacter: createCharacter(),
      selectedCharacterAvatar: 'hero.png',
      selectedChatId: 'chat-1',
    })
    renderShell(props)

    const resourcePanel = querySlot('resource-panel')
    const mainPanel = querySlot('main-panel')

    expect(resourcePanel?.textContent).toContain('角色资源')
    expect(resourcePanel?.textContent).toContain('会话资源')
    expect(mainPanel?.textContent).toContain('消息与输入区。')
    expect(mainPanel?.textContent).not.toContain('角色资源')
    expect(mainPanel?.textContent).not.toContain('会话资源')
  })

  test('uses the settings-style resource layout skeleton for workbench left rail', () => {
    const props = createProps({ section: 'workbench' })
    renderShell(props)

    const resourcePanel = querySlot('resource-panel')
    const grid = resourcePanel?.firstElementChild as HTMLDivElement | null
    const wrappers = grid ? Array.from(grid.children) as HTMLDivElement[] : []

    expect(grid?.className).toContain('xl:grid-rows-[auto_minmax(0,1fr)]')
    expect(wrappers[0]?.className).toContain('xl:h-[22rem]')
    expect(wrappers[1]?.className).toContain('min-h-0')
  })

  test('places system content in the main panel for system section', async () => {
    const props = createProps({ section: 'system' })
    renderShell(props)
    await flushSuspense()
    await flushSuspense()

    expect(querySlot('main-panel')?.textContent).toContain('系统工作区')
    expect(querySlot('resource-panel')?.textContent).toContain('系统目录')
    expect(querySlot('inspector')?.textContent).toContain('系统概览')
    expect(querySlot('inspector')?.textContent).not.toContain('Section')
  })

  test('shows only the idle character state in the resource panel when no character is selected', () => {
    const props = createProps({ section: 'workbench' })
    renderShell(props)

    const resourcePanel = querySlot('resource-panel')
    const createButton = Array.from(resourcePanel?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('新建会话'),
    )

    expect(resourcePanel?.textContent).toContain('先选择一个角色')
    expect(resourcePanel?.textContent).not.toContain('没有历史会话')
    expect(createButton?.hasAttribute('disabled')).toBe(true)
  })

  test('shows only the idle chat state in the main panel when no chat is selected', () => {
    const props = createProps({
      section: 'workbench',
      selectedCharacter: createCharacter(),
      selectedCharacterAvatar: 'hero.png',
      draftMessage: 'hello',
    })
    renderShell(props)

    const mainPanel = querySlot('main-panel')
    const draftMessage = mainPanel?.querySelector<HTMLTextAreaElement>('#draft-message')
    const submitButton = Array.from(mainPanel?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('创建并生成'),
    )

    expect(mainPanel?.textContent).toContain('还没有打开聊天')
    expect(mainPanel?.textContent).not.toContain('聊天为空')
    expect(draftMessage?.getAttribute('placeholder')).toBe('输入第一条消息')
    expect(submitButton).not.toBeUndefined()
  })

  test('renders non-workbench section rows from real catalog data instead of locale demo data', async () => {
    const props = createProps({
      section: 'sessions',
      catalog: {
        counts: { chatFiles: 1 },
        disabledExtensions: [],
        entries: {
          sessions: [
            {
              kind: 'chat',
              name: 'Seraphina - 2026-04-25 16-43-19',
              itemCount: 12,
              note: 'Latest real transcript',
              tags: ['Seraphina'],
              updatedAt: Date.UTC(2026, 3, 25, 8, 43, 19),
            },
          ],
        },
        totalChats: 1,
        totalMessages: 12,
        warningLines: 0,
      },
    })
    renderShell(props)
    await flushSuspense()
    await flushSuspense()

    const mainPanel = querySlot('main-panel')
    expect(mainPanel?.textContent).toContain('Seraphina - 2026-04-25 16-43-19')
    expect(mainPanel?.textContent).toContain('Latest real transcript')
    expect(mainPanel?.textContent).not.toContain('Valewood Patrol')
  })

  test('passes section params into the logs panel for deep-link selection', async () => {
    const props = createProps({
      section: 'logs',
      sectionParams: { name: 'tauri-dev.log' },
    })

    renderShell(props)
    await flushSuspense()

    expect(querySlot('main-panel')?.textContent).toContain('tauri-dev.log')
  })

  test('passes group section params into the groups panel', async () => {
    const props = createProps({
      section: 'groups',
      sectionParams: { name: 'Party Alpha' },
    })

    renderShell(props)
    await flushSuspense()

    expect(querySlot('main-panel')?.textContent).toContain('Party Alpha')
  })

  test('passes story section params into the story board panel', async () => {
    const props = createProps({
      section: 'story',
      sectionParams: { kind: 'scenes', name: 'Moonlit Crossing' },
    })

    renderShell(props)
    await flushSuspense()

    expect(querySlot('main-panel')?.textContent).toContain('scenes:Moonlit Crossing')
  })

  test('passes project section params into the project manager panel', async () => {
    const props = createProps({
      section: 'projects',
      sectionParams: { name: 'Moonlit Chronicle' },
    })

    renderShell(props)
    await flushSuspense()

    expect(querySlot('main-panel')?.textContent).toContain('Moonlit Chronicle')
  })

  test('uses the live selected character avatar instead of pinning the characters panel to stale route params', async () => {
    const props = createProps({
      section: 'characters',
      selectedCharacterAvatar: 'current.png',
      sectionParams: { avatar: 'deep-link.png' },
    })

    renderShell(props)
    await flushSuspense()

    expect(querySlot('main-panel')?.textContent).toContain('current.png')
    expect(querySlot('main-panel')?.textContent).not.toContain('deep-link.png')
  })

  test('uses preloaded section modules on first render without showing loading fallback', async () => {
    await preloadWorkbenchSection('sessions')
    const props = createProps({
      section: 'sessions',
      catalog: {
        counts: { chatFiles: 1 },
        disabledExtensions: [],
        entries: {
          sessions: [
            {
              kind: 'chat',
              name: 'Loaded From Cache',
              itemCount: 1,
              note: 'Immediate render',
              tags: [],
              updatedAt: Date.UTC(2026, 4, 1, 5, 0, 0),
            },
          ],
        },
        totalChats: 1,
        totalMessages: 1,
        warningLines: 0,
      },
    })

    renderShell(props)

    expect(querySlot('main-panel')?.textContent).toContain('Loaded From Cache')
    expect(querySlot('main-panel')?.textContent).not.toContain('sectionBrowser.loadingSection')
  })
})

function renderShell(props: ReturnType<typeof createProps>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root?.render(
      <div>
        <div data-slot="resource-panel">
          <AppSectionResourcePanel {...props} />
        </div>
        <div data-slot="main-panel">
          <AppSectionMainPanel {...props} />
        </div>
        <div data-slot="inspector">
          <AppSectionInspectorPanel {...props} />
        </div>
      </div>,
    )
  })
}

async function flushSuspense() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 16))
  })
}

function querySlot(slot: string) {
  return container?.querySelector(`[data-slot="${slot}"]`) ?? null
}

function createProps(
  overrides: Partial<AppSectionLayoutProps> & { section: AppSectionLayoutProps['section'] },
): AppSectionLayoutProps {
  return {
    ...createBaseProps(),
    ...overrides,
  }
}

function createBaseProps(): AppSectionLayoutProps {
  return {
    section: 'workbench',
    sectionParams: {},
    auth: null,
    settings: null,
    catalog: null,
    sortedCharacters: [],
    selectedCharacterAvatar: '',
    selectedCharacter: null,
    characterChats: [],
    selectedChatId: '',
    selectedChat: null,
    transcriptMessages: [],
    chatMessages: [],
    chatMetadata: null,
    loading: false,
    chatsLoading: false,
    chatLoading: false,
    chatsError: null,
    chatError: null,
    saveError: null,
    actionPending: false,
    draftMessage: '',
    draftAuthorName: 'User',
    currentUserLabel: 'Tester',
    workspaceError: null,
    libraryCollapsed: false,
    activeWorldDocuments: [],
    onSetSection: vi.fn(),
    onOpenSectionWith: vi.fn(),
    onSelectCharacter: vi.fn(),
    onSelectChat: vi.fn(),
    onCreateChat: vi.fn(),
    onToggleLibrary: vi.fn(),
    onDraftChange: vi.fn(),
    onDraftSubmit: vi.fn(),
    onResaveClick: vi.fn(),
  }
}

function createCharacter(): CharacterSummary {
  return {
    avatar: 'hero.png',
    chat_size: 0,
    description: 'Desk companion',
    name: 'Hero',
    personality: 'Calm',
    scenario: 'Bridge',
  }
}
