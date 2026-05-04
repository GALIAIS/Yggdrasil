import {
  CopyIcon,
  GitBranchIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import { memo, useState } from 'react'

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

export interface ChatMessageActionsProps {
  actionPending?: boolean
  isUser: boolean
  isSystem: boolean
  onEdit: () => void
  onRegenerate?: () => void
  onBranch?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onContinue?: () => void
}

function ChatMessageActionsImpl({
  actionPending = false,
  isUser,
  isSystem,
  onEdit,
  onRegenerate,
  onBranch,
  onDelete,
  onCopy,
  onContinue,
}: ChatMessageActionsProps) {
  const { t } = useI18n()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  return (
    <>
      <div className="ref-message-actions">
        <Button
          disabled={actionPending}
          size="icon-sm"
          variant="ghost"
          onClick={onEdit}
          title={t('chatActions.edit')}
        >
          <PencilIcon className="h-4 w-4" />
        </Button>

        {!isUser && onRegenerate ? (
          <Button
            disabled={actionPending}
            size="icon-sm"
            variant="ghost"
            onClick={onRegenerate}
            title={t('chatActions.regenerate')}
          >
            <RefreshCwIcon className="h-4 w-4" />
          </Button>
        ) : null}

        {onBranch ? (
          <Button
            disabled={actionPending}
            size="icon-sm"
            variant="ghost"
            onClick={onBranch}
            title={t('chatActions.branch')}
          >
            <GitBranchIcon className="h-4 w-4" />
          </Button>
        ) : null}

        {onDelete ? (
          <Button
            disabled={actionPending}
            size="icon-sm"
            variant="ghost"
            onClick={() => setDeleteDialogOpen(true)}
            title={t('chatActions.delete')}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        ) : null}

        {onCopy ? (
          <Button
            disabled={actionPending}
            size="icon-sm"
            variant="ghost"
            onClick={onCopy}
            title={t('chatActions.copy')}
          >
            <CopyIcon className="h-4 w-4" />
          </Button>
        ) : null}

        {!isUser && !isSystem && onContinue ? (
          <Button
            disabled={actionPending}
            size="icon-sm"
            variant="ghost"
            onClick={onContinue}
            title={t('chatActions.continue')}
          >
            <PlayIcon className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chatActions.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('chatActions.deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionPending}
              onClick={() => {
                onDelete?.()
                setDeleteDialogOpen(false)
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

export const ChatMessageActions = memo(ChatMessageActionsImpl)
