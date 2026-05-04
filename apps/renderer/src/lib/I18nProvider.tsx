import React, { useEffect, useState } from 'react'

import { I18nContext, type Locale, type TranslationResource } from './i18n-context'

const LOCALE_STORAGE_KEY = 'st-locale'
const DEFAULT_LOCALE: Locale = 'en-US'

const localeResources: Record<Locale, () => Promise<TranslationResource>> = {
  'en-US': () => import('../locales/en-US').then((m) => m.default),
  'zh-CN': () => import('../locales/zh-CN').then((m) => m.default),
}

function getTranslation(obj: TranslationResource, path: string): string {
  const keys = path.split('.')
  let current: string | TranslationResource | undefined = obj

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key]
    } else {
      return path
    }
  }

  return typeof current === 'string' ? current : path
}

function interpolate(value: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return value
  }

  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const resolved = vars[key]
    return resolved === undefined ? `{{${key}}}` : String(resolved)
  })
}

interface I18nProviderProps {
  children: React.ReactNode
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)
  const [resources, setResources] = useState<TranslationResource | null>(null)

  const loadLocale = React.useCallback(async (newLocale: Locale) => {
    const fetchResource = async (targetLocale: Locale): Promise<TranslationResource | null> => {
      try {
        const loader = localeResources[targetLocale]
        return await loader()
      } catch (error) {
        console.error(`Failed to load locale ${targetLocale}:`, error)
        return null
      }
    }

    const resource = await fetchResource(newLocale)
    if (resource) {
      setResources(resource)
      setLocaleState(newLocale)
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale)
      return
    }

    if (newLocale !== DEFAULT_LOCALE) {
      const fallbackResource = await fetchResource(DEFAULT_LOCALE)
      if (fallbackResource) {
        setResources(fallbackResource)
        setLocaleState(DEFAULT_LOCALE)
        localStorage.setItem(LOCALE_STORAGE_KEY, DEFAULT_LOCALE)
      }
    }
  }, [])

  useEffect(() => {
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY)
    const browserLocale =
      typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
        ? 'zh-CN'
        : DEFAULT_LOCALE
    const initialLocale =
      savedLocale && ['en-US', 'zh-CN'].includes(savedLocale)
        ? (savedLocale as Locale)
        : browserLocale

    void loadLocale(initialLocale)
  }, [loadLocale])

  const t = (key: string, vars?: Record<string, string | number>): string => {
    if (!resources) {
      return key
    }

    return interpolate(getTranslation(resources, key), vars)
  }

  const setLocale = (newLocale: Locale) => {
    void loadLocale(newLocale)
  }

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}
