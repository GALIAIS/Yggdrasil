import { ShieldCheckIcon, SquareTerminalIcon, WaypointsIcon } from 'lucide-react'
import type { AuthBootstrap, SettingsPayload, WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'

import { SystemPanel } from './SystemPanel'

export interface SystemWorkspaceProps {
  slot: 'resource' | 'main' | 'inspector'
  auth: AuthBootstrap | null
  settings: SettingsPayload | null
  catalog?: WorkspaceCatalogPayload | null
  currentUserLabel: string
  charactersCount: number
  chatsCount: number
  messagesCount: number
  selectedCharacterAvatar?: string
  selectedChatId?: string
  workspaceError: string | null
}

export function SystemWorkspace({
  slot,
  auth,
  settings,
  catalog,
  currentUserLabel,
  charactersCount,
  chatsCount,
  messagesCount,
  selectedCharacterAvatar,
  selectedChatId,
  workspaceError,
}: SystemWorkspaceProps) {
  const { t } = useI18n()
  if (slot === 'main') {
    return (
      <div className="h-full min-h-0">
        <SystemPanel
          auth={auth}
          catalog={catalog}
          settings={settings}
          charactersCount={charactersCount}
          chatsCount={chatsCount}
          messagesCount={messagesCount}
          selectedCharacterAvatar={selectedCharacterAvatar}
          selectedChatId={selectedChatId}
          workspaceError={workspaceError}
        />
      </div>
    )
  }

  const backendVersion = auth?.backend.serverVersion ?? t('common.unavailable')
  const packageVersion = auth?.backend.pkgVersion ?? t('common.unavailable')
  const workspaceMode = t('systemWorkspace.workspaceMode')
  const bootstrapState = auth?.currentUser ? t('common.connected') : t('common.unavailable')
  const themesCount = String(catalog?.counts.themes ?? settings?.themes?.length ?? 0)

  if (slot === 'resource') {
    return (
      <div className="grid h-full gap-3 p-3 md:p-4 xl:grid-rows-[auto_minmax(0,1fr)]">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="px-4 py-4">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="text-muted-foreground" />
              <div>
                <CardTitle className="text-sm font-semibold">{t('systemWorkspace.resource.directoryTitle')}</CardTitle>
                <CardDescription className="mt-1 leading-5">{t('systemWorkspace.resource.directoryDescription')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-4 pb-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-sm" variant="outline">{backendVersion}</Badge>
              <Badge className="rounded-sm" variant="outline">{packageVersion}</Badge>
              <Badge className="rounded-sm" variant="outline">{workspaceMode}</Badge>
            </div>
            <div className="grid gap-2">
              <MetricCard label={t('settingsWorkspace.currentUser')} value={currentUserLabel} />
              <MetricCard label={t('systemWorkspace.bootstrap')} value={bootstrapState} />
              <MetricCard label={t('systemWorkspace.themeCount')} value={themesCount} />
              <MetricCard label={t('systemWorkspace.errorState')} value={workspaceError ?? t('system.healthy')} />
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="px-4 py-4">
            <div className="flex items-center gap-2">
              <WaypointsIcon className="text-muted-foreground" />
              <div>
                <CardTitle className="text-sm font-semibold">{t('systemWorkspace.resource.runtimeTitle')}</CardTitle>
                <CardDescription className="mt-1 leading-5">{t('systemWorkspace.resource.runtimeDescription')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 pb-4 text-sm">
            <MetricCard label={t('systemWorkspace.charactersCount')} value={String(charactersCount)} />
            <MetricCard label={t('systemWorkspace.chatsCount')} value={String(chatsCount)} />
            <MetricCard label={t('systemWorkspace.messagesCount')} value={String(messagesCount)} />
            <MetricCard label={t('systemWorkspace.workspaceModeLabel')} value={workspaceMode} />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid h-full gap-3 p-3 md:p-4 xl:grid-rows-[auto_auto_1fr]">
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-4">
          <CardTitle className="text-sm font-semibold">{t('systemWorkspace.inspector.overviewTitle')}</CardTitle>
          <CardDescription className="leading-5">{t('systemWorkspace.inspector.overviewDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 pb-4 text-sm">
          <MetricCard label={t('auth.metrics.server')} value={backendVersion} />
          <MetricCard label={t('auth.metrics.package')} value={packageVersion} />
          <MetricCard label={t('settingsWorkspace.currentUser')} value={currentUserLabel} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-4">
          <CardTitle className="text-sm font-semibold">{t('systemWorkspace.inspector.statusTitle')}</CardTitle>
          <CardDescription className="leading-5">{t('systemWorkspace.inspector.statusDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 pb-4 text-sm">
          <MetricCard label={t('systemWorkspace.workspaceModeLabel')} value={workspaceMode} />
          <MetricCard label={t('systemWorkspace.bootstrap')} value={bootstrapState} />
          <MetricCard label={t('systemWorkspace.error')} value={workspaceError ?? t('system.healthy')} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-4">
          <div className="flex items-center gap-2">
            <SquareTerminalIcon className="text-muted-foreground" />
            <div>
              <CardTitle className="text-sm font-semibold">{t('systemWorkspace.inspector.statsTitle')}</CardTitle>
              <CardDescription className="leading-5">{t('systemWorkspace.inspector.statsDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 pb-4 text-sm">
          <MetricCard label={t('systemWorkspace.charactersCount')} value={String(charactersCount)} />
          <MetricCard label={t('systemWorkspace.chatsCount')} value={String(chatsCount)} />
          <MetricCard label={t('systemWorkspace.messagesCount')} value={String(messagesCount)} />
          <MetricCard label={t('systemWorkspace.themeCount')} value={themesCount} />
        </CardContent>
      </Card>
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="yggdrasil-panel-muted px-3 py-2">
      <p className="yggdrasil-metric-card-label">{label}</p>
      <p className="yggdrasil-metric-card-value mt-1">{value}</p>
    </div>
  )
}
