import heroPng from '@/assets/hero.png'
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

type YggdrasilLogoProps = HTMLAttributes<HTMLSpanElement>

export function YggdrasilLogo({ className, ...props }: YggdrasilLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        className,
      )}
      {...props}
    >
      <img alt="" className="block h-full w-full object-contain" draggable="false" src={heroPng} />
    </span>
  )
}
