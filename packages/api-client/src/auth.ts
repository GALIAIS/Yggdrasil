import type { BackendInfo } from './bootstrap.ts'
import { isTauriDesktop, tauriInvoke } from './tauri.ts'

export type PublicUser = {
  avatar: string | null
  created: number
  handle: string
  name: string
  password: boolean
}

export type CurrentUser = PublicUser & {
  admin: boolean
}

export type LoginPayload = {
  csrfToken: string
  handle: string
  password: string
  signal?: AbortSignal
}

export type LogoutPayload = {
  csrfToken: string
  signal?: AbortSignal
}

export type LoginResult = {
  handle: string
}

export type AuthBootstrap = {
  availableUsers: PublicUser[]
  backend: BackendInfo
  csrfToken: string
  currentUser: CurrentUser | null
  discreetLogin: boolean
}

type UserListResult = {
  discreetLogin: boolean
  users: PublicUser[]
}

export async function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUser | null> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void signal
  const auth = await tauriInvoke<AuthBootstrap>('tauri_auth_bootstrap')
  return auth.currentUser
}

export async function fetchUserList(
  csrfToken: string,
  signal?: AbortSignal,
): Promise<UserListResult> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  const auth = await tauriInvoke<AuthBootstrap>('tauri_auth_bootstrap')
  return {
    discreetLogin: auth.discreetLogin,
    users: auth.availableUsers,
  }
}

export async function login({
  csrfToken,
  handle,
  password,
  signal,
}: LoginPayload): Promise<LoginResult> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void password
  void signal
  return tauriInvoke<LoginResult>('tauri_login', { handle })
}

export async function logout({ csrfToken, signal }: LogoutPayload): Promise<void> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void csrfToken
  void signal
  await tauriInvoke('tauri_logout')
}

export async function fetchAuthBootstrap(signal?: AbortSignal): Promise<AuthBootstrap> {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }

  void signal
  return tauriInvoke<AuthBootstrap>('tauri_auth_bootstrap')
}
