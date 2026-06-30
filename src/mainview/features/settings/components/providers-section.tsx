import { PROVIDERS } from '../constants/providers'
import { ProviderCard } from './provider-card'

export function ProvidersSection() {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Providers</p>
        <p className="text-xs text-subtle mt-0.5">
          Manage API keys and title-model settings for each provider.
        </p>
      </div>
      <div className="space-y-2">
        {PROVIDERS.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </div>
  )
}
