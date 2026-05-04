import { type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

import backupsSvg from '../../../../../fontawesome/svgs/solid/database.svg?raw'
import charactersSvg from '../../../../../fontawesome/svgs/solid/users.svg?raw'
import extensionsSvg from '../../../../../fontawesome/svgs/solid/puzzle-piece.svg?raw'
import groupsSvg from '../../../../../fontawesome/svgs/solid/people-group.svg?raw'
import librarySvg from '../../../../../fontawesome/svgs/solid/books.svg?raw'
import logsSvg from '../../../../../fontawesome/svgs/solid/file-lines.svg?raw'
import lorebooksSvg from '../../../../../fontawesome/svgs/solid/book-open-reader.svg?raw'
import presetsSvg from '../../../../../fontawesome/svgs/solid/sliders.svg?raw'
import projectsSvg from '../../../../../fontawesome/svgs/solid/diagram-project.svg?raw'
import recentlyUsedSvg from '../../../../../fontawesome/svgs/solid/clock-rotate-left.svg?raw'
import sessionsSvg from '../../../../../fontawesome/svgs/solid/messages.svg?raw'
import settingsSvg from '../../../../../fontawesome/svgs/solid/gear.svg?raw'
import providersSvg from '../../../../../fontawesome/svgs/solid/server.svg?raw'
import storySvg from '../../../../../fontawesome/svgs/solid/scroll-old.svg?raw'
import tavernSvg from '../../../../../fontawesome/svgs/solid/beer-mug.svg?raw'
import templatesSvg from '../../../../../fontawesome/svgs/solid/table-cells-large.svg?raw'
import assetsSvg from '../../../../../fontawesome/svgs/solid/image.svg?raw'
import aboutSvg from '../../../../../fontawesome/svgs/solid/circle-info.svg?raw'

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
