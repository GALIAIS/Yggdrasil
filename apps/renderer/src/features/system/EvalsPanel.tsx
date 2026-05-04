import { BarChart3Icon, BrainCircuitIcon, PlayIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useEvalRunsQuery, useRunLocalEvalMutation } from '@/features/workspace/hooks'
import { formatDateTime } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'
import { toast } from 'sonner'

export interface EvalsPanelProps {
  selectedCharacterAvatar?: string
  selectedChatId?: string
}

export function EvalsPanel({ selectedCharacterAvatar, selectedChatId }: EvalsPanelProps) {
  const { t } = useI18n()
  const evalRunsQuery = useEvalRunsQuery(selectedCharacterAvatar, selectedChatId, true)
  const runEvalMutation = useRunLocalEvalMutation()
  const evalRuns = evalRunsQuery.data ?? []
  const latestRun = evalRuns[0] ?? null

  return (
    <Card className="flex min-h-0 flex-col py-5 shadow-none">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{t('evalsPanel.title')}</CardTitle>
            <CardDescription>{t('evalsPanel.description')}</CardDescription>
          </div>
          <Button
            className="gap-2 rounded-sm"
            disabled={!selectedCharacterAvatar || !selectedChatId || runEvalMutation.isPending}
            onClick={() => {
              void runEvalMutation
                .mutateAsync({
                  avatarUrl: selectedCharacterAvatar,
                  csrfToken: 'tauri-local',
                  fileName: selectedChatId,
                })
                .then(() => {
                  toast.success(t('evalsPanel.feedback.ran'))
                })
                .catch((error) => {
                  toast.error(error instanceof Error ? error.message : t('evalsPanel.feedback.runFailed'))
                })
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlayIcon className="size-4" />
            <span>{runEvalMutation.isPending ? t('common.loading') : t('evalsPanel.runAction')}</span>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="rounded-sm" variant="outline">
            {selectedChatId ? t('evalsPanel.boundSession', { name: selectedChatId }) : t('evalsPanel.noSession')}
          </Badge>
          {latestRun ? (
            <Badge className="rounded-sm" variant="outline">
              {t('evalsPanel.lastRun', { time: formatDateTime(latestRun.createdAt) })}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BarChart3Icon} label={t('evalsPanel.metrics.overall')} value={formatScore(latestRun?.overallScore)} />
          <MetricCard icon={BrainCircuitIcon} label={t('evalsPanel.metrics.memory')} value={formatScore(latestRun?.memoryHitRate)} />
          <MetricCard icon={BarChart3Icon} label={t('evalsPanel.metrics.consistency')} value={formatScore(latestRun?.settingConsistency)} />
          <MetricCard icon={BarChart3Icon} label={t('evalsPanel.metrics.continuity')} value={formatScore(latestRun?.replyContinuity)} />
        </div>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <Card className="flex min-h-0 flex-col py-4 shadow-none">
            <CardHeader className="gap-1 px-4 pb-3">
              <CardTitle className="text-sm font-medium">{t('evalsPanel.latestBreakdown')}</CardTitle>
              <CardDescription>{t('evalsPanel.latestBreakdownDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-4">
              <BreakdownRow label={t('evalsPanel.metrics.consistency')} value={latestRun?.settingConsistency} />
              <BreakdownRow label={t('evalsPanel.metrics.memory')} value={latestRun?.memoryHitRate} />
              <BreakdownRow label={t('evalsPanel.metrics.state')} value={latestRun?.stateUpdateCorrectness} />
              <BreakdownRow label={t('evalsPanel.metrics.continuity')} value={latestRun?.replyContinuity} />
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col py-4 shadow-none">
            <CardHeader className="gap-1 px-4 pb-3">
              <CardTitle className="text-sm font-medium">{t('evalsPanel.notesTitle')}</CardTitle>
              <CardDescription>{t('evalsPanel.notesDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 px-4">
              <ScrollArea className="h-52">
                <div className="space-y-2 pr-3">
                  {latestRun?.notes?.length ? latestRun.notes.map((note, index) => (
                    <div className="rounded-sm border px-3 py-2 text-sm leading-6" key={`${index}-${note.slice(0, 24)}`}>
                      {note}
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">{t('evalsPanel.empty')}</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3Icon
  label: string
  value: string
}) {
  return (
    <div className="rounded-sm border px-3 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}

function BreakdownRow({ label, value }: { label: string; value?: number }) {
  const width = Math.max(4, Math.min(100, Math.round(value ?? 0)))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <strong>{formatScore(value)}</strong>
      </div>
      <div className="h-2 rounded-none bg-[rgba(255,255,255,0.08)]">
        <div
          className="h-full rounded-none bg-[rgba(212,180,131,0.78)]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function formatScore(value?: number) {
  return typeof value === 'number' ? `${Math.round(value)}` : '--'
}
