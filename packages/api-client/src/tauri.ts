declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

const fileSrcCache = new Map<string, string>()
const avatarInvalidationListeners = new Set<(avatar?: string) => void>()

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return await invoke<T>(command, args)
  } catch (cause) {
    if (cause instanceof Error) {
      throw cause
    }

    if (typeof cause === 'string' && cause.trim()) {
      throw new Error(cause)
    }

    if (cause && typeof cause === 'object') {
      const message = Reflect.get(cause, 'message')
      if (typeof message === 'string' && message.trim()) {
        throw new Error(message)
      }

      const error = Reflect.get(cause, 'error')
      if (typeof error === 'string' && error.trim()) {
        throw new Error(error)
      }

      try {
        throw new Error(JSON.stringify(cause))
      } catch {
        throw new Error('Unknown Tauri invoke error')
      }
    }

    throw new Error('Unknown Tauri invoke error')
  }
}

export async function resolveTauriAvatarSrc(avatar: string): Promise<string> {
  if (!avatar) {
    return ''
  }

  const cached = fileSrcCache.get(avatar)
  if (cached) {
    return cached
  }

  const nextSrc = await tauriInvoke<string>('tauri_read_avatar_data_url', { avatarUrl: avatar })
  fileSrcCache.set(avatar, nextSrc)
  return nextSrc
}

export function peekTauriAvatarSrcCache(avatar: string): string {
  if (!avatar) {
    return ''
  }

  return fileSrcCache.get(avatar) ?? ''
}

export function clearTauriAvatarSrcCache(avatar?: string) {
  if (avatar) {
    fileSrcCache.delete(avatar)
    avatarInvalidationListeners.forEach((listener) => listener(avatar))
    return
  }

  fileSrcCache.clear()
  avatarInvalidationListeners.forEach((listener) => listener(undefined))
}

export function subscribeTauriAvatarSrcInvalidation(
  listener: (avatar?: string) => void,
): () => void {
  avatarInvalidationListeners.add(listener)
  return () => {
    avatarInvalidationListeners.delete(listener)
  }
}
