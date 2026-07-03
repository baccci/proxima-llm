import { z } from 'zod'

// The providers the app ships with. Single source of truth: the enum defines the
// values, the type is derived, and PROVIDER_IDS reads the list back. Add a provider
// here and it flows to ModelDTO.provider and every `provider === …` comparison.
export const ProviderId = z.enum(['anthropic', 'openrouter'])
export type ProviderId = z.infer<typeof ProviderId>

export const PROVIDER_IDS = ProviderId.options

export interface ProviderColors {
  accent: string
  foreground: string
}

export interface ProviderMeta {
  id: ProviderId
  label: string
  keyPlaceholder: string
  colors: {
    light: ProviderColors
    dark: ProviderColors
  }
  syncable: boolean
  supportsWebSearch: boolean
}

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-…',
    colors: {
      light: { accent: '#D97757', foreground: '#ffffff' },
      dark: { accent: '#D97757', foreground: '#141415' },
    },
    syncable: false,
    supportsWebSearch: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    keyPlaceholder: 'sk-or-…',
    colors: {
      light: { accent: '#6467F2', foreground: '#ffffff' },
      dark: { accent: '#6467F2', foreground: '#ffffff' },
    },
    syncable: true,
    supportsWebSearch: true,
  },
}

export function getProvider(id: string): ProviderMeta {
  const meta = PROVIDER_META[id as ProviderId]
  if (!meta) throw new Error(`Unknown provider: ${id}`)
  return meta
}

// Non-throwing — custom models can carry a provider outside the registry.
export function providerSupportsWebSearch(id: string): boolean {
  return PROVIDER_META[id as ProviderId]?.supportsWebSearch ?? false
}
