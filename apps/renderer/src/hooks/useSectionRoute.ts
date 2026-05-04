import { useCallback } from 'react'
import { type WorkbenchSection, coerceWorkbenchSection } from '@/lib/workbench-layout'
import { useStoredState } from './useStoredState'

export interface UseSectionRouteReturn {
  section: WorkbenchSection
  setSection: (section: WorkbenchSection) => void
  openWith: (section: WorkbenchSection, params?: Record<string, string>) => void
  sectionParams: Record<string, string>
}

export function useSectionRoute(initial: WorkbenchSection = 'workbench'): UseSectionRouteReturn {
  const [section, setSectionRaw] = useStoredState<WorkbenchSection>('st.workbench.section', initial)
  const [sectionParams, setSectionParams] = useStoredState<Record<string, string>>('st.workbench.sectionParams', {})
  const [sectionParamsBySection, setSectionParamsBySection] = useStoredState<Record<string, Record<string, string>>>(
    'st.workbench.sectionParamsBySection',
    {},
  )

  const setSection = useCallback((next: WorkbenchSection) => {
    const target = coerceWorkbenchSection(next)
    setSectionRaw(target)
    setSectionParams(sectionParamsBySection[target] ?? {})
  }, [sectionParamsBySection, setSectionParams, setSectionRaw])

  const openWith = useCallback((next: WorkbenchSection, params?: Record<string, string>) => {
    const target = coerceWorkbenchSection(next)
    const nextParams = params ?? {}
    setSectionRaw(target)
    setSectionParams(nextParams)
    setSectionParamsBySection((current) => ({
      ...current,
      [target]: nextParams,
    }))
  }, [setSectionParams, setSectionParamsBySection, setSectionRaw])

  return { section, setSection, openWith, sectionParams }
}
