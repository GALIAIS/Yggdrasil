import type { WorkbenchSection } from '@/lib/workbench-layout'

type SectionModuleLoader = () => Promise<unknown>

const sectionModuleCache = new Map<WorkbenchSection, unknown>()
const sectionModulePromises = new Map<WorkbenchSection, Promise<unknown>>()

const SECTION_MODULE_LOADERS: Partial<Record<WorkbenchSection, SectionModuleLoader>> = {
  settings: () => Promise.resolve({}),
  system: () => Promise.resolve({}),
  sessions: () => import('@/features/sessions/SessionManagerPanel'),
  templates: () => import('@/features/templates/TemplatesManagerPanel'),
  'recently-used': () => import('@/features/recent/RecentlyUsedPanel'),
  characters: () => import('@/features/characters/CharacterManagerPanel'),
  story: () => import('@/features/story/StoryBoardPanel'),
  projects: () => import('@/features/projects/ProjectManagerPanel'),
  lorebooks: () => import('@/features/lorebooks/LorebookManagerPanel'),
  presets: () => import('@/features/presets/PresetManagerPanel'),
  assets: () => import('@/features/assets/AssetManagerPanel'),
  groups: () => import('@/features/groups/GroupsPanel'),
  extensions: () => import('@/features/extensions/ExtensionsPanel'),
  backups: () => import('@/features/backups/BackupsPanel'),
  logs: () => import('@/features/logs/LogsPanel'),
  providers: () => import('@/features/providers/ProviderManagerPanel'),
}

const SECTION_PRELOAD_ORDER: WorkbenchSection[] = [
  'sessions',
  'templates',
  'recently-used',
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
  'settings',
  'system',
]

let scheduledSectionPreload = false

export function preloadWorkbenchSection(section: WorkbenchSection) {
  if (sectionModuleCache.has(section)) {
    return Promise.resolve(sectionModuleCache.get(section))
  }

  const existingPromise = sectionModulePromises.get(section)
  if (existingPromise) {
    return existingPromise
  }

  const loader = SECTION_MODULE_LOADERS[section]
  if (!loader) {
    return Promise.resolve(undefined)
  }

  const nextPromise = loader()
    .then((module) => {
      sectionModuleCache.set(section, module)
      sectionModulePromises.delete(section)
      return module
    })
    .catch((error) => {
      sectionModulePromises.delete(section)
      throw error
    })

  sectionModulePromises.set(section, nextPromise)
  return nextPromise
}

export function readPreloadedWorkbenchSectionModule<TModule>(section: WorkbenchSection): TModule | null {
  return (sectionModuleCache.get(section) as TModule | undefined) ?? null
}

export function scheduleWorkbenchSectionPreload() {
  if (import.meta.env.MODE === 'test') return
  if (scheduledSectionPreload || typeof window === 'undefined') return
  scheduledSectionPreload = true

  const run = () => {
    for (const section of SECTION_PRELOAD_ORDER) {
      void preloadWorkbenchSection(section)
    }
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => run(), { timeout: 1200 })
    return
  }

  globalThis.setTimeout(run, 180)
}
