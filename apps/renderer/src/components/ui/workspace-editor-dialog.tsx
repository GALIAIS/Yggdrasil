import * as React from 'react'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface WorkspaceEditorDialogProps {
  bodyClassName?: string
  children: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  onOpenChange: (open: boolean) => void
  open: boolean
  showCloseButton?: boolean
  style?: React.CSSProperties
  title: React.ReactNode
}

export function WorkspaceEditorDialog({
  bodyClassName,
  children,
  description,
  footer,
  onOpenChange,
  open,
  showCloseButton = false,
  style,
  title,
}: WorkspaceEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-none rounded-sm border-[rgba(194,154,89,0.18)] bg-[rgba(17,13,10,0.98)] p-0 text-stone-100 sm:max-w-none"
        showCloseButton={false}
        style={style}
      >
        <DialogHeader className="border-b border-[rgba(194,154,89,0.12)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </div>
            {showCloseButton ? (
              <Button
                aria-label="Close"
                className="shrink-0 rounded-sm"
                onClick={() => onOpenChange(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-[rgba(194,154,89,0.12)] bg-[rgba(18,14,11,0.94)] px-5 py-4">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
