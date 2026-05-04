import { BookMarkedIcon, ScrollTextIcon, SlidersHorizontalIcon } from 'lucide-react'
import type { SettingsPayload, WorkspaceCatalogPayload } from '@yggdrasil/api-client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { buildPresetInventory, buildSettingsSummary } from '@/lib/settings'
import { useI18n } from '@/lib/i18n'

import { SettingsPanel } from './SettingsPanel'
import type { SettingsPanelAction } from '@/features/workspace/useWorkbenchState'

export interface SettingsWorkspaceProps {
  slot: 'resource' | 'main' | 'inspector'
  settings: SettingsPayload | null
  catalog?: WorkspaceCatalogPayload | null
  currentUserLabel: string
  charactersCount: number
  chatsCount: number
  activeTab?: 'overview' | 'engines' | 'inventory' | 'context' | 'rendering'
  onActiveTabChange?: (tab: 'overview' | 'engines' | 'inventory' | 'context' | 'rendering') => void
  actionRequest?: SettingsPanelAction
  onActionHandled?: () => void
  onOpenProviders?: () => void
}

export function SettingsWorkspace({
  slot,
  settings,
  catalog,
  currentUserLabel,
  charactersCount,
  chatsCount,
  activeTab,
  onActiveTabChange,
  actionRequest,
  onActionHandled,
  onOpenProviders,
}: SettingsWorkspaceProps) {
  const { t } = useI18n()
  if (slot === 'main') {
    return (
      <div className="h-full min-h-0">
        <SettingsPanel
          catalog={catalog}
          key={settings?.rawSettings ?? 'settings-empty'}
          activeTab={activeTab}
          onActiveTabChange={onActiveTabChange}
          actionRequest={actionRequest}
          onActionHandled={onActionHandled}
          settings={settings}
        />
      </div>
    )
  }

  const settingsSummary = buildSettingsSummary(settings, t)
  const presetInventory = buildPresetInventory(settings, t, catalog)
  const primarySummary = settingsSummary.filter((item) =>
    item.id === 'username' ||
    item.id === 'mainApi' ||
    item.id === 'maxContext' ||
    item.id === 'amountGen',
  )
  const accountModeSummary = settingsSummary.find((item) => item.id === 'accountMode')
  const extensionSummary = settingsSummary.find((item) => item.id === 'extensions')

  if (slot === 'resource') {
    return (
      <div className="grid h-full gap-3 p-3 md:p-4 xl:grid-rows-[auto_minmax(0,1fr)]">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="px-4 py-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontalIcon className="text-muted-foreground" />
              <div>
                <CardTitle className="text-sm font-semibold">{t('settingsWorkspace.resource.directoryTitle')}</CardTitle>
                <CardDescription className="mt-1 leading-5">
                  {t('settingsWorkspace.resource.directoryDescription')}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-4 pb-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-sm" variant="outline">{currentUserLabel}</Badge>
              <Badge className="rounded-sm" variant="outline">{t('settingsWorkspace.badges.characters', { count: charactersCount })}</Badge>
              <Badge className="rounded-sm" variant="outline">{t('settingsWorkspace.badges.chats', { count: chatsCount })}</Badge>
            </div>
            {onOpenProviders ? (
              <Button className="w-fit rounded-sm" type="button" variant="outline" onClick={onOpenProviders}>
                {t('providersPanel.actions.open')}
              </Button>
            ) : null}
            <div className="grid gap-2">
              {primarySummary.map((item) => (
                <div className="yggdrasil-panel-muted px-3 py-2" key={item.label}>
                  <p className="yggdrasil-metric-card-label">{item.label}</p>
                  <p className="yggdrasil-metric-card-value mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="px-4 py-4">
            <div className="flex items-center gap-2">
              <BookMarkedIcon className="text-muted-foreground" />
              <div>
                <CardTitle className="text-sm font-semibold">{t('settingsWorkspace.resource.presetIndexTitle')}</CardTitle>
                <CardDescription className="mt-1 leading-5">
                  {t('settingsWorkspace.resource.presetIndexDescription')}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-4 pb-4 text-sm">
            <div className="grid gap-2">
              {presetInventory.slice(0, 6).map((item) => (
                <div className="yggdrasil-panel-muted px-3 py-2" key={item.label}>
                  <p className="yggdrasil-metric-card-label">{item.label}</p>
                  <p className="yggdrasil-metric-card-value mt-1">{item.value}</p>
                </div>
              ))}
            </div>
            <Separator />
            <div className="yggdrasil-panel-muted px-3 py-2">
              <p className="yggdrasil-metric-card-label">{t('settingsWorkspace.resource.summary')}</p>
              <p className="yggdrasil-metric-card-value mt-1">{t('settingsWorkspace.resource.summaryValue', { count: settingsSummary.length })}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid h-full gap-3 p-3 md:p-4 xl:grid-rows-[auto_auto_1fr]">
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-4">
          <CardTitle className="text-sm font-semibold">{t('settingsWorkspace.inspector.overviewTitle')}</CardTitle>
          <CardDescription className="leading-5">{t('settingsWorkspace.inspector.overviewDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 pb-4 text-sm">
          <InspectorRow label={t('settingsWorkspace.currentUser')} value={currentUserLabel} />
          <InspectorRow label={t('settingsWorkspace.accountMode')} value={accountModeSummary?.value ?? t('common.unconfigured')} />
          <InspectorRow label={t('settingsWorkspace.extensionStatus')} value={extensionSummary?.value ?? t('common.unconfigured')} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-4">
          <CardTitle className="text-sm font-semibold">{t('settingsWorkspace.inspector.inventoryTitle')}</CardTitle>
          <CardDescription className="leading-5">{t('settingsWorkspace.inspector.inventoryDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 pb-4 text-sm">
          {presetInventory.slice(0, 4).map((item) => (
            <InspectorRow key={item.label} label={item.label} value={item.value} />
          ))}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-4">
          <div className="flex items-center gap-2">
            <ScrollTextIcon className="text-muted-foreground" />
            <div>
              <CardTitle className="text-sm font-semibold">{t('settingsWorkspace.inspector.statusTitle')}</CardTitle>
              <CardDescription className="leading-5">{t('settingsWorkspace.inspector.statusDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4 pb-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-sm" variant="outline">{t('settingsWorkspace.badges.summary', { count: settingsSummary.length })}</Badge>
            <Badge className="rounded-sm" variant="outline">{t('settingsWorkspace.badges.presets', { count: presetInventory.length })}</Badge>
          </div>
          <InspectorRow label={t('settingsWorkspace.workspaceSummary')} value={t('settingsWorkspace.countItems', { count: settingsSummary.length })} />
          <InspectorRow label={t('settingsWorkspace.presetIndex')} value={t('settingsWorkspace.countGroups', { count: presetInventory.length })} />
        </CardContent>
      </Card>
    </div>
  )
}

interface InspectorRowProps {
  label: string
  value: string
}

function InspectorRow({ label, value }: InspectorRowProps) {
  return (
    <div className="yggdrasil-panel-muted px-3 py-2">
      <p className="yggdrasil-metric-card-label">{label}</p>
      <p className="yggdrasil-metric-card-value mt-1">{value}</p>
    </div>
  )
}
