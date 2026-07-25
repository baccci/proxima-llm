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
import { DEFAULT_ICON_KEY, type ProjectIconKey } from '@/entities/project/icon'

type IconComponent = React.FC<React.ComponentProps<'svg'>>

// Keyed by ProjectIconKey so adding a key to PROJECT_ICON_KEYS without a matching
// icon here is a compile error. The two lists can no longer drift apart.
const ICON_MAP: Record<ProjectIconKey, IconComponent> = {
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
  if (!key) {
    return ICON_MAP[DEFAULT_ICON_KEY]
  }
  return ICON_MAP[key as ProjectIconKey] ?? ICON_MAP[DEFAULT_ICON_KEY]
}
