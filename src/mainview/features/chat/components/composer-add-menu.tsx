import { effortLevelsForModel } from '@shared/models/effort'
import type { ModelDTO } from '@shared/schemas/model.schema'
import {
  DropdownContent,
  DropdownItem,
  DropdownPortal,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownSubmenuRoot,
  DropdownSubmenuTrigger,
  DropdownSwitchItem,
  DropdownTrigger,
} from '@/components/dropdown'
import { IconBrain } from '@/components/icons/icon-brain'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { IconGlobe } from '@/components/icons/icon-globe'
import { IconPaperclip } from '@/components/icons/icon-paperclip'
import { IconPlus } from '@/components/icons/icon-plus'
import {
  supportsPdf,
  supportsThinking,
  supportsVision,
  supportsWebSearch,
} from '@/entities/model/capabilities'

interface Props {
  model: ModelDTO | undefined
  thinking: boolean
  webSearch: boolean
  effort: string | null
  disabled?: boolean
  onThinkingChange: (v: boolean) => void
  onWebSearchChange: (v: boolean) => void
  onEffortChange: (v: string | null) => void
  onAttachClick: () => void
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ComposerAddMenu({
  model,
  thinking,
  webSearch,
  effort,
  disabled,
  onThinkingChange,
  onWebSearchChange,
  onEffortChange,
  onAttachClick,
}: Props) {
  const canThink = model ? supportsThinking(model) : false
  const canVision = model ? supportsVision(model) : false
  const canPdf = model ? supportsPdf(model) : false
  const canAttach = canVision || canPdf
  const canBrowse = model ? supportsWebSearch(model) : false
  const levels = model ? effortLevelsForModel(model) : []
  const hasEffortOptions = levels.length > 0

  return (
    <DropdownRoot>
      <DropdownTrigger
        disabled={disabled}
        className="flex items-center justify-center h-8 w-8 rounded-full text-subtle hover:bg-surface-hover hover:text-foreground data-popup-open:bg-surface-hover data-popup-open:text-foreground transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconPlus width={15} />
      </DropdownTrigger>

      <DropdownPortal>
        <DropdownContent side="top" align="start">
          {canAttach && (
            <DropdownItem icon={<IconPaperclip width={14} />} onClick={onAttachClick}>
              Attach files…
            </DropdownItem>
          )}

          {(canBrowse || canThink) && canAttach && <DropdownSeparator />}

          {canBrowse && (
            <DropdownSwitchItem
              checked={webSearch}
              onCheckedChange={onWebSearchChange}
              icon={<IconGlobe width={14} />}
            >
              Browse
            </DropdownSwitchItem>
          )}

          {canThink && (
            <DropdownSwitchItem
              checked={thinking}
              onCheckedChange={onThinkingChange}
              icon={<IconBrain width={14} />}
            >
              Think
            </DropdownSwitchItem>
          )}

          {canThink && hasEffortOptions && (
            <DropdownSubmenuRoot>
              <DropdownSubmenuTrigger
                disabled={!thinking}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground cursor-pointer select-none hover:bg-surface-hover data-highlighted:bg-surface-hover transition-colors outline-none data-disabled:opacity-40 data-disabled:pointer-events-none"
              >
                <span className="flex h-4 w-4 shrink-0" />
                <span className="flex-1">
                  Effort
                  {effort ? <span className="ml-1 text-subtle">· {capitalize(effort)}</span> : null}
                </span>
                <IconChevronRight width={12} className="text-subtle" />
              </DropdownSubmenuTrigger>

              <DropdownPortal>
                <DropdownContent side="right" align="start">
                  <DropdownRadioGroup value={effort} onValueChange={onEffortChange}>
                    <DropdownRadioItem value={null}>Default</DropdownRadioItem>
                    {levels.map((level) => (
                      <DropdownRadioItem key={level} value={level}>
                        {capitalize(level)}
                      </DropdownRadioItem>
                    ))}
                  </DropdownRadioGroup>
                </DropdownContent>
              </DropdownPortal>
            </DropdownSubmenuRoot>
          )}
        </DropdownContent>
      </DropdownPortal>
    </DropdownRoot>
  )
}
