import { formatTokens } from '@utils/format-tokens'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconBrain } from '@/components/icons/icon-brain'
import { IconEye } from '@/components/icons/icon-eye'
import { IconFileText } from '@/components/icons/icon-file-text'
import { IconGlobe } from '@/components/icons/icon-globe'
import { IconWrench } from '@/components/icons/icon-wrench'
import { TooltipWrapper } from '@/components/tooltip'
import { modelCompany } from '@/entities/model/company'
import { formatPricing, isFreeModel } from '@/entities/model/pricing'
import { shortModelName } from '@/entities/model/short-name'
import { models } from '@/features/models/models.api'
import type { ModelDTO } from '@shared/schemas/model.schema'

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
          ? 'border-brand/40 bg-brand/5'
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

        <button
          type="button"
          role="switch"
          aria-checked={model.isEnabled}
          onClick={handleToggle}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            model.isEnabled ? 'bg-brand' : 'bg-surface-hover',
          )}
        >
          <span
            className={cn(
              'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
              model.isEnabled ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
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
          {context != null && (
            <span className="text-2xs ml-1">{formatTokens(context)} ctx</span>
          )}
        </div>

        <span
          className={cn(
            'text-2xs font-medium px-1.5 py-0.5 rounded-md',
            free
              ? 'bg-emerald-500/10 text-emerald-400'
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
