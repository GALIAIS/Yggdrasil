import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppUpdateHandle,
  checkForAppUpdate,
  getAppVersion,
  isTauriDesktop,
  type AppUpdateDownloadEvent,
} from '@yggdrasil/api-client'
import { toast } from 'sonner'

export type AppUpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'latest'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface AppUpdaterState {
  body?: string
  currentVersion: string
  downloadedBytes: number
  error: string | null
  hasChecked: boolean
  phase: AppUpdaterPhase
  publishedAt?: string
  totalBytes: number
  version: string
}

const startupNotifiedVersions = new Set<string>()

function createInitialState(): AppUpdaterState {
  return {
    currentVersion: '',
    downloadedBytes: 0,
    error: null,
    hasChecked: false,
    phase: 'idle',
    totalBytes: 0,
    version: '',
  }
}

export function useAppUpdater() {
  const [state, setState] = useState<AppUpdaterState>(createInitialState)
  const updateRef = useRef<AppUpdateHandle | null>(null)

  useEffect(() => {
    if (!isTauriDesktop()) {
      return
    }
    void getAppVersion()
      .then((version) => {
        setState((current) => ({ ...current, currentVersion: version }))
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => () => {
    const handle = updateRef.current
    updateRef.current = null
    if (handle) {
      void handle.close().catch(() => undefined)
    }
  }, [])

  const applyDownloadEvent = useCallback((event: AppUpdateDownloadEvent) => {
    setState((current) => {
      switch (event.event) {
        case 'Started':
          return {
            ...current,
            downloadedBytes: 0,
            phase: 'downloading',
            totalBytes: Math.max(0, Number(event.data.contentLength ?? 0)),
          }
        case 'Progress':
          return {
            ...current,
            downloadedBytes: current.downloadedBytes + Math.max(0, event.data.chunkLength),
            phase: 'downloading',
          }
        case 'Finished':
          return {
            ...current,
            downloadedBytes: current.totalBytes > 0 ? current.totalBytes : current.downloadedBytes,
            phase: 'downloaded',
          }
      }
    })
  }, [])

  const checkNow = useCallback(async (notifyWhenAvailable = false) => {
    setState((current) => ({ ...current, error: null, phase: 'checking' }))

    const previous = updateRef.current
    updateRef.current = null
    if (previous) {
      await previous.close().catch(() => undefined)
    }

    try {
      const nextUpdate = await checkForAppUpdate()
      if (!nextUpdate) {
        const currentVersion = state.currentVersion || await getAppVersion().catch(() => '')
        setState({
          body: undefined,
          currentVersion,
          downloadedBytes: 0,
          error: null,
          hasChecked: true,
          phase: 'latest',
          publishedAt: undefined,
          totalBytes: 0,
          version: currentVersion,
        })
        return null
      }

      updateRef.current = nextUpdate
      setState({
        body: nextUpdate.body,
        currentVersion: nextUpdate.currentVersion,
        downloadedBytes: 0,
        error: null,
        hasChecked: true,
        phase: 'available',
        publishedAt: nextUpdate.date,
        totalBytes: 0,
        version: nextUpdate.version,
      })

      if (notifyWhenAvailable && !startupNotifiedVersions.has(nextUpdate.version)) {
        startupNotifiedVersions.add(nextUpdate.version)
        toast.info(`发现新版本 ${nextUpdate.version}`)
      }

      return nextUpdate
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check for updates.'
      setState((current) => ({
        ...current,
        error: message,
        hasChecked: true,
        phase: 'error',
      }))
      throw error
    }
  }, [state.currentVersion])

  const download = useCallback(async () => {
    const handle = updateRef.current
    if (!handle) {
      throw new Error('No update is available to download.')
    }

    setState((current) => ({
      ...current,
      downloadedBytes: 0,
      error: null,
      phase: 'downloading',
      totalBytes: 0,
    }))

    try {
      await handle.download(applyDownloadEvent)
      setState((current) => ({ ...current, phase: 'downloaded' }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download the update.'
      setState((current) => ({ ...current, error: message, phase: 'error' }))
      throw error
    }
  }, [applyDownloadEvent])

  const install = useCallback(async () => {
    const handle = updateRef.current
    if (!handle) {
      throw new Error('No downloaded update is available to install.')
    }

    setState((current) => ({ ...current, error: null, phase: 'installing' }))

    try {
      await handle.install()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install the update.'
      setState((current) => ({ ...current, error: message, phase: 'error' }))
      throw error
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    const handle = updateRef.current
    if (!handle) {
      throw new Error('No update is available to install.')
    }

    setState((current) => ({
      ...current,
      downloadedBytes: 0,
      error: null,
      phase: 'downloading',
      totalBytes: 0,
    }))

    try {
      await handle.downloadAndInstall(applyDownloadEvent)
      setState((current) => ({ ...current, phase: 'installing' }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download and install the update.'
      setState((current) => ({ ...current, error: message, phase: 'error' }))
      throw error
    }
  }, [applyDownloadEvent])

  return {
    state,
    checkNow,
    download,
    downloadAndInstall,
    install,
  }
}
