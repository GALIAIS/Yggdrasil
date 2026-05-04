import { memo, useEffect, useState } from 'react'
import { UserRoundIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarSrc } from '@/lib/formatters'
import {
  isTauriDesktop,
  peekTauriAvatarSrcCache,
  resolveTauriAvatarSrc,
  subscribeTauriAvatarSrcInvalidation,
} from '@yggdrasil/api-client'

export interface WorkspaceAvatarProps {
  avatar?: string | null
  name: string
  size?: 'default' | 'sm' | 'lg'
  className?: string
  imageClassName?: string
  fallbackClassName?: string
}

function WorkspaceAvatarImpl({
  avatar,
  name,
  size = 'default',
  className,
  imageClassName,
  fallbackClassName,
}: WorkspaceAvatarProps) {
  const [src, setSrc] = useState<string>(() => resolveInitialAvatarSrc(avatar))
  const [imageFailed, setImageFailed] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    if (!isTauriDesktop()) {
      return
    }

    return subscribeTauriAvatarSrcInvalidation((invalidatedAvatar) => {
      if (!avatar) {
        return
      }

      if (!invalidatedAvatar || invalidatedAvatar === avatar) {
        setRefreshNonce((current) => current + 1)
      }
    })
  }, [avatar])

  useEffect(() => {
    let cancelled = false

    async function resolveAvatar() {
      if (!avatar) {
        setImageFailed(false)
        setSrc('')
        return
      }

      if (!isTauriDesktop()) {
        setImageFailed(false)
        setSrc(getAvatarSrc(avatar))
        return
      }

      try {
        const nextSrc = await resolveTauriAvatarSrc(avatar)
        if (!cancelled) {
          setImageFailed(false)
          setSrc((current) => (current === nextSrc ? current : nextSrc))
        }
      } catch {
        if (!cancelled) {
          setImageFailed(false)
          setSrc('')
        }
      }
    }

    void resolveAvatar()

    return () => {
      cancelled = true
    }
  }, [avatar, refreshNonce])

  return (
    <Avatar className={className} size={size}>
      {src && !imageFailed ? (
        <AvatarImage
          alt={name}
          className={imageClassName}
          src={src}
          onError={() => {
            setImageFailed(true)
            setSrc('')
          }}
        />
      ) : null}
      <AvatarFallback className={fallbackClassName}>
        <UserRoundIcon className="size-[42%]" />
      </AvatarFallback>
    </Avatar>
  )
}

export const WorkspaceAvatar = memo(WorkspaceAvatarImpl)

function resolveInitialAvatarSrc(avatar?: string | null): string {
  if (!avatar) {
    return ''
  }

  if (!isTauriDesktop()) {
    return getAvatarSrc(avatar)
  }

  return peekTauriAvatarSrcCache(avatar)
}
