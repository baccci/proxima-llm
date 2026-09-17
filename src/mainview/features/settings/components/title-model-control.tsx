import { isFreeModel } from '@shared/models/pricing'
import type { ModelDTO } from '@shared/schemas/model.schema'
import { TitleMode } from '@shared/schemas/settings.schema'
import { useMutation } from '@tanstack/react-query'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import {
  DropdownContent,
  DropdownGroup,
  DropdownItem,
  DropdownPortal,
  DropdownRoot,
  DropdownTrigger,
} from '@/components/dropdown'
import { IconAlertTriangle } from '@/components/icons/icon-alert-triangle'
import { IconChevronDown } from '@/components/icons/icon-chevron-down'
import { IconRotateCcw } from '@/components/icons/icon-rotate-ccw'
import { Spinner } from '@/components/spinner'
import { Switch } from '@/components/switch'
import { models } from '@/features/models/models.api'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { settings } from '@/features/settings/settings.api'
import { useModels } from '@/hooks/use-models'
import type { ProviderId } from '../constants/providers'

type TitleModelControlProps = {
  provider: ProviderId
  syncable: boolean
  accent?: string
  foreground?: string
}

export function TitleModelControl({
  provider,
  syncable,
  accent,
  foreground,
}: TitleModelControlProps) {
  const { data: currentSettings } = useSettings()
  const { data: allModels = [] } = useModels()

  // Enabled models for this provider, cheapest-first
  const providerModels = React.useMemo(() => {
    return allModels
      .filter((m) => m.provider === provider && m.isEnabled)
      .sort((a, b) => (a.pricing?.prompt ?? 0) - (b.pricing?.prompt ?? 0))
  }, [allModels, provider])

  const cfg = currentSettings?.titleModels?.[provider]
  const isCustom = cfg?.mode === TitleMode.enum.custom
  const selectedModelId = cfg?.modelId ?? null

  // Auto resolves to the cheapest NON-free model (matches the backend resolver)
  const autoPick = providerModels.find((m) => !isFreeModel(m))
  const selectedModel = providerModels.find((m) => m.id === selectedModelId)
  const selectedIsFree = selectedModel != null && isFreeModel(selectedModel)

  const syncMutation = useMutation({
    mutationFn: () => models.syncModels(),
  })

  function toggleMode() {
    settings.update({
      titleModels: {
        ...(currentSettings?.titleModels ?? {}),
        [provider]: {
          mode: isCustom ? TitleMode.enum.auto : TitleMode.enum.custom,
          modelId: selectedModelId,
        },
      },
    })
  }

  function setModelId(modelId: string) {
    settings.update({
      titleModels: {
        ...(currentSettings?.titleModels ?? {}),
        [provider]: { mode: TitleMode.enum.custom, modelId },
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Title model</p>
        {syncable && (
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-1.5 text-xs text-subtle hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Resync models"
          >
            {syncMutation.isPending ? (
              <Spinner width={12} className="size-3" />
            ) : (
              <IconRotateCcw width={12} />
            )}
            Resync
          </button>
        )}
      </div>

      {/* Auto ↔ Custom switch */}
      <div className="flex items-center gap-2.5">
        <span className={cn('text-sm', isCustom ? 'text-subtle' : 'text-foreground')}>Auto</span>
        <Switch
          checked={isCustom}
          onChange={toggleMode}
          activeColor={accent}
          thumbColor={foreground}
          aria-label="Use a custom title model"
        />
        <span className={cn('text-sm', isCustom ? 'text-foreground' : 'text-subtle')}>Custom</span>
        {!isCustom && autoPick && (
          <span className="ml-1 text-xs text-subtle truncate">({autoPick.displayName})</span>
        )}
      </div>

      {/* Model dropdown, only in Custom mode */}
      {isCustom && (
        <div className="space-y-2">
          {providerModels.length === 0 && (
            <p className="text-xs text-subtle">No enabled models for this provider.</p>
          )}

          {providerModels.length > 0 && (
            <DropdownRoot>
              <DropdownTrigger className="flex items-center gap-2 h-8 px-3 w-full rounded-lg border border-border bg-surface text-sm text-foreground hover:bg-surface-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex-1 text-left truncate">
                  {selectedModel?.displayName ?? 'Select a model'}
                </span>
                <IconChevronDown width={13} className="text-subtle shrink-0" />
              </DropdownTrigger>
              <DropdownPortal>
                <DropdownContent side="bottom" align="start" elevated>
                  <DropdownGroup>
                    {providerModels.map((m) => (
                      <DropdownItem key={m.id} onClick={() => setModelId(m.id)}>
                        <div className="flex items-center justify-between w-full gap-2 min-w-0">
                          <span className="truncate min-w-0">{m.displayName}</span>
                          <ModelBadge model={m} isAutoPick={m.id === autoPick?.id} />
                        </div>
                      </DropdownItem>
                    ))}
                  </DropdownGroup>
                </DropdownContent>
              </DropdownPortal>
            </DropdownRoot>
          )}

          {selectedIsFree && (
            <p className="flex items-start gap-1.5 text-xs" style={{ color: accent }}>
              <IconAlertTriangle width={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>Free models may be deactivated by the provider without notice.</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

type ModelBadgeProps = {
  model: ModelDTO
  isAutoPick: boolean
}

// Trailing badge on a model row: "Free" for free models, "$" on the cheapest paid pick
// (the one Auto resolves to), nothing otherwise.
function ModelBadge({ model, isAutoPick }: ModelBadgeProps) {
  if (isFreeModel(model)) {
    return <span className="shrink-0 text-2xs text-subtle uppercase tracking-wider">Free</span>
  }

  if (isAutoPick) {
    return <span className="shrink-0 text-2xs text-subtle font-mono">$</span>
  }

  return null
}
