import type { Effort } from '@shared/models/effort'
import type { ModelDTO } from '@shared/schemas/model.schema'
import {
  DropdownContent,
  DropdownItem,
  DropdownPortal,
  DropdownRoot,
  DropdownSeparator,
  DropdownSwitchItem,
  DropdownTrigger,
} from '@/components/dropdown'
import { IconBrain } from '@/components/icons/icon-brain'
import { IconGlobe } from '@/components/icons/icon-globe'
import { IconPaperclip } from '@/components/icons/icon-paperclip'
import { IconPlus } from '@/components/icons/icon-plus'
import { TooltipWrapper } from '@/components/tooltip'
import { EffortSlider } from '@/features/chat/components/effort-slider'
import { getCapabilities } from '@/features/chat/helpers/composer-capabilities'
import { capitalize } from '@/utils/capitalize'

type ComposerAddMenuProps = {
  model: ModelDTO | undefined
  thinking: boolean
  webSearch: boolean
  effort: Effort | null
  disabled?: boolean
  onThinkingChange: (v: boolean) => void
  onWebSearchChange: (v: boolean) => void
  onEffortChange: (v: Effort | null) => void
  onAttachClick: () => void
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
}: ComposerAddMenuProps) {
  const { canThink, canVision, canPdf, canBrowse } = getCapabilities(model)
  const canAttach = canVision || canPdf

  const efforts = model?.capabilities.efforts ?? []
  const mandatory = model?.capabilities.reasoningMandatory ?? false
  // A mandatory model reasons whether or not the local flag is on, so treat it as on.
  const thinkingOn = thinking || mandatory
  const showSlider = canThink && thinkingOn && efforts.length >= 2
  // Effort is concrete while thinking is on (the composer sets it); fall back to the middle
  // stop only as a display safety net so the slider always has a valid thumb.
  const selectedEffort = efforts.find((e) => e === effort) ?? null
  const sliderValue = selectedEffort ?? efforts[Math.floor((efforts.length - 1) / 2)]

  return (
    <DropdownRoot>
      <DropdownTrigger
        disabled={disabled}
        className="flex items-center justify-center h-8 w-8 rounded-full text-subtle hover:bg-surface-hover hover:text-foreground data-popup-open:bg-surface-hover data-popup-open:text-foreground transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconPlus width={15} />
      </DropdownTrigger>

      <DropdownPortal>
        <DropdownContent side="top" align="start" className="min-w-58">
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

          {canThink &&
            (mandatory ? (
              <TooltipWrapper content="Required by this model" side="top">
                <DropdownSwitchItem checked disabled icon={<IconBrain width={14} />}>
                  Think
                </DropdownSwitchItem>
              </TooltipWrapper>
            ) : (
              <DropdownSwitchItem
                checked={thinking}
                onCheckedChange={onThinkingChange}
                icon={<IconBrain width={14} />}
              >
                Think
              </DropdownSwitchItem>
            ))}

          {showSlider && (
            <>
              <DropdownSeparator />
              <div className="px-2.5 py-3">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm text-foreground">Effort</span>
                  <span className="text-sm text-subtle">{capitalize(sliderValue)}</span>
                </div>
                <EffortSlider levels={efforts} value={sliderValue} onChange={onEffortChange} />
              </div>
            </>
          )}
        </DropdownContent>
      </DropdownPortal>
    </DropdownRoot>
  )
}
