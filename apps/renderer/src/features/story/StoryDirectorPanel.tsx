import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import type { StructuredInsightKind } from '@/features/workspace/useWorkbenchState'

type StructuredInsightResult = {
  generatedAt: number
  kind: StructuredInsightKind
  payload: Record<string, unknown>
}

export interface StoryDirectorPanelProps {
  insight: StructuredInsightResult | null
  isApplying: boolean
  autoApplyWorldState: boolean
  pendingKind: StructuredInsightKind | null
  onApply: () => void
  onAutoApplyWorldStateChange: (enabled: boolean) => void
  onClear: () => void
  onGenerate: (kind: StructuredInsightKind) => void
}

export function StoryDirectorPanel({
  insight,
  isApplying,
  autoApplyWorldState,
  pendingKind,
  onApply,
  onAutoApplyWorldStateChange,
  onClear,
  onGenerate,
}: StoryDirectorPanelProps) {
  const { t } = useI18n()

  const actions: Array<{ kind: StructuredInsightKind; label: string }> = [
    { kind: 'story_suggestion', label: t('inspector.director.actions.storySuggestion') },
    { kind: 'relationship_delta', label: t('inspector.director.actions.relationshipDelta') },
    { kind: 'world_state_update', label: t('inspector.director.actions.worldStateUpdate') },
  ]

  return (
    <div className="ref-inspector-body-block">
      <div className="ref-trace-actions">
        {actions.map((action) => (
          <Button
            className="ref-inspector-cta"
            key={action.kind}
            onClick={() => onGenerate(action.kind)}
            size="sm"
            type="button"
            variant={pendingKind === action.kind ? 'default' : 'ghost'}
          >
            {pendingKind === action.kind ? t('common.loading') : action.label}
          </Button>
        ))}
        <Button
          className="ref-inspector-cta"
          onClick={() => onAutoApplyWorldStateChange(!autoApplyWorldState)}
          size="sm"
          type="button"
          variant={autoApplyWorldState ? 'default' : 'ghost'}
        >
          {autoApplyWorldState
            ? t('inspector.director.autoApplyOn')
            : t('inspector.director.autoApplyOff')}
        </Button>
      </div>

      {insight ? (
        <div className="ref-context-injected">
          <div className="ref-inspector-row">
            <span>{resolveStructuredInsightTitle(t, insight.kind)}</span>
            <strong>{new Date(insight.generatedAt).toLocaleTimeString()}</strong>
          </div>
          <div className="ref-inspector-actions">
            {insight.kind === 'world_state_update' ? (
              <Button
                className="ref-inspector-cta"
                onClick={onApply}
                size="sm"
                type="button"
                variant={isApplying ? 'default' : 'ghost'}
              >
                {isApplying ? t('common.loading') : t('inspector.director.apply')}
              </Button>
            ) : null}
            <Button
              className="ref-inspector-cta"
              onClick={onClear}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t('inspector.director.discard')}
            </Button>
          </div>
          {renderStructuredInsight(t, insight.kind, insight.payload)}
        </div>
      ) : (
        <div className="ref-inspector-row">
          <span>{t('inspector.director.empty')}</span>
          <strong>0</strong>
        </div>
      )}
    </div>
  )
}

function resolveStructuredInsightTitle(
  t: ReturnType<typeof useI18n>['t'],
  kind: StructuredInsightKind,
) {
  switch (kind) {
    case 'story_suggestion':
      return t('inspector.director.actions.storySuggestion')
    case 'relationship_delta':
      return t('inspector.director.actions.relationshipDelta')
    case 'world_state_update':
      return t('inspector.director.actions.worldStateUpdate')
  }
}

function renderStructuredInsight(
  t: ReturnType<typeof useI18n>['t'],
  kind: StructuredInsightKind,
  payload: Record<string, unknown>,
) {
  switch (kind) {
    case 'story_suggestion':
      return renderStorySuggestion(t, payload)
    case 'relationship_delta':
      return renderRelationshipDelta(t, payload)
    case 'world_state_update':
      return renderWorldStateUpdate(t, payload)
  }
}

function renderStorySuggestion(
  t: ReturnType<typeof useI18n>['t'],
  payload: Record<string, unknown>,
) {
  const nextScene = asText(payload.next_scene)
  const tension = asText(payload.tension)
  const goals = asStringArray(payload.goals)
  const risks = asStringArray(payload.risks)
  const unresolvedConflicts = asStringArray(payload.unresolved_conflicts)

  return (
    <>
      {nextScene ? <InsightBlock label={t('inspector.director.fields.nextScene')} value={nextScene} /> : null}
      {tension ? <InsightBlock label={t('inspector.director.fields.tension')} value={tension} /> : null}
      {goals.length > 0 ? <InsightListBlock label={t('inspector.director.fields.goals')} items={goals} /> : null}
      {risks.length > 0 ? <InsightListBlock label={t('inspector.director.fields.risks')} items={risks} /> : null}
      {unresolvedConflicts.length > 0 ? (
        <InsightListBlock label={t('inspector.director.fields.unresolvedConflicts')} items={unresolvedConflicts} />
      ) : null}
    </>
  )
}

function renderRelationshipDelta(
  t: ReturnType<typeof useI18n>['t'],
  payload: Record<string, unknown>,
) {
  const changes = Array.isArray(payload.changes) ? payload.changes : []
  return changes.map((change, index) => {
    if (!change || typeof change !== 'object') {
      return null
    }
    const leftActor = asText(change.left_actor)
    const rightActor = asText(change.right_actor)
    const reason = asText(change.reason)
    const nextImplication = asText(change.next_implication)
    const delta = typeof change.delta === 'number' ? change.delta.toFixed(2) : '--'
    return (
      <div className="ref-context-injected" key={`${leftActor}-${rightActor}-${index}`}>
        <div className="ref-inspector-row">
          <span>{[leftActor, rightActor].filter(Boolean).join(' <> ') || 'Relationship'}</span>
          <strong>{delta}</strong>
        </div>
        <p>{reason || '--'}</p>
        {nextImplication ? <p>{`${t('inspector.director.fields.nextImplication')}: ${nextImplication}`}</p> : null}
      </div>
    )
  })
}

function renderWorldStateUpdate(
  t: ReturnType<typeof useI18n>['t'],
  payload: Record<string, unknown>,
) {
  const updates = Array.isArray(payload.state_updates) ? payload.state_updates : []
  return updates.map((update, index) => {
    if (!update || typeof update !== 'object') {
      return null
    }
    const entity = asText(update.entity)
    const field = asText(update.field)
    const reason = asText(update.reason)
    const scope = asText(update.scope)
    const nextValue = formatUnknown(update.next_value)
    return (
      <div className="ref-context-injected" key={`${entity}-${field}-${index}`}>
        <div className="ref-inspector-row">
          <span>{entity || 'State'}</span>
          <strong>{field || '--'}</strong>
        </div>
        <p>{nextValue}</p>
        {scope ? <p>{`${t('inspector.director.fields.scope')}: ${scope}`}</p> : null}
        {reason ? <p>{reason}</p> : null}
      </div>
    )
  })
}

function InsightBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="ref-context-injected">
      <div className="ref-inspector-row">
        <span>{label}</span>
        <strong>{value.length}</strong>
      </div>
      <p>{value}</p>
    </div>
  )
}

function InsightListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="ref-context-injected">
      <div className="ref-inspector-row">
        <span>{label}</span>
        <strong>{items.length}</strong>
      </div>
      {items.map((item, index) => (
        <p key={`${label}-${index}`}>{item}</p>
      ))}
    </div>
  )
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
}

function formatUnknown(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return 'null'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
