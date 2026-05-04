import { isTauriDesktop } from '@yggdrasil/api-client'

type RuntimeLogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'
type RuntimeLogCategory = 'runtime' | 'ui' | 'network' | 'trace' | 'storage'

const recentLogKeys = new Map<string, number>()
const RECENT_LOG_WINDOW_MS = 4000

interface RuntimeLogOptions {
  category: RuntimeLogCategory
  event: string
  level: RuntimeLogLevel
  message: string
  payload?: unknown
}

let handlersInstalled = false

export async function appendRuntimeLog(options: RuntimeLogOptions): Promise<void> {
  if (!isTauriDesktop()) {
    return
  }

  const dedupeKey = buildDedupeKey(options)
  const now = Date.now()
  const previousAt = recentLogKeys.get(dedupeKey) ?? 0
  if (now - previousAt < RECENT_LOG_WINDOW_MS) {
    return
  }
  recentLogKeys.set(dedupeKey, now)

  pruneRecentLogKeys(now)

  try {
    const { appendRuntimeLog: appendRuntimeLogCommand } = await import('@yggdrasil/api-client')
    await appendRuntimeLogCommand({
      category: options.category,
      csrfToken: 'tauri-local',
      event: options.event,
      level: options.level,
      message: options.message,
      payload: options.payload,
    })
  } catch (error) {
    console.error('Failed to append runtime log', error)
  }
}

export function installGlobalRuntimeLogHandlers(): void {
  if (handlersInstalled || !isTauriDesktop() || typeof window === 'undefined') {
    return
  }
  handlersInstalled = true

  window.addEventListener('error', (event) => {
    const payload = {
      column: event.colno,
      fileName: event.filename,
      line: event.lineno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    }
    void appendRuntimeLog({
      category: 'ui',
      event: 'window-error',
      level: 'error',
      message: event.message || 'Unhandled window error',
      payload,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const payload = normalizeUnknownError(reason)
    void appendRuntimeLog({
      category: 'ui',
      event: 'unhandled-rejection',
      level: 'error',
      message: payload.message,
      payload,
    })
  })
}

export function logErrorBoundary(error: Error, componentStack?: string): void {
  void appendRuntimeLog({
    category: 'ui',
    event: 'react-error-boundary',
    level: 'error',
    message: error.message || error.name || 'React error boundary triggered',
    payload: {
      componentStack,
      name: error.name,
      stack: error.stack,
    },
  })
}

function normalizeUnknownError(value: unknown) {
  if (value instanceof Error) {
    return {
      message: value.message || value.name || 'Unhandled promise rejection',
      name: value.name,
      stack: value.stack,
    }
  }
  if (typeof value === 'string') {
    return { message: value }
  }
  try {
    return {
      message: 'Unhandled promise rejection',
      value,
    }
  } catch {
    return { message: 'Unhandled promise rejection' }
  }
}

function buildDedupeKey(options: RuntimeLogOptions): string {
  return [options.level, options.category, options.event, options.message].join('::')
}

function pruneRecentLogKeys(now: number) {
  for (const [key, timestamp] of recentLogKeys.entries()) {
    if (now - timestamp > RECENT_LOG_WINDOW_MS) {
      recentLogKeys.delete(key)
    }
  }
}
