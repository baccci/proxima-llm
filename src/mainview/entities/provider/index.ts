import type { ProviderId } from '@shared/providers/registry'
import type React from 'react'
import { IconAnthropic } from '@/components/icons/icon-anthropic'
import { IconOpenrouter } from '@/components/icons/icon-openrouter'

export type { ProviderId, ProviderMeta } from '@shared/providers/registry'
export { getProvider, PROVIDER_IDS, PROVIDER_META } from '@shared/providers/registry'

type IconComponent = React.FC<React.ComponentProps<'svg'>>

export const PROVIDER_LOGOS: Record<ProviderId, IconComponent> = {
  anthropic: IconAnthropic,
  openrouter: IconOpenrouter,
}

export function providerLogo(id: ProviderId): IconComponent {
  return PROVIDER_LOGOS[id]
}
