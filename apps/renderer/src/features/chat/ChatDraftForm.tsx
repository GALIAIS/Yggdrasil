import type { FormEvent } from 'react'
import { useRef } from 'react'
import { SparklesIcon, ChevronDownIcon, EyeIcon, InfoIcon, PaperclipIcon, SendHorizontalIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DraftAssistMode } from '@/features/workspace/useWorkbenchState'
import { useI18n } from '@/lib/i18n'
import { AttachmentPicker } from './AttachmentPicker'

export interface ChatDraftFormProps {
  draftMessage: string
  actionPending: boolean
  hasSelectedChat: boolean
  hasChatMessages: boolean
  onDraftChange: (value: string) => void
  onDraftSubmit: (event: FormEvent<HTMLFormElement>) => void
  onResaveClick: () => void
  tokenCount?: number
  onAttach?: () => void
  onAssistDraft?: () => void
  draftAssistMode?: DraftAssistMode
  onDraftAssistModeChange?: (mode: DraftAssistMode) => void
  onPreview?: () => void
  sendMode?: 'send' | 'send-continue' | 'send-as-user-note' | 'send-as-system'
  onSendModeChange?: (mode: string) => void
}

export function ChatDraftForm({
  draftMessage,
  actionPending,
  hasSelectedChat,
  onDraftChange,
  onDraftSubmit,
  tokenCount,
  onAttach,
  onAssistDraft,
  draftAssistMode = 'continue',
  onDraftAssistModeChange,
  onPreview,
  onSendModeChange,
}: ChatDraftFormProps) {
  const { t } = useI18n()
  const attachmentPickerRef = useRef<{ trigger: () => void } | null>(null)

  const handleAttachClick = () => {
    onAttach?.()
    if (onAttach) {
      attachmentPickerRef.current?.trigger()
    }
  }

  const handleSendModeSelect = (mode: string) => {
    onSendModeChange?.(mode)
  }
  const draftAssistLabel = t(`chatComposer.draftModes.${draftAssistMode}`)

  return (
    <>
      <form className="ref-composer" onSubmit={onDraftSubmit}>
        <div className="ref-composer-tab-label">{t('chatComposer.tabs.message')}</div>

        <div className="ref-composer-input-wrap">
          <Textarea
            className="ref-composer-textarea resize-none"
            disabled={actionPending}
            id="draft-message"
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={hasSelectedChat ? t('chatComposer.placeholder.write') : t('chatComposer.placeholder.createFirst')}
            rows={2}
            value={draftMessage}
          />
        </div>

        <div className="ref-composer-toolbar">
          <div className="ref-composer-tools">
            {onAttach ? (
              <Button
                aria-label={t('chatComposer.attach')}
                className="ref-composer-tool"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={handleAttachClick}
              >
                <PaperclipIcon className="size-4" />
              </Button>
            ) : null}
            {onAssistDraft ? (
              <div className="ref-composer-mode-group">
                <Button
                  className="ref-composer-mode"
                  disabled={actionPending}
                  onClick={onAssistDraft}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <SparklesIcon className="size-4" />
                  <span>{`${t('chatComposer.assistDraft')} · ${draftAssistLabel}`}</span>
                </Button>
                {onDraftAssistModeChange ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={t('chatComposer.changeDraftMode')}
                        className="ref-composer-mode-caret"
                        disabled={actionPending}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ChevronDownIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {(
                        [
                          'continue',
                          'expand',
                          'compress',
                          'rewrite_character_voice',
                          'narration_to_dialogue',
                        ] as const
                      ).map((mode) => (
                        <DropdownMenuItem key={mode} onClick={() => onDraftAssistModeChange(mode)}>
                          {t(`chatComposer.draftModes.${mode}`)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="ref-composer-actions">
            <div className="ref-token-readout inline-flex items-center gap-1.5">
              <span>{t('chatComposer.tokens', { count: tokenCount ?? 0 })}</span>
              <InfoIcon className="size-3.5 opacity-60" />
            </div>
            {onPreview ? (
              <Button
                className="ref-preview-button"
                disabled={actionPending}
                type="button"
                variant="outline"
                onClick={onPreview}
              >
                <EyeIcon className="size-4" />
                {t('chatComposer.preview')}
              </Button>
            ) : null}
            <Button className="ref-send-button" disabled={actionPending || !draftMessage.trim()} type="submit">
              <SendHorizontalIcon className="size-4" />
              {actionPending ? t('chat.sending') : t('chat.send')}
            </Button>
            {onSendModeChange ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t('chatComposer.moreSendActions')}
                    className="ref-send-caret"
                    disabled={actionPending}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronDownIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleSendModeSelect('send')}>
                    {t('chatComposer.modes.send')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSendModeSelect('send-continue')}>
                    {t('chatComposer.modes.sendContinue')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSendModeSelect('send-as-user-note')}>
                    {t('chatComposer.modes.sendAsUserNote')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSendModeSelect('send-as-system')}>
                    {t('chatComposer.modes.sendAsSystem')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </form>

      {onAttach ? <AttachmentPicker ref={attachmentPickerRef} onFileSelected={() => {}} /> : null}
    </>
  )
}
