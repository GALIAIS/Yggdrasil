import { DownloadIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TraceEntry } from '@yggdrasil/api-client'
export type { TraceEntry } from '@yggdrasil/api-client'

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
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

const TRACE_DISPLAY_LIMIT = 8

export interface TraceTabProps {
  traces: TraceEntry[]
  onClear?: () => void
  onExport?: () => void
}

export function TraceTab({
  traces,
  onClear,
  onExport,
}: TraceTabProps) {
  const { t } = useI18n()
  const [visibleCount, setVisibleCount] = useState(TRACE_DISPLAY_LIMIT)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const displayTraces = traces.slice(0, visibleCount)
  const hasMoreTraces = traces.length > displayTraces.length

  useEffect(() => {
    setVisibleCount((current) => {
      if (traces.length <= TRACE_DISPLAY_LIMIT) {
        return TRACE_DISPLAY_LIMIT
      }

      return Math.min(Math.max(current, TRACE_DISPLAY_LIMIT), traces.length)
    })
  }, [traces.length])

  return (
    <>
      <div className="ref-inspector-scroll">
        <div className="ref-inspector-panel">
          <div className="ref-inspector-head">
            <span>{t('traceTab.generationHistory')}</span>
            <strong>{displayTraces.length}</strong>
          </div>
          <div className="ref-inspector-body-block">
            <div className="ref-trace-actions">
              {onExport ? (
                <Button className="ref-inspector-cta" onClick={onExport} size="sm" type="button" variant="ghost">
                  <DownloadIcon className="size-3.5" />
                  {t('common.export')}
                </Button>
              ) : null}
              {onClear ? (
                <Button className="ref-inspector-cta" onClick={() => setClearDialogOpen(true)} size="sm" type="button" variant="ghost">
                  <Trash2Icon className="size-3.5" />
                  {t('common.clear')}
                </Button>
              ) : null}
            </div>
            {traces.length > displayTraces.length ? (
              <div className="ref-inspector-row">
                <span>{t('traceTab.showingRecent')}</span>
                <strong>{displayTraces.length} / {traces.length}</strong>
              </div>
            ) : null}
            {displayTraces.length === 0 ? (
              <div className="ref-inspector-row">
                <span>{t('common.unavailable')}</span>
                <strong>0</strong>
              </div>
            ) : null}
            {displayTraces.map((trace) => (
              <div className="ref-trace-card" key={trace.id}>
                {(() => {
                  const traceContext = readTraceGenerationContext(trace.requestPayload)
                  return (
                    <>
                <div className="ref-trace-row">
                  <span>{trace.characterName}</span>
                  <em>
                    {typeof trace.tokenCount === 'number' ? `${trace.tokenCount} ${t('inspector.tok')}` : t('common.unavailable')}
                  </em>
                  <strong>{typeof trace.durationMs === 'number' ? formatDuration(trace.durationMs) : t('common.unavailable')}</strong>
                </div>
                <div className="ref-inspector-row">
                  <span>{t('traceTab.labels.provider')}</span>
                  <strong>{trace.model ? `${trace.provider} / ${trace.model}` : trace.provider}</strong>
                </div>
                {traceContext?.promptCache ? (
                  <>
                    <div className="ref-inspector-row">
                      <span>{t('traceTab.labels.promptCache')}</span>
                      <strong>{traceContext.promptCache.status === 'hit' ? t('traceTab.cache.hit') : t('traceTab.cache.miss')}</strong>
                    </div>
                    <p>
                      {t('traceTab.cache.summary', {
                        chars: traceContext.promptCache.stablePrefixChars,
                        messages: traceContext.promptCache.stablePrefixMessages,
                      })}
                    </p>
                    <p className="ref-trace-copy">
                      {[
                        traceContext.promptCache.schemaId ? `Schema: ${traceContext.promptCache.schemaId}` : '',
                        traceContext.promptCache.stablePrefixSections.length > 0
                          ? `${t('traceTab.labels.stablePrefix')}: ${traceContext.promptCache.stablePrefixSections.join(' | ')}`
                          : '',
                        `Fingerprint: ${traceContext.promptCache.fingerprint}`,
                      ].filter(Boolean).join('  ')}
                    </p>
                  </>
                ) : null}
                <div className="ref-inspector-row">
                  <span>{trace.createdAt ? new Date(trace.createdAt).toLocaleTimeString() : t('common.unavailable')}</span>
                  <strong>{trace.createdAt ? new Date(trace.createdAt).toLocaleDateString() : t('common.unavailable')}</strong>
                </div>
                {trace.promptText ? <p className="ref-trace-copy">{trace.promptText}</p> : null}
                {traceContext ? (
                  <div className="ref-context-injected">
                    <div className="ref-inspector-row">
                      <span>{t('contextTab.retrievalQuery')}</span>
                      <strong>
                        {traceContext.characterSnippets.length
                          + traceContext.directiveSnippets.length
                          + traceContext.lorebookSnippets.length
                          + traceContext.narrativeMemories.length
                          + traceContext.sessionSnippets.length}
                      </strong>
                    </div>
                    <p>{traceContext.query || t('common.unconfigured')}</p>
                    <div className="ref-inspector-row">
                      <span>{t('traceTab.labels.hitDomains')}</span>
                      <strong>{traceContext.retrievalHits.length}</strong>
                    </div>
                    <p>{summarizeRetrievalDomains(traceContext.retrievalHits) || t('contextTab.retrievalNoHits')}</p>
                    <div className="ref-inspector-row">
                      <span>{t('traceTab.labels.finalInjected')}</span>
                      <strong>
                        {traceContext.characterSnippets.length
                          + traceContext.directiveSnippets.length
                          + traceContext.lorebookSnippets.length
                          + traceContext.narrativeMemories.length
                          + traceContext.sessionSnippets.length}
                      </strong>
                    </div>
                    <p>{summarizeInjectedSources(traceContext)}</p>
                    {traceContext.contextBudget ? (
                      <>
                        <div className="ref-inspector-row">
                          <span>{t('contextTab.contextBudget')}</span>
                          <strong>
                            {traceContext.contextBudget.usedTokens} / {traceContext.contextBudget.usableInputBudget}
                          </strong>
                        </div>
                        <p className="ref-trace-copy">
                          {[
                            `${t('contextTab.outputReserve')}: ${traceContext.contextBudget.reservedOutput}`,
                            `${t('contextTab.recentMessagesKept')}: ${traceContext.contextBudget.recentMessagesKept ?? 0}`,
                            `${t('contextTab.summaryKinds')}: ${
                              traceContext.contextBudget.summaryKindsUsed?.join(' | ') || t('common.unavailable')
                            }`,
                            `Kept: ${traceContext.contextBudget.kept.length}`,
                            `Dropped: ${traceContext.contextBudget.dropped.length}`,
                          ].join('  ')}
                        </p>
                        {traceContext.contextBudget.dropped.length > 0 ? (
                          <p className="ref-trace-copy">
                            {traceContext.contextBudget.dropped
                              .slice(0, 3)
                              .map((entry) => `${entry.layer}:${entry.source} (${entry.estimatedTokens}) ${entry.preview}`)
                              .join('  |  ')}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {traceContext.characterSnippets.length > 0 ? (
                      <p className="ref-trace-copy">
                        Character: {traceContext.characterSnippets.map((item) => item.characterName).join(' | ')}
                      </p>
                    ) : null}
                    {traceContext.directiveSnippets.length > 0 ? (
                      <p className="ref-trace-copy">
                        {t('contextTab.directiveSnippets')}: {traceContext.directiveSnippets.map((item) => `${item.label} / ${item.sourceName}`).join(' | ')}
                      </p>
                    ) : null}
                    {traceContext.lorebookSnippets.length > 0 ? (
                      <p className="ref-trace-copy">
                        {t('contextTab.lorebookSnippets')}: {traceContext.lorebookSnippets.map((item) => item.bookName).join(' | ')}
                      </p>
                    ) : null}
                    {traceContext.narrativeMemories.length > 0 ? (
                      <p className="ref-trace-copy">
                        {t('contextTab.narrativeMemories')}: {traceContext.narrativeMemories.map((item) => item.summary || item.kind).join(' | ')}
                      </p>
                    ) : null}
                    {traceContext.sessionSnippets.length > 0 ? (
                      <p className="ref-trace-copy">
                        Session: {traceContext.sessionSnippets.map((item) => `${item.role}#${item.ordinal}`).join(' | ')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {trace.responseText ? <p className="ref-trace-copy is-response">{trace.responseText}</p> : null}
                {trace.errorText ? <p className="ref-trace-copy is-response">{trace.errorText}</p> : null}
                    </>
                  )
                })()}
              </div>
            ))}
            {traces.length > TRACE_DISPLAY_LIMIT ? (
              <div className="ref-trace-actions">
                {hasMoreTraces ? (
                  <Button
                    className="ref-inspector-cta"
                    onClick={() => setVisibleCount((current) => Math.min(current + TRACE_DISPLAY_LIMIT, traces.length))}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t('traceTab.loadMore')}
                  </Button>
                ) : null}
                {visibleCount > TRACE_DISPLAY_LIMIT ? (
                  <Button
                    className="ref-inspector-cta"
                    onClick={() => setVisibleCount(TRACE_DISPLAY_LIMIT)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t('traceTab.collapseRecent')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('traceTab.clearConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('traceTab.clearConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onClear?.()
                setClearDialogOpen(false)
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function summarizeRetrievalDomains(hits: ParsedTraceGenerationContext['retrievalHits']) {
  if (!hits.length) return ''

  const buckets = new Map<string, number>()
  for (const hit of hits) {
    const domain = hit.domain.trim() || 'unknown'
    buckets.set(domain, (buckets.get(domain) ?? 0) + 1)
  }

  return Array.from(buckets.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([domain, count]) => `${formatRetrievalMeta(domain)} x${count}`)
    .join('  ')
}

function summarizeInjectedSources(context: ParsedTraceGenerationContext) {
  const buckets: Array<[string, number]> = [
    ['Character', context.characterSnippets.length],
    ['Directive', context.directiveSnippets.length],
    ['Lorebook', context.lorebookSnippets.length],
    ['Memory', context.narrativeMemories.length],
    ['Session', context.sessionSnippets.length],
    ['World', context.worldStateSnippets.length],
  ]

  return buckets
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`)
    .join('  ')
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

type ParsedTraceGenerationContext = {
  characterSnippets: Array<{ characterName: string; content: string; score: number }>
  contextBudget?: {
    dropped: Array<{ estimatedTokens: number; layer: string; preview: string; reason?: string; source: string }>
    kept: Array<{ estimatedTokens: number; layer: string; preview: string; reason?: string; source: string }>
    recentMessagesKept?: number
    reservedOutput: number
    summaryKindsUsed?: string[]
    usableInputBudget: number
    usedTokens: number
  }
  directiveSnippets: Array<{ content: string; label: string; sourceName: string }>
  lorebookSnippets: Array<{ bookName: string; content: string }>
  narrativeMemories: Array<{ content: string; kind: string; summary: string }>
  promptCache?: {
    fingerprint: string
    schemaId?: string
    stablePrefixChars: number
    stablePrefixMessages: number
    stablePrefixSections: string[]
    status: string
  }
  retrievalHits: Array<{ domain: string; hitId: string; score: number }>
  sessionSnippets: Array<{ content: string; ordinal: number; role: string; score: number }>
  query: string
  worldStateSnippets: Array<{ category: string; detail: string; entity: string; status: string }>
}

function readTraceGenerationContext(requestPayload?: string): ParsedTraceGenerationContext | null {
  if (!requestPayload) return null

  try {
    const parsed = JSON.parse(requestPayload) as {
      _trace_context?: {
        generationContext?: ParsedTraceGenerationContext
        promptCache?: ParsedTraceGenerationContext['promptCache']
      }
    }

    const generationContext = parsed._trace_context?.generationContext
    if (!generationContext) {
      return null
    }

    return {
      ...generationContext,
      characterSnippets: Array.isArray(generationContext.characterSnippets) ? generationContext.characterSnippets : [],
      directiveSnippets: Array.isArray(generationContext.directiveSnippets) ? generationContext.directiveSnippets : [],
      lorebookSnippets: Array.isArray(generationContext.lorebookSnippets) ? generationContext.lorebookSnippets : [],
      narrativeMemories: Array.isArray(generationContext.narrativeMemories) ? generationContext.narrativeMemories : [],
      retrievalHits: Array.isArray(generationContext.retrievalHits) ? generationContext.retrievalHits : [],
      sessionSnippets: Array.isArray(generationContext.sessionSnippets) ? generationContext.sessionSnippets : [],
      worldStateSnippets: Array.isArray(generationContext.worldStateSnippets) ? generationContext.worldStateSnippets : [],
      query: typeof generationContext.query === 'string' ? generationContext.query : '',
      contextBudget: generationContext.contextBudget
        ? {
          ...generationContext.contextBudget,
          dropped: Array.isArray(generationContext.contextBudget.dropped) ? generationContext.contextBudget.dropped : [],
          kept: Array.isArray(generationContext.contextBudget.kept) ? generationContext.contextBudget.kept : [],
          summaryKindsUsed: Array.isArray(generationContext.contextBudget.summaryKindsUsed)
            ? generationContext.contextBudget.summaryKindsUsed
            : [],
        }
        : undefined,
      promptCache: parsed._trace_context?.promptCache
        ? {
          ...parsed._trace_context.promptCache,
          stablePrefixSections: Array.isArray(parsed._trace_context.promptCache.stablePrefixSections)
            ? parsed._trace_context.promptCache.stablePrefixSections
            : [],
        }
        : undefined,
    }
  } catch {
    return null
  }
}
