import { HOOK_ACTION_ID } from '@shared/lifecycle/hook-catalog'
import { SOUND_ID } from '@shared/lifecycle/sound'
import { runAutoTitle } from '../chat-stream/auto-title'
import * as compactionService from '../compaction.service'
import { regenerateProjectSummary } from '../memory-summary.service'
import {
  ACTION_TIER,
  type AnyAction,
  type ApprovalNeededContext,
  defineAction,
  type MemorySummaryContext,
  type TurnDoneContext,
  type TurnErrorContext,
} from './action'
import { LIFECYCLE_STAGE } from './stages'

// Stable ids are lifted to shared-contracts (the catalog metadata lives there). Re-exported
// under the old name so other bun importers keep working.
export const BUILTIN_ACTION_ID = HOOK_ACTION_ID

const compactionAction = defineAction({
  id: HOOK_ACTION_ID.compaction,
  stage: LIFECYCLE_STAGE.compaction,
  tier: ACTION_TIER.act,
  run: compactionService.maybeCompact,
})

const autoTitleAction = defineAction({
  id: HOOK_ACTION_ID.autoTitle,
  stage: LIFECYCLE_STAGE.autoTitle,
  tier: ACTION_TIER.act,
  run: runAutoTitle,
})

const memorySummaryAction = defineAction({
  id: HOOK_ACTION_ID.memorySummary,
  stage: LIFECYCLE_STAGE.memorySummary,
  tier: ACTION_TIER.act,
  run: (ctx: MemorySummaryContext) => regenerateProjectSummary(ctx.projectId),
})

const completionSoundAction = defineAction({
  id: HOOK_ACTION_ID.completionSound,
  stage: LIFECYCLE_STAGE.turnDone,
  tier: ACTION_TIER.observe,
  run: async (ctx: TurnDoneContext) => {
    // Play on every finished turn, focused or not, so the cue is a reliable "reply is ready".
    ctx.playSound(SOUND_ID.completion)
  },
})

const completionNotificationAction = defineAction({
  id: HOOK_ACTION_ID.completionNotification,
  stage: LIFECYCLE_STAGE.turnDone,
  tier: ACTION_TIER.observe,
  run: async (ctx: TurnDoneContext) => {
    if (ctx.isWindowFocused()) {
      return
    }
    // Silent: the completion-sound hook owns audio, so both on does not double up.
    ctx.showNotification({ title: ctx.chatTitle, body: 'Your reply is ready.' })
  },
})

const errorSoundAction = defineAction({
  id: HOOK_ACTION_ID.errorSound,
  stage: LIFECYCLE_STAGE.turnError,
  tier: ACTION_TIER.observe,
  run: async (ctx: TurnErrorContext) => {
    // Always: a failure is worth hearing even while looking at the window.
    ctx.playSound(SOUND_ID.error)
  },
})

const approvalSoundAction = defineAction({
  id: HOOK_ACTION_ID.approvalSound,
  stage: LIFECYCLE_STAGE.approvalNeeded,
  tier: ACTION_TIER.observe,
  run: async (ctx: ApprovalNeededContext) => {
    // Always: the turn is blocked waiting on the user, worth hearing even with the window focused.
    ctx.playSound(SOUND_ID.approval)
  },
})

// The fixed set of shipped actions, keyed by id. Users/agents select from this; nothing
// outside it runs (no sandbox needed for the catalog path).
export const CATALOG = new Map<string, AnyAction>(
  [
    compactionAction,
    autoTitleAction,
    memorySummaryAction,
    completionSoundAction,
    completionNotificationAction,
    errorSoundAction,
    approvalSoundAction,
  ].map((a): [string, AnyAction] => [a.id, a]),
)
