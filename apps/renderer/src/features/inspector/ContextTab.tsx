import type { ReactElement } from 'react'
import { useState } from 'react'
import type {
  CharacterSnippet,
  CharacterSummary,
  ChatMessage,
  DirectiveSnippet,
  LorebookSnippet,
  NarrativeMemoryCandidateEntry,
  NarrativeMemoryEntry,
  NarrativeMemoryHitEntry,
  RetrievalHitEntry,
  RetrievalJobEntry,
  RetrievalHitSummary,
  SettingsPayload,
  SessionSnippet,
  SessionSummary,
} from '@yggdrasil/api-client'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useI18n } from '@/lib/i18n'
import { buildSessionSummarySourceSignature } from '@/lib/session-summary'
import {
  buildCharacterSummary,
  estimateTranscriptTokens,
  resolveRetrievalJobsRetentionPerSource,
  resolveSessionSummaryMinMessages,
  resolveSessionSummaryRefreshIntervalMs,
  resolveSessionSummarySourceWindow,
} from '@/lib/workspace-runtime'

type GenerationContextSnapshot = {
  assemblyBudget?: {
    dropped: Array<{ estimatedTokens: number; layer: string; preview: string; reason?: string; source: string }>
    kept: Array<{ estimatedTokens: number; layer: string; preview: string; source: string }>
    reservedOutput: number
    usableInputBudget: number
    usedTokens: number
  }
  characterSnippets: CharacterSnippet[]
  directiveSnippets: DirectiveSnippet[]
  lorebookSnippets: LorebookSnippet[]
  narrativeMemories: NarrativeMemoryEntry[]
  query: string
  recentMessagesKept?: number
  retrievalHits: RetrievalHitSummary[]
  sessionSnippets: SessionSnippet[]
  summaryKindsUsed?: string[]
}

export interface ContextTabProps {
  memoryHitsClearing?: boolean
  lastGenerationContext: GenerationContextSnapshot | null
  narrativeMemoryCandidates: NarrativeMemoryCandidateEntry[]
  narrativeMemoryHits: NarrativeMemoryHitEntry[]
  onApproveAllNarrativeMemoryCandidates?: () => void
  onClearMemoryHits?: () => void
  onDeleteNarrativeMemory?: (memoryId: string) => void
  onDeleteNarrativeMemoryCandidate?: (candidateId: string) => void
  onDeleteSessionSummary?: (summaryId: string) => void
  onClearSessionSummaries?: () => void
  onApproveNarrativeMemoryCandidate?: (candidateId: string) => void
  onRejectNarrativeMemoryCandidate?: (candidateId: string) => void
  onRefreshSessionSummaries?: () => void
  pendingNarrativeMemoryCandidateBatchAction?: 'approve' | null
  pendingSessionSummaryDeletionId?: string | null
  pendingNarrativeMemoryCandidateDeletionId?: string | null
  pendingNarrativeMemoryCandidateId?: string | null
  pendingNarrativeMemoryDeletionId?: string | null
  retrievalActivityHits: RetrievalHitEntry[]
  retrievalJobs: RetrievalJobEntry[]
  sessionSummaryDeleting?: boolean
  sessionSummaries: SessionSummary[]
  sessionSummariesRefreshing?: boolean
  settings: SettingsPayload | null
  storedNarrativeMemories: NarrativeMemoryEntry[]
  transcriptMessages: ChatMessage[]
  selectedCharacter: CharacterSummary | null
}

type ParsedRetrievalJobDetail = {
  counts?: Record<string, number>
  hits?: RetrievalHitSummary[]
  originalQuery?: string
  query?: string
  weights?: Record<string, Record<string, number>>
}

const EXPECTED_SUMMARY_KINDS = ['session', 'scene', 'relationship', 'open_loops'] as const

export function ContextTab({
  memoryHitsClearing,
  lastGenerationContext,
  narrativeMemoryCandidates,
  narrativeMemoryHits,
  onApproveAllNarrativeMemoryCandidates,
  onClearMemoryHits,
  onDeleteNarrativeMemory,
  onDeleteNarrativeMemoryCandidate,
  onDeleteSessionSummary,
  onClearSessionSummaries,
  onApproveNarrativeMemoryCandidate,
  onRejectNarrativeMemoryCandidate,
  onRefreshSessionSummaries,
  pendingNarrativeMemoryCandidateBatchAction,
  pendingSessionSummaryDeletionId,
  pendingNarrativeMemoryCandidateDeletionId,
  pendingNarrativeMemoryCandidateId,
  pendingNarrativeMemoryDeletionId,
  retrievalActivityHits,
  retrievalJobs,
  sessionSummaryDeleting,
  sessionSummaries,
  sessionSummariesRefreshing,
  settings,
  storedNarrativeMemories,
  transcriptMessages,
  selectedCharacter,
}: ContextTabProps) {
  const { t } = useI18n()
  const [summaryDialogState, setSummaryDialogState] = useState<
    | { kind: 'clear-all' }
    | { kind: 'delete-one'; summaryId: string; summaryKind: string }
    | null
  >(null)
  const settingsState = settings?.settings
  const contextSize =
    typeof settingsState?.max_context === 'number'
      ? settingsState.max_context
      : typeof settingsState?.max_context === 'string'
        ? Number(settingsState.max_context)
        : 10_000

  const estimatedTokens = estimateTranscriptTokens(transcriptMessages)
  const contextUsage = Math.min(100, Math.round((estimatedTokens / Math.max(contextSize, 1)) * 100))
  const visibleMessages = transcriptMessages.slice(-5).reverse()
  const hiddenMessagesCount = Math.max(0, transcriptMessages.length - visibleMessages.length)
  const orderedSessionSummaries = [...sessionSummaries].sort((left, right) => left.summaryKind.localeCompare(right.summaryKind))
  const summaryCompleteness = `${orderedSessionSummaries.length}/${EXPECTED_SUMMARY_KINDS.length}`
  const meaningfulMessageCount = transcriptMessages.filter((message, index) => {
    if (index === 0 && message.chat_metadata) {
      return false
    }
    return Boolean((message.mes ?? '').trim())
  }).length
  const latestSummaryRecord = sessionSummaries.reduce<SessionSummary | null>((latest, summary) => {
    if (!latest) return summary
    return (summary.updatedAt ?? 0) >= (latest.updatedAt ?? 0) ? summary : latest
  }, null)
  const latestSummaryUpdatedAt = latestSummaryRecord?.updatedAt ?? 0
  const latestSummaryMessageEnd = latestSummaryRecord?.sourceMessageEnd ?? 0
  const latestRetrievalJobUpdatedAt = retrievalJobs.reduce((max, job) => Math.max(max, job.updatedAt ?? 0), 0)
  const sessionSummaryMinMessages = resolveSessionSummaryMinMessages(settingsState)
  const sessionSummaryRefreshIntervalMs = resolveSessionSummaryRefreshIntervalMs(settingsState)
  const sessionSummarySourceWindow = resolveSessionSummarySourceWindow(settingsState)
  const retrievalJobsRetentionPerSource = resolveRetrievalJobsRetentionPerSource(settingsState)
  const currentSourceSignature = buildSessionSummarySourceSignature(
    transcriptMessages,
    settingsState?.username?.trim() || t('common.user'),
    selectedCharacter?.name?.trim() || t('common.character'),
    sessionSummarySourceWindow,
  )
  const latestTranscriptTimestamp = transcriptMessages.reduce((max, message) => {
    const parsed = typeof message.send_date === 'string' ? Date.parse(message.send_date) : NaN
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max
  }, 0)
  const summaryStale = transcriptMessages.length > 1 && (
    orderedSessionSummaries.length === 0
      ? meaningfulMessageCount >= sessionSummaryMinMessages
      : (latestSummaryMessageEnd > 0
        ? meaningfulMessageCount > latestSummaryMessageEnd
          || (
            Boolean(latestSummaryRecord?.sourceSignature)
            && latestSummaryRecord?.sourceSignature !== currentSourceSignature
          )
        : latestTranscriptTimestamp > latestSummaryUpdatedAt)
  )
  const syspromptContent =
    settingsState?.sysprompt && typeof settingsState.sysprompt === 'object' && typeof settingsState.sysprompt.content === 'string'
      ? settingsState.sysprompt.content.trim()
      : ''
  const personaContent = buildCharacterSummary(selectedCharacter)
  const scenarioContent =
    selectedCharacter?.scenario?.trim() ||
    selectedCharacter?.first_mes?.trim() ||
    ''
  const systemPromptContent =
    typeof selectedCharacter?.system_prompt === 'string'
      ? selectedCharacter.system_prompt.trim()
      : ''
  const postHistoryInstructions =
    typeof selectedCharacter?.post_history_instructions === 'string'
      ? selectedCharacter.post_history_instructions.trim()
      : ''
  const injectedContent = [
    { label: t('contextTab.injected.authorNote'), content: syspromptContent },
    { label: t('contextTab.injected.persona'), content: personaContent },
    { label: t('contextTab.injected.scenario'), content: scenarioContent },
    { label: t('characterEditor.fields.systemPrompt'), content: systemPromptContent },
    { label: t('characterEditor.fields.postHistoryInstructions'), content: postHistoryInstructions },
  ].filter((item) => item.content)
  const embeddingEnabled = settingsState?.narrative_embedding_enabled === true
  const embeddingModel =
    typeof settingsState?.narrative_embedding_model === 'string' && settingsState.narrative_embedding_model.trim()
      ? settingsState.narrative_embedding_model.trim()
      : ''
  const embeddingSource =
    typeof settingsState?.narrative_embedding_source === 'string' && settingsState.narrative_embedding_source.trim()
      ? settingsState.narrative_embedding_source.trim()
      : ''
  const retrievalStatusLabel = !embeddingEnabled
    ? t('common.disabled')
    : storedNarrativeMemories.length > 0
      ? t('common.ready')
      : narrativeMemoryCandidates.length > 0
        ? t('contextTab.pendingReview')
        : t('common.unconfigured')

  return (
    <div className="ref-inspector-scroll">
      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('contextTab.windowUsage')}</span>
          <strong>{contextUsage}%</strong>
        </div>
        <div className="ref-inspector-body-block">
          <div className="ref-inspector-row">
            <span>{t('contextTab.tokensUsed')}</span>
            <strong>{estimatedTokens.toLocaleString()} / {contextSize.toLocaleString()}</strong>
          </div>
          <div className="ref-inspector-meter">
            <div className="ref-meter-track">
              <div className="ref-meter-fill" style={{ width: `${Math.max(contextUsage, 4)}%` }} />
            </div>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.visibleMessages')}</span>
            <strong>{visibleMessages.length}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.hiddenMessages')}</span>
            <strong>{hiddenMessagesCount}</strong>
          </div>
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('contextTab.memoryRetrievalTitle')}</span>
          <strong>{retrievalStatusLabel}</strong>
        </div>
        <div className="ref-inspector-body-block">
          <div className="ref-inspector-row">
            <span>{t('contextTab.embeddingEnabled')}</span>
            <strong>{embeddingEnabled ? t('common.enabled') : t('common.disabled')}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.embeddingModel')}</span>
            <strong>{embeddingModel || t('common.unconfigured')}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.embeddingSource')}</span>
            <strong>{embeddingSource || t('common.unconfigured')}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.memoryCandidates')}</span>
            <strong>{narrativeMemoryCandidates.length}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.storedMemories')}</span>
            <strong>{storedNarrativeMemories.length}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.memoryHitLog')}</span>
            <strong>{narrativeMemoryHits.length}</strong>
          </div>
          {!embeddingEnabled ? (
            <p>{t('contextTab.embeddingDisabledHint')}</p>
          ) : storedNarrativeMemories.length === 0 && narrativeMemoryCandidates.length > 0 ? (
            <p>{t('contextTab.pendingReviewHint')}</p>
          ) : storedNarrativeMemories.length === 0 ? (
            <p>{t('contextTab.noMemoryStoredHint')}</p>
          ) : null}
        </div>
      </div>

      {lastGenerationContext?.assemblyBudget ? (
        <div className="ref-inspector-panel">
          <div className="ref-inspector-head">
            <span>{t('contextTab.contextBudget')}</span>
            <strong>{lastGenerationContext.assemblyBudget.usedTokens}</strong>
          </div>
          <div className="ref-inspector-body-block">
            <div className="ref-inspector-row">
              <span>{t('contextTab.inputBudget')}</span>
              <strong>{lastGenerationContext.assemblyBudget.usedTokens} / {lastGenerationContext.assemblyBudget.usableInputBudget}</strong>
            </div>
            <div className="ref-inspector-row">
              <span>{t('contextTab.outputReserve')}</span>
              <strong>{lastGenerationContext.assemblyBudget.reservedOutput}</strong>
            </div>
            <div className="ref-inspector-row">
              <span>{t('contextTab.recentMessagesKept')}</span>
              <strong>{lastGenerationContext.recentMessagesKept ?? 0}</strong>
            </div>
            <div className="ref-inspector-row">
              <span>{t('contextTab.summaryKinds')}</span>
              <strong>{lastGenerationContext.summaryKindsUsed?.join(', ') || t('common.unconfigured')}</strong>
            </div>
          </div>
        </div>
      ) : null}

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('contextTab.summaryKinds')}</span>
          <strong>{orderedSessionSummaries.length}</strong>
        </div>
        <div className="ref-inspector-body-block">
          <div className="ref-inspector-row">
            <span>{t('contextTab.summaryStatus')}</span>
            <strong>{summaryStale ? t('contextTab.summaryStale') : t('contextTab.summaryFresh')}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.summaryUpdatedAt')}</span>
            <strong>{latestSummaryUpdatedAt > 0 ? new Date(latestSummaryUpdatedAt).toLocaleString() : t('common.unavailable')}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.messagesInContext')}</span>
            <strong>{latestSummaryMessageEnd > 0 ? `${latestSummaryMessageEnd} / ${meaningfulMessageCount}` : meaningfulMessageCount}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.summaryCoverage')}</span>
            <strong>{latestSummaryMessageEnd > 0 ? `${latestSummaryMessageEnd}/${meaningfulMessageCount}` : `0/${meaningfulMessageCount}`}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.summaryComplete')}</span>
            <strong>{summaryCompleteness}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.summaryPolicy')}</span>
            <strong>{`${sessionSummaryMinMessages} / ${sessionSummarySourceWindow}`}</strong>
          </div>
          <div className="ref-inspector-row">
            <span>{t('contextTab.summaryRefreshInterval')}</span>
            <strong>{`${Math.round(sessionSummaryRefreshIntervalMs / 1000)}s`}</strong>
          </div>
          {summaryStale ? <p>{t('contextTab.summaryNeedsBuild')}</p> : null}
          <div className="ref-trace-actions">
            {onRefreshSessionSummaries ? (
              <Button
                className="ref-inspector-cta"
                disabled={sessionSummariesRefreshing}
                onClick={onRefreshSessionSummaries}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t('common.refresh')}
              </Button>
            ) : null}
            {onClearSessionSummaries && orderedSessionSummaries.length > 0 ? (
              <Button
                className="ref-inspector-cta"
                disabled={sessionSummaryDeleting}
                onClick={() => setSummaryDialogState({ kind: 'clear-all' })}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t('common.clear')}
              </Button>
            ) : null}
          </div>
          {orderedSessionSummaries.length === 0 ? (
            <div className="ref-context-injected">
              <div className="ref-inspector-row">
                <span>{t('common.unavailable')}</span>
                <strong>0</strong>
              </div>
              <p>{t('common.unconfigured')}</p>
            </div>
          ) : (
            orderedSessionSummaries.map((summary) => (
              <div className="ref-context-injected" key={summary.id}>
                <div className="ref-inspector-row">
                  <span>{summary.summaryKind}</span>
                  <strong>{new Date(summary.updatedAt).toLocaleString()}</strong>
                </div>
                <div className="ref-inspector-row">
                  <span>{t('contextTab.messagesInContext')}</span>
                  <strong>
                    {typeof summary.sourceMessageStart === 'number' && typeof summary.sourceMessageEnd === 'number'
                      ? `${summary.sourceMessageStart}-${summary.sourceMessageEnd}`
                      : t('common.unavailable')}
                  </strong>
                </div>
                <p>{summary.content}</p>
                {onDeleteSessionSummary ? (
                  <div className="ref-trace-actions">
                    <Button
                      className="ref-inspector-cta"
                      disabled={sessionSummaryDeleting}
                      onClick={() => setSummaryDialogState({
                        kind: 'delete-one',
                        summaryId: summary.id,
                        summaryKind: summary.summaryKind,
                      })}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('contextTab.messagesInContext')}</span>
          <strong>{transcriptMessages.length}</strong>
        </div>
        <div className="ref-inspector-body-block ref-inspector-message-list">
          {visibleMessages.map((message, index) => (
            <div className="ref-context-message" key={`${message.send_date ?? 'message'}-${index}`}>
              <div className="ref-context-message-head">
                <span>{message.name ?? t('common.system')}</span>
              </div>
              <p>{message.mes || t('contextTab.emptyMessage')}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('contextTab.retrievalContext')}</span>
          <strong>
            {(lastGenerationContext?.directiveSnippets.length ?? 0)
              + (lastGenerationContext?.characterSnippets.length ?? 0)
              + (lastGenerationContext?.lorebookSnippets.length ?? 0)
              + (lastGenerationContext?.narrativeMemories.length ?? 0)
              + (lastGenerationContext?.sessionSnippets.length ?? 0)}
          </strong>
        </div>
        <div className="ref-inspector-body-block">
          {lastGenerationContext ? (
            <>
              <div className="ref-context-injected">
                <div className="ref-inspector-row">
                  <span>{t('contextTab.retrievalQuery')}</span>
                  <strong>{lastGenerationContext.query.trim().length || 0}</strong>
                </div>
                <p>{lastGenerationContext.query.trim() || t('common.unconfigured')}</p>
              </div>

              <ContextCollection
                count={lastGenerationContext.characterSnippets.length}
                items={lastGenerationContext.characterSnippets}
                renderItem={(item, index) => (
                  <div className="ref-context-injected" key={`${item.characterName}-${index}`}>
                    <div className="ref-inspector-row">
                      <span>{item.characterName}</span>
                      <strong>{Math.round(item.score * 100) / 100}</strong>
                    </div>
                    <p>{item.content}</p>
                  </div>
                )}
                title={t('inspector.tags.character')}
              />

              <ContextCollection
                count={lastGenerationContext.directiveSnippets.length}
                items={lastGenerationContext.directiveSnippets}
                renderItem={(item, index) => (
                  <div className="ref-context-injected" key={`${item.label}-${item.sourceName}-${index}`}>
                    <div className="ref-inspector-row">
                      <span>{item.label}</span>
                      <strong>{item.sourceName}</strong>
                    </div>
                    <p>{item.content}</p>
                  </div>
                )}
                title={t('contextTab.directiveSnippets')}
              />

              <ContextCollection
                count={lastGenerationContext.lorebookSnippets.length}
                items={lastGenerationContext.lorebookSnippets}
                renderItem={(item, index) => (
                  <div className="ref-context-injected" key={`${item.bookName}-${index}`}>
                    <div className="ref-inspector-row">
                      <span>{item.bookName}</span>
                      <strong>{Math.round(item.score * 100) / 100}</strong>
                    </div>
                    <p>{item.content}</p>
                  </div>
                )}
                title={t('contextTab.lorebookSnippets')}
              />

              <ContextCollection
                count={lastGenerationContext.sessionSnippets.length}
                items={lastGenerationContext.sessionSnippets}
                renderItem={(item, index) => (
                  <div className="ref-context-injected" key={`${item.role}-${item.ordinal}-${index}`}>
                    <div className="ref-inspector-row">
                      <span>{item.role}</span>
                      <strong>{Math.round(item.score * 100) / 100}</strong>
                    </div>
                    <p>{item.content}</p>
                  </div>
                )}
                title={t('contextTab.messagesInContext')}
              />

              <ContextCollection
                count={lastGenerationContext.narrativeMemories.length}
                items={lastGenerationContext.narrativeMemories}
                renderItem={(item) => (
                  <div className="ref-context-injected" key={item.id}>
                    <div className="ref-inspector-row">
                      <span>{item.kind}</span>
                      <strong>{item.tags.slice(0, 2).join(', ') || item.characterName}</strong>
                    </div>
                    <p>{item.content}</p>
                  </div>
                )}
                title={t('contextTab.narrativeMemories')}
              />

              <ContextCollection
                count={lastGenerationContext.retrievalHits.length}
                items={lastGenerationContext.retrievalHits}
                renderItem={(item, index) => (
                  <div className="ref-context-injected" key={`${item.domain}-${item.hitId}-${index}`}>
                    <div className="ref-inspector-row">
                      <span>{item.domain}</span>
                      <strong>{Math.round(item.score * 100) / 100}</strong>
                    </div>
                    <p>{item.hitId}</p>
                  </div>
                )}
                title={t('contextTab.retrievalContext')}
              />

              <ContextCollection
                count={retrievalJobs.length}
                items={retrievalJobs}
                renderItem={(item) => {
                  const parsed = parseRetrievalJobDetail(item.detailJson)
                  const domainSummary = summarizeRetrievalDomains(parsed.hits)
                  return (
                    <div className="ref-context-injected" key={item.id}>
                      <div className="ref-inspector-row">
                        <span>{t('contextTab.retrievalJobSource')}</span>
                        <strong>{formatRetrievalMeta(item.sourceType) || t('common.unknown')}</strong>
                      </div>
                      <div className="ref-inspector-row">
                        <span>{t('contextTab.retrievalJobUpdatedAt')}</span>
                        <strong>{formatTimestamp(item.updatedAt)}</strong>
                      </div>
                      <div className="ref-inspector-row">
                        <span>{t('contextTab.retrievalQuery')}</span>
                        <strong>{parsed.query?.trim().length || 0}</strong>
                      </div>
                      <p>{parsed.query?.trim() || item.sourceId || t('common.unconfigured')}</p>
                      {parsed.originalQuery?.trim() && parsed.originalQuery.trim() !== parsed.query?.trim() ? (
                        <>
                          <div className="ref-inspector-row">
                            <span>{t('contextTab.originalRetrievalQuery')}</span>
                            <strong>{parsed.originalQuery.trim().length}</strong>
                          </div>
                          <p>{parsed.originalQuery.trim()}</p>
                        </>
                      ) : null}
                      <div className="ref-inspector-row">
                        <span>{t('contextTab.retrievalDomains')}</span>
                        <strong>{parsed.hits?.length ?? 0}</strong>
                      </div>
                      <p>{domainSummary || t('contextTab.retrievalNoHits')}</p>
                      {parsed.counts ? (
                        <>
                          <div className="ref-inspector-row">
                            <span>{t('contextTab.retrievalCandidateCounts')}</span>
                            <strong>{Object.values(parsed.counts).reduce((sum, value) => sum + value, 0)}</strong>
                          </div>
                          <p>{formatCountSummary(parsed.counts)}</p>
                        </>
                      ) : null}
                      {parsed.weights ? (
                        <>
                          <div className="ref-inspector-row">
                            <span>{t('contextTab.retrievalWeights')}</span>
                            <strong>{Object.keys(parsed.weights).length}</strong>
                          </div>
                          <p>{formatWeightSummary(parsed.weights)}</p>
                        </>
                      ) : null}
                    </div>
                  )
                }}
                title={t('contextTab.retrievalJobs')}
              />
              <div className="ref-context-injected">
                <div className="ref-inspector-row">
                  <span>{t('contextTab.retrievalActivityStatus')}</span>
                  <strong>{retrievalJobs.length}</strong>
                </div>
                <p>
                  {latestRetrievalJobUpdatedAt > 0
                    ? formatTimestamp(latestRetrievalJobUpdatedAt)
                    : t('contextTab.retrievalIdle')}
                </p>
                <div className="ref-inspector-row">
                  <span>{t('contextTab.retrievalRetention')}</span>
                  <strong>{retrievalJobsRetentionPerSource}</strong>
                </div>
              </div>

              <ContextCollection
                count={retrievalActivityHits.length}
                items={retrievalActivityHits}
                renderItem={(item) => (
                  <div className="ref-context-injected" key={`${item.id}-${item.hitId}`}>
                      <div className="ref-inspector-row">
                        <span>{t('contextTab.retrievalHitDomain')}</span>
                      <strong>{formatRetrievalMeta(item.hitDomain) || t('common.unknown')}</strong>
                      </div>
                    <div className="ref-inspector-row">
                      <span>{t('contextTab.retrievalHitScore')}</span>
                      <strong>{formatScore(item.score)}</strong>
                    </div>
                    <p>{item.hitId}</p>
                    <div className="ref-inspector-row">
                      <span>{t('contextTab.retrievalQuery')}</span>
                      <strong>{item.queryText.trim().length || 0}</strong>
                    </div>
                    <p>{item.queryText.trim() || t('common.unconfigured')}</p>
                  </div>
                )}
                title={t('contextTab.retrievalLog')}
              />
            </>
          ) : (
            <div className="ref-inspector-row">
              <span>{t('contextTab.noRetrievalContext')}</span>
              <strong>0</strong>
            </div>
          )}
          {narrativeMemoryCandidates.length > 1 && onApproveAllNarrativeMemoryCandidates ? (
            <div className="ref-inspector-actions">
              <Button
                className="ref-inspector-cta"
                disabled={pendingNarrativeMemoryCandidateBatchAction === 'approve'}
                onClick={onApproveAllNarrativeMemoryCandidates}
                size="sm"
                type="button"
                variant="ghost"
              >
                {pendingNarrativeMemoryCandidateBatchAction === 'approve'
                  ? t('common.loading')
                  : t('contextTab.approveAllCandidates')}
              </Button>
            </div>
          ) : null}
          <ContextCollection
            count={narrativeMemoryCandidates.length}
            items={narrativeMemoryCandidates}
            renderItem={(item) => (
              <div className="ref-context-injected" key={item.id}>
                <div className="ref-inspector-row">
                  <span>{item.characterName || t('common.unknown')}</span>
                  <strong>{item.status}</strong>
                </div>
                <div className="ref-inspector-row">
                  <span>{item.kind}</span>
                  <strong>{formatScore(item.importance)}</strong>
                </div>
                <p>{item.content}</p>
                {item.summary ? <p>{item.summary}</p> : null}
                <div className="ref-inspector-actions">
                  <Button
                    className="ref-inspector-cta"
                    disabled={pendingNarrativeMemoryCandidateId === item.id}
                    onClick={() => onApproveNarrativeMemoryCandidate?.(item.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t('contextTab.approveCandidate')}
                  </Button>
                  <Button
                    className="ref-inspector-cta"
                    disabled={pendingNarrativeMemoryCandidateId === item.id}
                    onClick={() => onRejectNarrativeMemoryCandidate?.(item.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t('contextTab.rejectCandidate')}
                  </Button>
                  <Button
                    className="ref-inspector-cta"
                    disabled={pendingNarrativeMemoryCandidateDeletionId === item.id}
                    onClick={() => onDeleteNarrativeMemoryCandidate?.(item.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t('sectionBrowser.actions.delete')}
                  </Button>
                </div>
              </div>
            )}
            title={t('contextTab.memoryCandidates')}
          />
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('contextTab.storedMemories')}</span>
          <strong>{storedNarrativeMemories.length}</strong>
        </div>
        <div className="ref-inspector-body-block">
          <ContextCollection
            count={storedNarrativeMemories.length}
            items={storedNarrativeMemories}
            renderItem={(item) => (
              <div className="ref-context-injected" key={item.id}>
                <div className="ref-inspector-row">
                  <span>{item.kind}</span>
                  <strong>{item.tags.slice(0, 2).join(', ') || item.characterName || t('common.unknown')}</strong>
                </div>
                <div className="ref-inspector-row">
                  <span>{t('contextTab.memoryUpdatedAt')}</span>
                  <strong>{formatTimestamp(item.updatedAt)}</strong>
                </div>
                <p>{item.content}</p>
                {item.summary ? <p>{item.summary}</p> : null}
                <div className="ref-inspector-actions">
                  <Button
                    className="ref-inspector-cta"
                    disabled={pendingNarrativeMemoryDeletionId === item.id}
                    onClick={() => onDeleteNarrativeMemory?.(item.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t('sectionBrowser.actions.delete')}
                  </Button>
                </div>
              </div>
            )}
            title={t('contextTab.narrativeMemories')}
          />
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('contextTab.memoryHitLog')}</span>
          <strong>{narrativeMemoryHits.length}</strong>
        </div>
        <div className="ref-inspector-body-block">
          <div className="ref-inspector-actions">
            <Button
              className="ref-inspector-cta"
              disabled={memoryHitsClearing || narrativeMemoryHits.length === 0}
              onClick={onClearMemoryHits}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t('common.clear')}
            </Button>
          </div>
          <ContextCollection
            count={narrativeMemoryHits.length}
            items={narrativeMemoryHits}
            renderItem={(item) => (
              <div className="ref-context-injected" key={`${item.id}-${item.memoryId}`}>
                <div className="ref-inspector-row">
                  <span>{t('contextTab.memoryHitId')}</span>
                  <strong>{item.memoryId}</strong>
                </div>
                <div className="ref-inspector-row">
                  <span>{t('contextTab.retrievalHitScore')}</span>
                  <strong>{formatScore(item.hitScore)}</strong>
                </div>
                <div className="ref-inspector-row">
                  <span>{t('contextTab.memoryUpdatedAt')}</span>
                  <strong>{formatTimestamp(item.createdAt)}</strong>
                </div>
                <p>{item.queryText.trim() || t('common.unconfigured')}</p>
              </div>
            )}
            title={t('contextTab.memoryHitLog')}
          />
        </div>
      </div>

      <div className="ref-inspector-panel">
        <div className="ref-inspector-head">
          <span>{t('contextTab.injectedContent')}</span>
          <strong>{injectedContent.length}</strong>
        </div>
        <div className="ref-inspector-body-block">
          {injectedContent.map((item) => (
            <div className="ref-context-injected" key={item.label}>
              <div className="ref-inspector-row">
                <span>{item.label}</span>
                <strong>{item.content.length.toLocaleString()}</strong>
              </div>
              <p>{item.content}</p>
            </div>
          ))}
          {injectedContent.length === 0 ? (
            <div className="ref-inspector-row">
              <span>{t('common.unconfigured')}</span>
              <strong>0</strong>
            </div>
          ) : null}
        </div>
      </div>

      <AlertDialog open={summaryDialogState !== null} onOpenChange={(open) => {
        if (!open) setSummaryDialogState(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {summaryDialogState?.kind === 'clear-all' ? t('traceTab.clearConfirmTitle') : t('common.delete')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {summaryDialogState?.kind === 'clear-all'
                ? t('traceTab.clearConfirmDescription')
                : summaryDialogState?.kind === 'delete-one'
                  ? `${summaryDialogState.summaryKind} / ${t('common.confirm')}`
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (summaryDialogState?.kind === 'clear-all') {
                  onClearSessionSummaries?.()
                } else if (summaryDialogState?.kind === 'delete-one') {
                  onDeleteSessionSummary?.(summaryDialogState.summaryId)
                }
                setSummaryDialogState(null)
              }}
            >
              {summaryDialogState?.kind === 'delete-one' && pendingSessionSummaryDeletionId === summaryDialogState.summaryId
                ? t('common.deleting')
                : summaryDialogState?.kind === 'clear-all' && pendingSessionSummaryDeletionId === '__scope__'
                  ? t('common.clearing')
                  : t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function parseRetrievalJobDetail(detailJson: string): ParsedRetrievalJobDetail {
  try {
    return JSON.parse(detailJson) as ParsedRetrievalJobDetail
  } catch {
    return {}
  }
}

function summarizeRetrievalDomains(hits?: RetrievalHitSummary[]) {
  if (!hits?.length) {
    return ''
  }

  const buckets = new Map<string, number>()
  for (const hit of hits) {
    const key = hit.domain.trim() || 'unknown'
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return Array.from(buckets.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([domain, count]) => `${formatRetrievalMeta(domain)} x${count}`)
    .join('  ')
}

function formatScore(score: number) {
  return (Math.round(score * 100) / 100).toFixed(2)
}

function formatRetrievalMeta(value: string) {
  if (!value.trim()) {
    return ''
  }

  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function formatTimestamp(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--'
  }

  return new Date(timestamp).toLocaleString()
}

function formatCountSummary(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, value]) => `${formatRetrievalMeta(key)} ${value}`)
    .join('  ')
}

function formatWeightSummary(weights: Record<string, Record<string, number>>) {
  return Object.entries(weights)
    .slice(0, 4)
    .map(([domain, ruleSet]) => {
      const summary = Object.entries(ruleSet)
        .map(([key, value]) => `${formatRetrievalMeta(key)} ${value.toFixed(2)}`)
        .join(', ')
      return `${formatRetrievalMeta(domain)}: ${summary}`
    })
    .join('  ')
}

type ContextCollectionProps<T> = {
  count: number
  items: T[]
  renderItem: (item: T, index: number) => ReactElement
  title: string
}

function ContextCollection<T>({
  count,
  items,
  renderItem,
  title,
}: ContextCollectionProps<T>) {
  return (
    <div className="ref-context-injected">
      <div className="ref-inspector-row">
        <span>{title}</span>
        <strong>{count}</strong>
      </div>
      {items.length > 0 ? items.map(renderItem) : null}
    </div>
  )
}
