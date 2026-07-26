import type { StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types';
import type { MessageDTO } from '../../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import { LIFECYCLE_STAGE } from './stages';

// The power tier a catalog action declares. Observe: told a stage happened, does a side
// effect (sound, notification, log). Act: runs work that writes state a later stage reads
// (a title, a compaction snapshot, a memory slice). v1 ships an Act-only catalog; the tier
// is declared intent a later editor/agent surface reads, and the ground for tier-based
// gating. Neither tier mutates the in-flight prompt or vetoes the turn (Block is not a hook
// tier; tool blocking stays at the approval gate).
export const ACTION_TIER = {
  observe: 'observe',
  act: 'act',
} as const;
export type ActionTier = (typeof ACTION_TIER)[keyof typeof ACTION_TIER];

// The context each wired stage hands its actions. Distinct per stage because the three
// steps read different inputs. emitChunk and notifyChatsUpdated are injected by the
// orchestrator so an action never imports the webview senders, which would cycle back
// through chat-stream.service.
export type CompactionContext = {
  chatId: string;
  model: ModelDTO;
  apiKey: string;
  history: MessageDTO[];
  requestTimeoutMs: number;
  signal: AbortSignal;
  emitChunk: (chunk: StreamChunk) => void;
};
export type AutoTitleContext = {
  chatId: string;
  model: ModelDTO;
  apiKey: string;
  notifyChatsUpdated: () => void;
};
export type MemorySummaryContext = {
  projectId: string;
};

// The stages that carry dispatch in v1, each mapped to its action context. The other named
// stages in stages.ts are reference points with no dispatch yet; adding a key here is what
// wires a stage. dispatchStage only accepts these keys, so a non-wired stage cannot be
// dispatched by mistake.
export type StageContextMap = {
  [LIFECYCLE_STAGE.compaction]: CompactionContext;
  [LIFECYCLE_STAGE.autoTitle]: AutoTitleContext;
  [LIFECYCLE_STAGE.memorySummary]: MemorySummaryContext;
};
export type DispatchStage = keyof StageContextMap;

// A built-in catalog action: shipped logic bound to one stage. This is the authoring type;
// write an action against it and its run is type-checked against the stage's context.
export type LifecycleAction<S extends DispatchStage> = {
  id: string;
  stage: S;
  tier: ActionTier;
  run: (ctx: StageContextMap[S]) => Promise<void>;
};

// The storage form: the stage param is erased so actions for different stages sit in one
// catalog/registry. run takes any here because the per-stage context is recovered at the
// boundaries. dispatchStage only ever calls it with the matching stage's context (the
// registry groups by stage, and dispatchStage ties the context to the stage key), and
// defineAction's input type keeps authoring sites checked.
export type AnyAction = {
  id: string;
  stage: DispatchStage;
  tier: ActionTier;
  // biome-ignore lint/suspicious/noExplicitAny: erased storage seam, see the type doc above.
  run: (ctx: any) => Promise<void>;
};

// Erase a stage-precise action to the storage form. Identity at runtime; the narrow input
// type is the single place authoring is checked, the wide output is what the catalog holds.
export function defineAction<S extends DispatchStage>(action: LifecycleAction<S>): AnyAction {
  return action;
}

// The dispatch registry: each wired stage to its ordered list of enabled actions.
export type ActionRegistry = Record<DispatchStage, AnyAction[]>;
