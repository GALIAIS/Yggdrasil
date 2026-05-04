import { useEffect, useMemo } from 'react'
import type { AuthBootstrap, SettingsPayload, WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { YggdrasilLogo } from '@/components/icons/yggdrasil-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { openExternalUrl } from '@/lib/open-external'
import { useI18n } from '@/lib/i18n'

import { useAppUpdater } from './useAppUpdater'

export interface SystemPanelProps {
  auth: AuthBootstrap | null
  settings: SettingsPayload | null
  catalog?: WorkspaceCatalogPayload | null
  charactersCount: number
  chatsCount: number
  messagesCount: number
  selectedCharacterAvatar?: string
  selectedChatId?: string
  workspaceError: string | null
}

export function SystemPanel({
  auth,
  settings,
  catalog,
  charactersCount,
  chatsCount,
  messagesCount,
  selectedCharacterAvatar,
  selectedChatId,
  workspaceError,
}: SystemPanelProps) {
  const { t } = useI18n()
  const { state: updaterState, checkNow, download, downloadAndInstall, install } = useAppUpdater()

  useEffect(() => {
    if (!updaterState.hasChecked) {
      void checkNow(false).catch(() => undefined)
    }
  }, [checkNow, updaterState.hasChecked])

  const backendMetrics = useMemo(() => [
    { label: t('auth.metrics.server'), value: auth?.backend.serverVersion ?? t('common.unavailable') },
    { label: t('auth.metrics.package'), value: updaterState.currentVersion || auth?.backend.pkgVersion || t('common.unavailable') },
    { label: t('auth.metrics.node'), value: auth?.backend.nodeVersion ?? t('common.unavailable') },
  ], [
    auth?.backend.nodeVersion,
    auth?.backend.pkgVersion,
    auth?.backend.serverVersion,
    t,
    updaterState.currentVersion,
  ])

  const runtimeMetrics = [
    { label: t('systemWorkspace.charactersCount'), value: String(charactersCount) },
    { label: t('systemWorkspace.chatsCount'), value: String(chatsCount) },
    { label: t('systemWorkspace.messagesCount'), value: String(messagesCount) },
    { label: t('systemWorkspace.themeCount'), value: String(catalog?.counts.themes ?? settings?.themes?.length ?? 0) },
  ]

  const liveStatusMetrics = [
    { label: t('systemPanel.liveStatus.bootstrap'), value: auth?.currentUser ? t('common.connected') : t('common.unavailable') },
    { label: t('systemPanel.liveStatus.settings'), value: settings?.settings ? t('common.ready') : t('common.unavailable') },
    { label: t('systemPanel.liveStatus.currentApi'), value: settings?.settings?.main_api || t('common.unconfigured') },
    { label: t('systemPanel.liveStatus.errorState'), value: workspaceError ?? t('shell.systemHealthy') },
  ]

  const progressPercent = updaterState.totalBytes > 0
    ? Math.min(100, Math.round((updaterState.downloadedBytes / updaterState.totalBytes) * 100))
    : 0

  const updateStatusLabel = (() => {
    switch (updaterState.phase) {
      case 'checking':
        return t('systemPanel.updater.checking')
      case 'available':
        return t('systemPanel.updater.available', { version: updaterState.version })
      case 'downloading':
        return t('systemPanel.updater.downloading', { percent: progressPercent })
      case 'downloaded':
        return t('systemPanel.updater.downloaded')
      case 'installing':
        return t('systemPanel.updater.installing')
      case 'latest':
        return t('systemPanel.updater.latest')
      case 'error':
        return updaterState.error || t('systemPanel.updater.error')
      default:
        return t('systemPanel.updater.idle')
    }
  })()

  const actionBusy = updaterState.phase === 'checking' || updaterState.phase === 'downloading' || updaterState.phase === 'installing'

  return (
    <ScrollArea className="h-full rounded-sm">
      <div className="grid gap-4 pr-3 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="grid gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
          <Card className="py-5 shadow-none">
            <CardHeader className="gap-4">
              <div className="flex flex-col items-center gap-4 text-center">
                <YggdrasilLogo className="size-20" />
                <div className="space-y-2">
                  <CardTitle>{t('systemPanel.workspaceTitle')}</CardTitle>
                  <CardDescription>{t('systemPanel.workspaceDescription')}</CardDescription>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Badge variant="outline">{t('systemPanel.runtimeBadge', { count: backendMetrics.length })}</Badge>
                  <Badge variant="outline">{updaterState.currentVersion || auth?.backend.pkgVersion || t('common.unavailable')}</Badge>
                  {updaterState.version && updaterState.version !== updaterState.currentVersion ? (
                    <Badge>{t('systemPanel.updateBadge', { version: updaterState.version })}</Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" onClick={() => void checkNow(true)} disabled={actionBusy}>
                    {t('systemPanel.actions.check')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void (updaterState.phase === 'downloaded' ? install() : downloadAndInstall())}
                    disabled={!['available', 'downloaded'].includes(updaterState.phase)}
                  >
                    {updaterState.phase === 'downloaded' ? t('systemPanel.actions.install') : t('systemPanel.actions.downloadAndInstall')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void download()} disabled={updaterState.phase !== 'available'}>
                    {t('systemPanel.actions.download')}
                  </Button>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" onClick={() => openExternalUrl('https://github.com/GALIAIS/Yggdrasil')}>
                    {t('systemPanel.actions.repository')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => openExternalUrl('https://github.com/GALIAIS/Yggdrasil/releases')}>
                    {t('systemPanel.actions.releases')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => openExternalUrl('https://github.com/GALIAIS/Yggdrasil/issues')}>
                    {t('systemPanel.actions.issues')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {backendMetrics.map((item) => (
                <Card className="py-4 shadow-none" key={item.label}>
                  <CardHeader className="gap-1">
                    <CardDescription>{item.label}</CardDescription>
                    <CardTitle className="text-sm font-medium">{item.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col py-5 shadow-none">
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{t('systemPanel.updaterTitle')}</CardTitle>
                <Badge variant="outline">{updateStatusLabel}</Badge>
              </div>
              <CardDescription>
                {t('systemPanel.updaterDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6">
              <div className="grid gap-4">
                <div className="yggdrasil-info-stack">
                  <MetricRow
                    label={t('systemPanel.fields.currentVersion')}
                    value={updaterState.currentVersion || auth?.backend.pkgVersion || t('common.unavailable')}
                  />
                  <MetricRow
                    label={t('systemPanel.fields.latestVersion')}
                    value={updaterState.version || t('common.unavailable')}
                  />
                  <MetricRow
                    label={t('systemPanel.fields.publishedAt')}
                    value={updaterState.publishedAt || t('common.unavailable')}
                  />
                </div>

                {updaterState.totalBytes > 0 ? (
                  <div className="yggdrasil-info-section">
                    <div className="h-2 w-full overflow-hidden border border-border/70 bg-black/30">
                      <div className="h-full bg-[var(--accent-foreground)]/80" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <p className="yggdrasil-support-text mt-2">
                      {t('systemPanel.updater.progressDetail', {
                        downloaded: String(updaterState.downloadedBytes),
                        total: String(updaterState.totalBytes),
                      })}
                    </p>
                  </div>
                ) : null}

                {updaterState.body ? (
                  <div className="yggdrasil-info-section yggdrasil-support-text whitespace-pre-wrap">
                    {updaterState.body}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  {runtimeMetrics.map((metric) => (
                    <Card className="py-4 shadow-none" key={metric.label}>
                      <CardHeader className="gap-1">
                        <CardDescription>{metric.label}</CardDescription>
                        <CardTitle className="text-sm font-medium">{metric.value}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-rows-[auto_auto_1fr]">
          <Card className="py-5 shadow-none">
            <CardHeader>
              <CardTitle>{t('systemPanel.accountTitle')}</CardTitle>
              <CardDescription>{t('systemPanel.accountDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge>{t('systemWorkspace.workspaceMode')}</Badge>
                {auth?.currentUser?.admin ? <Badge variant="outline">{t('systemPanel.admin')}</Badge> : null}
                <Badge variant="secondary">
                  {auth?.currentUser?.password ? t('systemPanel.passwordProtected') : t('systemPanel.passwordless')}
                </Badge>
                <Badge variant="outline">
                  {auth?.currentUser ? t('auth.workspaceConnected') : t('auth.workspaceUnavailable')}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col py-5 shadow-none">
            <CardHeader className="gap-3">
              <CardTitle>{t('systemPanel.liveStatusTitle')}</CardTitle>
              <CardDescription>{t('systemPanel.liveStatusDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{auth?.currentUser ? t('common.connected') : t('common.unavailable')}</Badge>
                <Badge variant="outline">{settings?.settings ? t('common.ready') : t('common.unavailable')}</Badge>
                <Badge variant="outline">{settings?.settings?.main_api || t('common.unconfigured')}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {liveStatusMetrics.map((item) => (
                  <Card className="py-4 shadow-none" key={item.label}>
                    <CardHeader className="gap-1">
                      <CardDescription>{item.label}</CardDescription>
                      <CardTitle className="text-sm font-medium">{item.value}</CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col py-5 shadow-none">
            <CardHeader className="gap-3">
              <CardTitle>{t('systemPanel.repositoryTitle')}</CardTitle>
              <CardDescription>
                {t('systemPanel.repositoryDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6">
              <div className="yggdrasil-info-stack">
                <MetricRow label={t('systemPanel.fields.repository')} value="https://github.com/GALIAIS/Yggdrasil" align="left" />
                <MetricRow label={t('systemPanel.fields.selectedCharacter')} value={selectedCharacterAvatar || t('common.unconfigured')} align="left" />
                <MetricRow label={t('systemPanel.fields.selectedSession')} value={selectedChatId || t('common.unconfigured')} align="left" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  )
}

interface MetricRowProps {
  align?: 'left' | 'right'
  label: string
  value: string
}

function MetricRow({ label, value, align = 'right' }: MetricRowProps) {
  return (
    <div className="yggdrasil-info-row">
      <span className="yggdrasil-info-label">{label}</span>
      <span className={`yggdrasil-info-value ${align === 'left' ? 'is-left' : ''}`}>{value}</span>
    </div>
  )
}
