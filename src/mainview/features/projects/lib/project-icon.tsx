import type React from 'react'
import { IconBanknote } from '@/components/icons/icon-banknote'
import { IconBook } from '@/components/icons/icon-book'
import { IconBot } from '@/components/icons/icon-bot'
import { IconCode } from '@/components/icons/icon-code'
import { IconFlask } from '@/components/icons/icon-flask'
import { IconFolderOpen } from '@/components/icons/icon-folder-open'
import { IconGraduationCap } from '@/components/icons/icon-graduation-cap'
import { IconPalette } from '@/components/icons/icon-palette'
import { IconPlane } from '@/components/icons/icon-plane'
import { IconRocket } from '@/components/icons/icon-rocket'
import { IconSparkles } from '@/components/icons/icon-sparkles'
import { IconSuitcase } from '@/components/icons/icon-suitcase'

type IconComponent = React.FC<React.ComponentProps<'svg'>>

const ICON_MAP: Record<string, IconComponent> = {
  folder: IconFolderOpen,
  suitcase: IconSuitcase,
  banknote: IconBanknote,
  code: IconCode,
  plane: IconPlane,
  palette: IconPalette,
  flask: IconFlask,
  'graduation-cap': IconGraduationCap,
  rocket: IconRocket,
  book: IconBook,
  sparkles: IconSparkles,
  bot: IconBot,
}

export function getProjectIcon(key: string | null | undefined): IconComponent {
  if (!key) return IconFolderOpen
  return ICON_MAP[key] ?? IconFolderOpen
}
