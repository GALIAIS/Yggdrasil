import { isTauriDesktop, tauriInvoke } from './tauri.ts'

export type BackendInfo = {
  csrfToken: string
  nodeVersion: string
  pkgVersion: string
  serverVersion: string
}

export async function fetchCsrfToken(signal?: AbortSignal): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void signal
  const backend = await tauriInvoke<BackendInfo>('tauri_backend_info')
  return backend.csrfToken
}

export async function fetchBackendInfo(signal?: AbortSignal): Promise<BackendInfo> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void signal
  return tauriInvoke<BackendInfo>('tauri_backend_info')
}
