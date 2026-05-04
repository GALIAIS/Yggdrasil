import type { ChatMessage } from '@yggdrasil/api-client'
import { memo, useCallback, useState } from 'react'
import { toast } from 'sonner'

import { WorkspaceAvatar } from '@/components/workspace/WorkspaceAvatar'
import { ChatMessageActions } from './ChatMessageActions'
import { MessageContentSegments } from './MessageContentSegments'
import { getMessageText } from '@/lib/chat'
import { toTimestamp } from '@/lib/formatters'
import { useI18n } from '@/lib/i18n'
import type { MessageRenderingProfile } from '@/lib/chat-rendering'
import { cn } from '@/lib/utils'

export interface ChatMessageCardProps {
  actionPending?: boolean
  characterAvatar?: string | null
  message: ChatMessage
  index?: number
  onEdit?: (index: number, nextText: string) => void
  onRegenerate?: (index: number) => void
  onBranch?: (index: number) => void
  onDelete?: (index: number) => void
  onCopy?: (index: number) => void
  onContinue?: (index: number) => void
  renderingProfile?: MessageRenderingProfile | null
}

function ChatMessageCardImpl({
  actionPending = false,
  characterAvatar = null,
  message,
  index = 0,
  onEdit,
  onRegenerate,
  onBranch,
  onDelete,
  onCopy,
  onContinue,
  renderingProfile,
}: ChatMessageCardProps) {
  const { t } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const text = getMessageText(message)
  const messageName = message.name ?? t('common.system')
  const messageType = message.is_user ? 'user' : message.is_system ? 'system' : 'character'
  const messageAvatar = resolveMessageAvatar(message, messageType, characterAvatar)
  const formattedTime = message.send_date
    ? new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(toTimestamp(message.send_date))
    : t('common.unavailable')
  const tokenCount = resolveMessageTokenCount(message)
  const metaTone =
    messageType === 'user'
      ? 'text-[rgba(198,173,136,0.88)]'
      : messageType === 'system'
        ? 'text-[rgba(214,177,102,0.9)]'
        : 'text-[rgba(188,141,152,0.84)]'

  const handleEditStart = useCallback(() => {
    setEditText(text)
    setIsEditing(true)
  }, [text])

  const handleEditSave = useCallback(() => {
    setIsEditing(false)
    onEdit?.(index, editText)
  }, [editText, index, onEdit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleEditSave()
      }
    },
    [handleEditSave]
  )

  const handleActionsEdit = useCallback(() => {
    handleEditStart()
  }, [handleEditStart])

  const handleCopy = useCallback(async () => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      onCopy?.(index)
      toast.success(t('chatActions.copySuccess'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('chatActions.copyFailed'))
    }
  }, [index, onCopy, t, text])

  const handleActionsCopy = useCallback(() => {
    void handleCopy()
  }, [handleCopy])

  const handleActionsRegenerate = useCallback(() => {
    onRegenerate?.(index)
  }, [index, onRegenerate])

  const handleActionsBranch = useCallback(() => {
    onBranch?.(index)
  }, [index, onBranch])

  const handleActionsDelete = useCallback(() => {
    onDelete?.(index)
  }, [index, onDelete])

  const handleActionsContinue = useCallback(() => {
    onContinue?.(index)
  }, [index, onContinue])

  return (
    <article className="ref-transcript-row ref-transcript-row-hoverable">
      <ChatMessageMeta
        formattedTime={formattedTime}
        index={index}
        messageAvatar={messageAvatar}
        messageName={messageName}
        messageType={messageType}
        metaTone={metaTone}
        tokenCount={tokenCount}
      />
      <div className="ref-transcript-body">
        {isEditing ? (
          <div className="grid gap-3">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleEditSave}
              className={cn(
                'w-full whitespace-pre-wrap text-[15px] leading-[1.55] text-[rgba(228,214,189,0.92)] rounded border border-input bg-background px-3 py-2 font-mono',
                messageType === 'character' ? 'italic' : '',
                messageType === 'system' ? 'text-[13px] italic text-[rgba(214,177,102,0.9)]' : '',
              )}
              autoFocus
            />
            <div className="ref-inline-preview-shell">
              <div className="ref-inline-preview-head">{t('chatComposer.preview')}</div>
              <div className="ref-inline-preview-body">
                <MessageContentSegments profile={renderingProfile} text={editText || t('contextTab.emptyMessage')} />
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'whitespace-pre-wrap text-[15px] leading-[1.55] text-[rgba(228,214,189,0.92)]',
              messageType === 'character' ? 'italic' : '',
              messageType === 'system' ? 'font-mono text-[13px] italic text-[rgba(214,177,102,0.9)]' : '',
            )}
          >
            <MessageContentSegments profile={renderingProfile} text={text || t('contextTab.emptyMessage')} />
          </div>
        )}
        <div className="ref-transcript-body-divider" />
      </div>
      {!isEditing && (
        <ChatMessageActions
          actionPending={actionPending}
          isUser={Boolean(message.is_user)}
          isSystem={Boolean(message.is_system)}
          onEdit={handleActionsEdit}
          onRegenerate={handleActionsRegenerate}
          onBranch={handleActionsBranch}
          onDelete={handleActionsDelete}
          onCopy={handleActionsCopy}
          onContinue={handleActionsContinue}
        />
      )}
    </article>
  )
}

export const ChatMessageCard = memo(ChatMessageCardImpl, (prevProps, nextProps) => {
  if (prevProps.actionPending !== nextProps.actionPending) return false
  if (prevProps.characterAvatar !== nextProps.characterAvatar) return false
  if (prevProps.index !== nextProps.index) return false
  if (prevProps.renderingProfile !== nextProps.renderingProfile) return false

  return areMessagesRenderEqual(prevProps.message, nextProps.message)
})

const ChatMessageMeta = memo(function ChatMessageMeta({
  formattedTime,
  index,
  messageAvatar,
  messageName,
  messageType,
  metaTone,
  tokenCount,
}: {
  formattedTime: string
  index: number
  messageAvatar: string | null
  messageName: string
  messageType: 'user' | 'system' | 'character'
  metaTone: string
  tokenCount: number | null
}) {
  return (
    <div className="ref-transcript-meta">
      <span className="ref-transcript-time">{formattedTime}</span>
      <div className={cn('ref-transcript-author', metaTone)}>
        <WorkspaceAvatar
          avatar={messageAvatar}
          className="ref-transcript-avatar !w-24 !h-24"
          fallbackClassName="ref-transcript-avatar-fallback"
          imageClassName="ref-transcript-avatar-image"
          name={messageName}
          size="default"
        />
        <div className="ref-transcript-author-label">
          <span className="ref-transcript-diamond" />
          <span>{messageName}</span>
        </div>
      </div>
      <div className="ref-transcript-count-row">
        <span>#{index + 1}</span>
        {messageType === 'character' && typeof tokenCount === 'number' ? <span>{tokenCount} tok</span> : null}
      </div>
    </div>
  )
})

function resolveMessageAvatar(
  message: ChatMessage,
  messageType: 'user' | 'system' | 'character',
  characterAvatar: string | null
): string | null {
  const extra = message.extra
  const extraAvatar = extra && typeof extra === 'object'
    ? [extra.avatar, extra.original_avatar, extra.force_avatar, extra.character_avatar]
    : []

  for (const candidate of extraAvatar) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate
    }
  }

  if (messageType === 'character' && characterAvatar) {
    return characterAvatar
  }

  return null
}

function areMessagesRenderEqual(prevMessage: ChatMessage, nextMessage: ChatMessage): boolean {
  if (prevMessage === nextMessage) {
    return true
  }

  return (
    prevMessage.name === nextMessage.name
    && prevMessage.is_user === nextMessage.is_user
    && prevMessage.is_system === nextMessage.is_system
    && prevMessage.send_date === nextMessage.send_date
    && getMessageText(prevMessage) === getMessageText(nextMessage)
    && resolveMessageAvatarSignature(prevMessage) === resolveMessageAvatarSignature(nextMessage)
    && resolveMessageTokenCount(prevMessage) === resolveMessageTokenCount(nextMessage)
  )
}

function resolveMessageAvatarSignature(message: ChatMessage): string {
  const extra = message.extra
  if (!extra || typeof extra !== 'object') {
    return ''
  }

  return [
    extra.avatar,
    extra.original_avatar,
    extra.force_avatar,
    extra.character_avatar,
  ]
    .filter((candidate): candidate is string => typeof candidate === 'string' && Boolean(candidate.trim()))
    .join('||')
}

function resolveMessageTokenCount(message: ChatMessage): number | null {
  const extra = message.extra
  if (!extra || typeof extra !== 'object') {
    return null
  }

  const candidates = [extra.token_count, extra.tokenCount, extra.num_tokens]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}
