import type { FormEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertCircleIcon, ChevronDownIcon, MessageSquareTextIcon } from 'lucide-react'
import type {
  CharacterChatSummary,
  CharacterSummary,
  ChatMessage,
} from '@yggdrasil/api-client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { DraftAssistMode } from '@/features/workspace/useWorkbenchState'
import { useI18n } from '@/lib/i18n'
import type { MessageRenderingConfig } from '@/lib/chat-rendering'
import { resolveMessageRenderingProfile } from '@/lib/chat-rendering'
import { toTimestamp } from '@/lib/formatters'
import { estimateMessageTokens } from '@/lib/workspace-runtime'

import { ChatDraftForm } from './ChatDraftForm'
import { ChatMessageCard } from './ChatMessageCard'

export interface ChatTranscriptCardProps {
  selectedCharacter: CharacterSummary | null
  selectedChat: CharacterChatSummary | null
  selectedChatId: string
  transcriptMessages: ChatMessage[]
  chatMessagesCount: number
  hasChatMetadata: boolean
  loading: boolean
  error: string | null
  saveError: string | null
  saveErrorTitle?: string | null
  actionPending: boolean
  draftMessage: string
  draftAuthorName: string
  messageRenderingConfig?: MessageRenderingConfig | null
  onAssistDraft?: () => void
  draftAssistMode?: DraftAssistMode
  onDraftAssistModeChange?: (mode: DraftAssistMode) => void
  onBranchMessage?: (index: number) => void
  onContinueMessage?: (index: number) => void
  onDeleteMessage?: (index: number) => void
  onDraftChange: (value: string) => void
  onDraftSubmit: (event: FormEvent<HTMLFormElement>) => void
  onEditMessage?: (index: number, nextText: string) => void
  onRegenerateMessage?: (index: number) => void
  onResaveClick: () => void
}

export function ChatTranscriptCard({
  selectedCharacter,
  selectedChat,
  selectedChatId,
  transcriptMessages,
  chatMessagesCount,
  loading,
  error,
  saveError,
  saveErrorTitle,
  actionPending,
  draftMessage,
  messageRenderingConfig,
  onAssistDraft,
  draftAssistMode,
  onDraftAssistModeChange,
  onBranchMessage,
  onContinueMessage,
  onDeleteMessage,
  onDraftChange,
  onDraftSubmit,
  onEditMessage,
  onRegenerateMessage,
  onResaveClick,
}: ChatTranscriptCardProps) {
  const { t } = useI18n()
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const lastAnchorKeyRef = useRef<string>('')
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const messageRenderingConfigSignature = JSON.stringify(messageRenderingConfig ?? null)
  const renderingProfile = useMemo(
    () => resolveMessageRenderingProfile(messageRenderingConfig),
    [messageRenderingConfigSignature],
  )
  const hasVisibleChat = Boolean(selectedChat || selectedChatId || transcriptMessages.length > 0)
  const showTranscriptEmptyState = !selectedCharacter || !hasVisibleChat
  const draftTokenCount = estimateMessageTokens(draftMessage)
  const latestTranscriptStamp = transcriptMessages
    .slice()
    .reverse()
    .find((message) => Boolean(message.send_date))?.send_date
  const transcriptDate = selectedChat?.last_mes || latestTranscriptStamp
    ? new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(toTimestamp(selectedChat?.last_mes ?? latestTranscriptStamp))
    : null

  const resolveViewport = useCallback(() => (
    scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null
  ), [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = resolveViewport()
    if (!viewport) return
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    })
  }, [resolveViewport])

  const updateScrollState = useCallback(() => {
    const viewport = resolveViewport()
    if (!viewport) {
      setShowScrollToBottom(false)
      return
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    setShowScrollToBottom(distanceFromBottom > 96)
  }, [resolveViewport])

  useEffect(() => {
    const viewport = resolveViewport()
    if (!viewport) return

    const handleScroll = () => updateScrollState()
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    updateScrollState()

    return () => {
      viewport.removeEventListener('scroll', handleScroll)
    }
  }, [resolveViewport, updateScrollState])

  useLayoutEffect(() => {
    const anchorKey = `${selectedCharacter?.avatar ?? ''}::${selectedChatId}::${transcriptMessages.length}`
    const sessionKey = `${selectedCharacter?.avatar ?? ''}::${selectedChatId}`
    const previousAnchorKey = lastAnchorKeyRef.current
    const previousSessionKey = previousAnchorKey.split('::').slice(0, 2).join('::')
    const shouldForceBottom =
      previousSessionKey !== sessionKey
      || previousAnchorKey === ''

    if (shouldForceBottom) {
      requestAnimationFrame(() => {
        scrollToBottom('auto')
        updateScrollState()
      })
    } else if (!showScrollToBottom) {
      requestAnimationFrame(() => {
        scrollToBottom('auto')
        updateScrollState()
      })
    }

    lastAnchorKeyRef.current = anchorKey
  }, [
    selectedCharacter?.avatar,
    selectedChatId,
    showScrollToBottom,
    scrollToBottom,
    transcriptMessages.length,
    updateScrollState,
  ])

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 border-0 bg-transparent py-0 shadow-none">
      <CardHeader className="sr-only">
        <div className="min-w-0">
          <CardTitle>{t('chatTranscript.title')}</CardTitle>
          <CardDescription>{t('chatTranscript.description')}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-0 px-0 py-0">
        <div className="min-h-0 flex-1 overflow-hidden px-0 py-0">
          {error ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t('chatTranscript.errors.loadTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton className="h-28 w-full rounded-sm" key={index} />
              ))}
            </div>
          ) : showTranscriptEmptyState ? (
            <Empty className="rounded-sm border-border/80">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareTextIcon />
                </EmptyMedia>
                <EmptyTitle>{t('chatTranscript.emptySelectionTitle')}</EmptyTitle>
                <EmptyDescription>{t('chatTranscript.emptySelectionDescription')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : transcriptMessages.length === 0 ? (
            <Empty className="rounded-none border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareTextIcon />
                </EmptyMedia>
                <EmptyTitle>{t('chatTranscript.emptyChatTitle')}</EmptyTitle>
                <EmptyDescription>{t('chatTranscript.emptyChatDescription')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="ref-transcript-shell">
              {transcriptDate ? (
                <div className="ref-transcript-date">
                  <span>{transcriptDate}</span>
                </div>
              ) : null}
              <ScrollArea className="ref-transcript-scroll h-full min-h-0" ref={scrollAreaRef}>
                <div className="ref-transcript-list">
                  <div className="ref-transcript-divider" />
                  {transcriptMessages.map((message, index) => (
                    <ChatMessageCard
                      actionPending={actionPending}
                      characterAvatar={selectedCharacter?.avatar ?? null}
                      key={resolveTranscriptMessageKey(message, index)}
                      index={index}
                      message={message}
                      onBranch={onBranchMessage}
                      onContinue={onContinueMessage}
                      onDelete={onDeleteMessage}
                      onEdit={onEditMessage}
                      onRegenerate={onRegenerateMessage}
                      renderingProfile={renderingProfile}
                    />
                  ))}
                  <div className="ref-transcript-end">
                    <span className="ref-transcript-end-line">{t('chatTranscript.endOfHistory')}</span>
                  </div>
                </div>
              </ScrollArea>
              {showScrollToBottom ? (
                <div className="ref-scroll-bottom-bar">
                  <Button
                    aria-label={t('chatTranscript.scrollToBottom')}
                    className="ref-scroll-bottom-button"
                    onClick={() => scrollToBottom('smooth')}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronDownIcon className="size-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {saveError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{saveErrorTitle ?? t('chatTranscript.errors.saveTitle')}</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}

        {selectedCharacter ? (
          <div className="ref-composer-dock">
            <ChatDraftForm
              actionPending={actionPending}
              draftMessage={draftMessage}
              draftAssistMode={draftAssistMode}
              hasChatMessages={chatMessagesCount > 0}
              hasSelectedChat={Boolean(selectedChatId)}
              onAssistDraft={onAssistDraft}
              onDraftAssistModeChange={onDraftAssistModeChange}
              onDraftChange={onDraftChange}
              onDraftSubmit={onDraftSubmit}
              onResaveClick={onResaveClick}
              tokenCount={draftTokenCount}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function resolveTranscriptMessageKey(message: ChatMessage, index: number): string {
  const extra = message.extra
  if (extra && typeof extra === 'object' && typeof extra.render_id === 'string' && extra.render_id) {
    return extra.render_id
  }

  return `${message.name ?? 'System'}-${index}-${message.send_date ?? 'unknown'}`
}

