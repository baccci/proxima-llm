import { PROVIDER_IDS, PROVIDER_LOGOS, PROVIDER_META } from '@/entities/provider'

export type { ProviderId } from '@shared/providers/registry'

export const PROVIDERS = PROVIDER_IDS.map((id) => ({
  ...PROVIDER_META[id],
  logo: PROVIDER_LOGOS[id],
}))
