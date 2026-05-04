import { type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

import backupsSvg from '@/assets/icons/fontawesome/solid/database.svg?raw'
import charactersSvg from '@/assets/icons/fontawesome/solid/users.svg?raw'
import extensionsSvg from '@/assets/icons/fontawesome/solid/puzzle-piece.svg?raw'
import groupsSvg from '@/assets/icons/fontawesome/solid/people-group.svg?raw'
import librarySvg from '@/assets/icons/fontawesome/solid/books.svg?raw'
import logsSvg from '@/assets/icons/fontawesome/solid/file-lines.svg?raw'
import lorebooksSvg from '@/assets/icons/fontawesome/solid/book-open-reader.svg?raw'
import presetsSvg from '@/assets/icons/fontawesome/solid/sliders.svg?raw'
import projectsSvg from '@/assets/icons/fontawesome/solid/diagram-project.svg?raw'
import recentlyUsedSvg from '@/assets/icons/fontawesome/solid/clock-rotate-left.svg?raw'
import sessionsSvg from '@/assets/icons/fontawesome/solid/messages.svg?raw'
import settingsSvg from '@/assets/icons/fontawesome/solid/gear.svg?raw'
import providersSvg from '@/assets/icons/fontawesome/solid/server.svg?raw'
import storySvg from '@/assets/icons/fontawesome/solid/scroll-old.svg?raw'
import tavernSvg from '@/assets/icons/fontawesome/solid/beer-mug.svg?raw'
import templatesSvg from '@/assets/icons/fontawesome/solid/table-cells-large.svg?raw'
import assetsSvg from '@/assets/icons/fontawesome/solid/image.svg?raw'
import aboutSvg from '@/assets/icons/fontawesome/solid/circle-info.svg?raw'

type IconProps = HTMLAttributes<HTMLSpanElement>

function FontAwesomeIcon({ className, svg, ...props }: IconProps & { svg: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center align-middle [&_svg]:block [&_svg]:size-full [&_svg]:fill-current',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
      {...props}
    />
  )
}

export function FaTavernIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={tavernSvg} />
}

export function FaSessionsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={sessionsSvg} />
}

export function FaTemplatesIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={templatesSvg} />
}

export function FaLibraryIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={librarySvg} />
}

export function FaRecentlyUsedIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={recentlyUsedSvg} />
}

export function FaCharactersIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={charactersSvg} />
}

export function FaLorebooksIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={lorebooksSvg} />
}

export function FaStoryIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={storySvg} />
}

export function FaProjectsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={projectsSvg} />
}

export function FaPresetsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={presetsSvg} />
}

export function FaAssetsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={assetsSvg} />
}

export function FaGroupsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={groupsSvg} />
}

export function FaExtensionsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={extensionsSvg} />
}

export function FaBackupsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={backupsSvg} />
}

export function FaLogsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={logsSvg} />
}

export function FaSettingsIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={settingsSvg} />
}

export function FaProvidersIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={providersSvg} />
}

export function FaAboutIcon(props: IconProps) {
  return <FontAwesomeIcon {...props} svg={aboutSvg} />
}
