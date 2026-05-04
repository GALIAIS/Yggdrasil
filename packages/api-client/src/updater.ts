import { isTauriDesktop } from './tauri.ts'

export interface AppUpdateMetadata {
  body?: string
  currentVersion: string
  date?: string
  rawJson: Record<string, unknown>
  rid: number
  version: string
}

export type AppUpdateDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

async function ensureDesktop() {
  if (!isTauriDesktop()) {
    throw new Error('This renderer only supports the Tauri runtime.')
  }
}

async function loadCoreApi() {
  return import('@tauri-apps/api/core')
}

export class AppUpdateHandle {
  body?: string
  currentVersion: string
  date?: string
  rawJson: Record<string, unknown>
  version: string

  private readonly rid: number
  private downloadedBytesRid: number | null = null

  constructor(metadata: AppUpdateMetadata) {
    this.rid = metadata.rid
    this.currentVersion = metadata.currentVersion
    this.version = metadata.version
    this.date = metadata.date
    this.body = metadata.body
    this.rawJson = metadata.rawJson
  }

  async download(onEvent?: (event: AppUpdateDownloadEvent) => void): Promise<void> {
    await ensureDesktop()
    const { Channel, invoke } = await loadCoreApi()
    const channel = new Channel<AppUpdateDownloadEvent>()
    if (onEvent) {
      channel.onmessage = onEvent
    }
    this.downloadedBytesRid = await invoke<number>('plugin:updater|download', {
      onEvent: channel,
      rid: this.rid,
    })
  }

  async install(): Promise<void> {
    await ensureDesktop()
    if (this.downloadedBytesRid == null) {
      throw new Error('Update.install called before Update.download')
    }
    const { invoke } = await loadCoreApi()
    await invoke('plugin:updater|install', {
      bytesRid: this.downloadedBytesRid,
      updateRid: this.rid,
    })
    this.downloadedBytesRid = null
  }

  async downloadAndInstall(onEvent?: (event: AppUpdateDownloadEvent) => void): Promise<void> {
    await ensureDesktop()
    const { Channel, invoke } = await loadCoreApi()
    const channel = new Channel<AppUpdateDownloadEvent>()
    if (onEvent) {
      channel.onmessage = onEvent
    }
    await invoke('plugin:updater|download_and_install', {
      onEvent: channel,
      rid: this.rid,
    })
  }

  async close(): Promise<void> {
    await ensureDesktop()
    const { Resource } = await loadCoreApi()
    if (this.downloadedBytesRid != null) {
      await new Resource(this.downloadedBytesRid).close()
      this.downloadedBytesRid = null
    }
    await new Resource(this.rid).close()
  }
}

export async function getAppVersion(): Promise<string> {
  await ensureDesktop()
  const { getVersion } = await import('@tauri-apps/api/app')
  return getVersion()
}

export async function checkForAppUpdate(): Promise<AppUpdateHandle | null> {
  await ensureDesktop()
  const { invoke } = await loadCoreApi()
  const metadata = await invoke<AppUpdateMetadata | null>('plugin:updater|check')
  return metadata ? new AppUpdateHandle(metadata) : null
}
