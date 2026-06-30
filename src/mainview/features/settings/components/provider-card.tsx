import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconChevronDown } from '@/components/icons/icon-chevron-down'
import { useApiKeyStatus } from '@/features/settings/hooks/use-settings'
import { useIsDark } from '@/hooks/use-is-dark'
import type { PROVIDERS } from '../constants/providers'
import { ApiKeyRow } from './api-key-row'
import { TitleModelControl } from './title-model-control'

type ProviderDef = (typeof PROVIDERS)[number]

type ProviderCardProps = React.ComponentProps<'div'> & {
  provider: ProviderDef
}

export function ProviderCard({ provider, className, ...props }: ProviderCardProps) {
  const { data } = useApiKeyStatus(provider.id)
  const [expanded, setExpanded] = React.useState(false)

  const isConfigured = data?.configured ?? false
  const isDark = useIsDark()
  const Logo = provider.logo
  const colors = isDark ? provider.colors.dark : provider.colors.light
  const headerBg = isConfigured ? colors.accent : colors.foreground
  const headerFg = isConfigured ? colors.foreground : colors.accent

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl',
        !isConfigured && 'border border-border',
        className,
      )}
      {...props}
    >
      {/* Compact header row — brand-colored, click to toggle. No status here:
          connected/not is shown in the expanded body. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ backgroundColor: headerBg, color: headerFg }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded}
      >
        <Logo width={18} />

        <span className="flex-1 min-w-0 text-sm font-medium">{provider.label}</span>

        {!isConfigured && (
          <span
            style={{ backgroundColor: headerFg, color: headerBg }}
            className="text-xs text-subtle py-0.5 px-1.5 rounded-md"
          >
            Add a key
          </span>
        )}

        <IconChevronDown
          width={14}
          className={cn(
            'shrink-0 opacity-70 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded body — conditionally mounted (no useEffect needed) */}
      {expanded && (
        <div
          className={cn(
            'bg-surface px-4 pb-4 pt-2 flex flex-col gap-3',
            isConfigured && 'rounded-b-2xl border',
          )}
        >
          {!isConfigured && (
            <span className="text-xs text-subtle">Not connected — add a key to enable</span>
          )}

          <ApiKeyRow
            provider={provider.id}
            placeholder={provider.keyPlaceholder}
            accent={colors.accent}
            foreground={colors.foreground}
          />
          <TitleModelControl
            provider={provider.id}
            syncable={provider.syncable}
            accent={colors.accent}
            foreground={colors.foreground}
          />
        </div>
      )}
    </div>
  )
}
