import { HOOK_ACTION_ID } from '../../../shared-contracts/lifecycle/hook-catalog';
import { runAutoTitle } from '../chat-stream/auto-title';
import * as compactionService from '../compaction.service';
import { regenerateProjectSummary } from '../memory-summary.service';
import { ACTION_TIER, type AnyAction, defineAction, type MemorySummaryContext } from './action';
import { LIFECYCLE_STAGE } from './stages';

// Stable ids are lifted to shared-contracts (the catalog metadata lives there). Re-exported
// under the old name so other bun importers keep working.
export const BUILTIN_ACTION_ID = HOOK_ACTION_ID;

const compactionAction = defineAction({
  id: HOOK_ACTION_ID.compaction,
  stage: LIFECYCLE_STAGE.compaction,
  tier: ACTION_TIER.act,
  run: compactionService.maybeCompact,
});

const autoTitleAction = defineAction({
  id: HOOK_ACTION_ID.autoTitle,
  stage: LIFECYCLE_STAGE.autoTitle,
  tier: ACTION_TIER.act,
  run: runAutoTitle,
});

const memorySummaryAction = defineAction({
  id: HOOK_ACTION_ID.memorySummary,
  stage: LIFECYCLE_STAGE.memorySummary,
  tier: ACTION_TIER.act,
  run: (ctx: MemorySummaryContext) => regenerateProjectSummary(ctx.projectId),
});

// The fixed set of shipped actions, keyed by id. Users/agents select from this; nothing
// outside it runs (no sandbox needed for the catalog path).
export const CATALOG = new Map<string, AnyAction>(
  [compactionAction, autoTitleAction, memorySummaryAction].map((a): [string, AnyAction] => [
    a.id,
    a,
  ]),
);
