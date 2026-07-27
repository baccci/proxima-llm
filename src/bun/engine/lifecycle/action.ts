import { ACTION_TIER, type ActionTier } from '../../../shared-contracts/lifecycle/action-tier';
import type { SoundId } from '../../../shared-contracts/lifecycle/sound';
import type { StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types';
import type { MessageDTO } from '../../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import { LIFECYCLE_STAGE } from './stages';

// The power-tier vocabulary is lifted to shared-contracts (the config surface names a tier).
// Re-exported here so the bun lifecycle layer keeps importing it from `./action`.
export { ACTION_TIER, type ActionTier };

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

// A finished turn. The completion sound and notification actions read window focus and push
// through injected ports (never imported, to keep the action decoupled from the senders).
export type TurnDoneContext = {
  chatId: string;
  chatTitle: string;
  isWindowFocused: () => boolean;
  showNotification: (opts: { title: string; body?: string }) => void;
  playSound: (sound: SoundId) => void;
};

// A failed turn. The error sound plays regardless of focus, so this context is minimal.
export type TurnErrorContext = {
  chatId: string;
  playSound: (sound: SoundId) => void;
};

// The stages that carry dispatch, each mapped to its action context. The other named stages
// in stages.ts are reference points with no dispatch yet; adding a key here is what wires a
// stage. dispatchStage only accepts these keys, so a non-wired stage cannot be dispatched by
// mistake.
export type StageContextMap = {
  [LIFECYCLE_STAGE.compaction]: CompactionContext;
  [LIFECYCLE_STAGE.autoTitle]: AutoTitleContext;
  [LIFECYCLE_STAGE.memorySummary]: MemorySummaryContext;
  [LIFECYCLE_STAGE.turnDone]: TurnDoneContext;
  [LIFECYCLE_STAGE.turnError]: TurnErrorContext;
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
