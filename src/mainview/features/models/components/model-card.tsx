import type { ModelDTO } from '@shared/schemas/model.schema'
import { formatTokens } from '@utils/format-tokens'
import { cn } from '@utils/tailwind-class-merge'
import { IconBrain } from '@/components/icons/icon-brain'
import { IconEye } from '@/components/icons/icon-eye'
import { IconFileText } from '@/components/icons/icon-file-text'
import { IconGlobe } from '@/components/icons/icon-globe'
import { IconWrench } from '@/components/icons/icon-wrench'
import { Switch } from '@/components/switch'
import { TooltipWrapper } from '@/components/tooltip'
import { modelCompany } from '@/entities/model/company'
import { formatPricing, isFreeModel } from '@/entities/model/pricing'
import { shortModelName } from '@/entities/model/short-name'
import { models } from '@/features/models/models.api'

interface Props {
  model: ModelDTO
}

export function ModelCard({ model }: Props) {
  const free = isFreeModel(model)
  const pricing = formatPricing(model)
  const company = modelCompany(model)
  const context = model.capabilities.contextWindow

  function handleToggle() {
    models.update({ id: model.id, isEnabled: !model.isEnabled })
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-3.5 rounded-xl border transition-colors',
        model.isEnabled
          ? 'border-selected-border bg-surface'
          : 'border-border bg-surface hover:border-border/80',
      )}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground leading-tight truncate">
            {shortModelName(model.displayName)}
          </p>
          <p className="text-2xs text-subtle mt-0.5 truncate">{company}</p>
        </div>

        <Switch
          checked={model.isEnabled}
          onChange={handleToggle}
          aria-label={`Enable ${shortModelName(model.displayName)}`}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-subtle">
          {model.capabilities.thinking && (
            <TooltipWrapper content="Thinking" side="top">
              <IconBrain width={13} />
            </TooltipWrapper>
          )}
          {model.capabilities.vision && (
            <TooltipWrapper content="Vision" side="top">
              <IconEye width={13} />
            </TooltipWrapper>
          )}
          {model.capabilities.pdf && (
            <TooltipWrapper content="PDF" side="top">
              <IconFileText width={13} />
            </TooltipWrapper>
          )}
          {model.capabilities.tools && (
            <TooltipWrapper content="Tools" side="top">
              <IconWrench width={13} />
            </TooltipWrapper>
          )}
          {model.capabilities.webSearch && (
            <TooltipWrapper content="Web search" side="top">
              <IconGlobe width={13} />
            </TooltipWrapper>
          )}
          {context != null && <span className="text-2xs ml-1">{formatTokens(context)} ctx</span>}
        </div>

        <span
          className={cn(
            'text-2xs font-medium px-1.5 py-0.5 rounded-md',
            free
              ? 'bg-success/10 text-success'
              : pricing === '—'
                ? 'bg-surface-hover text-subtle'
                : 'bg-surface-hover text-muted',
          )}
        >
          {pricing}
        </span>
      </div>
    </div>
  )
}
