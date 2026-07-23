import { formatTokens } from '@utils/format-tokens'
import React from 'react'
import {
  DropdownContent,
  DropdownGroup,
  DropdownItem,
  DropdownPortal,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/dropdown'
import { IconBrain } from '@/components/icons/icon-brain'
import { IconChevronDown } from '@/components/icons/icon-chevron-down'
import { IconEye } from '@/components/icons/icon-eye'
import { IconFileText } from '@/components/icons/icon-file-text'
import { IconGlobe } from '@/components/icons/icon-globe'
import { modal } from '@/components/modal/modal-store'
import { TooltipWrapper } from '@/components/tooltip'
import { groupByFamily } from '@/entities/model/capabilities'
import { shortModelName } from '@/entities/model/short-name'
import { MARKETPLACE_MODAL_ID } from '@/features/models/components/marketplace.constants'
import { useModels } from '@/features/models/hooks/use-models'

type ModelSwitcherProps = {
  modelId: string | null
  onChange: (modelId: string) => void
  disabled?: boolean
  usedTokens?: number
  cachedFraction?: number
  effort?: string | null
}

export function ModelSwitcher({
  modelId,
  onChange,
  disabled,
  usedTokens,
  cachedFraction,
  effort,
}: ModelSwitcherProps) {
  const { data: allModels = [] } = useModels()
  const enabled = allModels.filter((m) => m.isEnabled)
  const groups = groupByFamily(enabled)

  const selected = allModels.find((m) => m.id === modelId)
  const baseName = selected ? shortModelName(selected.displayName) : 'Select model'
  const effortLabel = effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : null
  const limit = selected?.capabilities.contextWindow ?? null
  const used = usedTokens ?? 0

  return (
    <DropdownRoot>
      <DropdownTrigger
        disabled={disabled}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-transparent text-foreground hover:bg-surface-hover hover:text-foreground data-popup-open:bg-surface-hover data-popup-open:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium">{baseName}</span>
        {effortLabel && <span className="opacity-60 font-medium">{effortLabel}</span>}
        <IconChevronDown width={13} className="text-subtle" />
      </DropdownTrigger>

      <DropdownPortal>
        <DropdownContent side="top" align="start">
          {/* Non-interactive current-model header */}
          <div className="mx-0 mb-3 px-2.5 py-2 rounded-lg border border-border cursor-default select-none">
            <p className="text-2xs font-semibold text-subtle uppercase tracking-wider">
              Current model
            </p>
            <p className="mt-0.5 text-sm text-foreground truncate">
              {selected?.displayName ?? 'No model selected'}
            </p>
            {limit != null && (
              <p className="mt-0.5 text-2xs text-subtle">
                {formatTokens(used)} / {formatTokens(limit)}
                {cachedFraction != null && cachedFraction > 0 && (
                  <> · {Math.round(cachedFraction * 100)}% cached</>
                )}
              </p>
            )}
          </div>

          {Array.from(groups.entries()).map(([family, models], i) => (
            <React.Fragment key={family}>
              {i > 0 && <DropdownSeparator />}
              <DropdownGroup label={family.charAt(0).toUpperCase() + family.slice(1)}>
                {models.map((m) => (
                  <DropdownItem key={m.id} onClick={() => onChange(m.id)}>
                    <div className="flex items-center gap-1.5 min-w-0 w-full overflow-hidden">
                      <span className="truncate min-w-0">{shortModelName(m.displayName)}</span>
                      <span className="shrink-0 flex gap-1 ml-auto text-subtle">
                        {m.capabilities.thinking && (
                          <TooltipWrapper content="Thinking" side="top">
                            <IconBrain width={11} />
                          </TooltipWrapper>
                        )}
                        {m.capabilities.vision && (
                          <TooltipWrapper content="Vision" side="top">
                            <IconEye width={11} />
                          </TooltipWrapper>
                        )}
                        {m.capabilities.pdf && (
                          <TooltipWrapper content="PDF" side="top">
                            <IconFileText width={11} />
                          </TooltipWrapper>
                        )}
                        {m.capabilities.webSearch && (
                          <TooltipWrapper content="Web search" side="top">
                            <IconGlobe width={11} />
                          </TooltipWrapper>
                        )}
                      </span>
                    </div>
                  </DropdownItem>
                ))}
              </DropdownGroup>
            </React.Fragment>
          ))}

          <DropdownSeparator />
          <DropdownItem onClick={() => modal.open(MARKETPLACE_MODAL_ID)}>
            <span className="text-subtle">Manage models…</span>
          </DropdownItem>
        </DropdownContent>
      </DropdownPortal>
    </DropdownRoot>
  )
}
