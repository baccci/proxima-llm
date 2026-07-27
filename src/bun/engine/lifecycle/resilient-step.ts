import { log } from '../../infra/logging/logger';
import type { LifecycleStage } from './stages';

export type ResilientStepArgs<T> = {
  // The lifecycle stage this step belongs to, used to tag the failure logs so a
  // dead-model degrade is observable by stage name.
  stage: LifecycleStage;
  // The cheap picked model (from resolveTitleModel), or null when none resolves.
  primaryModelId: string | null;
  // A known-live model to retry with, supplied by the caller (the chat's own model
  // for in-turn steps). null when the caller has no better model to offer.
  fallbackModelId: string | null;
  // The abort signal the run closes over, when the caller has one (compaction binds
  // the user-cancel + timeout signal here). An aborted signal is the reliable "stop"
  // tell, so it is the primary abort check, matching how the stream engine classifies
  // aborts from the signal rather than the thrown error (see stream-result.ts).
  // Omitted by callers whose LLM call takes no signal.
  signal?: AbortSignal;
  // Runs the actual LLM call with a given model id. The helper decides which id.
  run: (modelId: string) => Promise<T>;
};

// The DOMException names an abort surfaces as: a user cancel ('AbortError') or the
// idle/summary timeout ('TimeoutError'). An abort means stop, so it is never a
// reason to fall back.
const ABORT_ERROR_NAMES = new Set(['AbortError', 'TimeoutError']);

function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('name' in err)) {
    return false;
  }

  return ABORT_ERROR_NAMES.has((err as { name: unknown }).name as string);
}

/**
 * Run one post-response LLM step with a uniform retry/fallback policy, so the three
 * steps that share the cheap title-model picker (auto-title, compaction, memory
 * summary) share one resilience path instead of three ad-hoc try/catch blocks.
 *
 * It tries the primary (cheap) model, then the caller's fallback (a known-live
 * model) once, skipping a null or duplicate id. The first success wins. Any thrown
 * error except an abort triggers the next attempt; an abort rethrows and never falls
 * back. If every attempt fails it logs and returns null, so the caller degrades
 * non-fatally. The result is returned verbatim (an empty string is a value, not a
 * failure); the caller decides whether an empty result is a no-op.
 */
export async function runResilientStep<T>(args: ResilientStepArgs<T>): Promise<T | null> {
  const { stage, primaryModelId, fallbackModelId, signal, run } = args;

  // Ordered, de-duplicated attempt list: primary first, then the fallback only when
  // it is a different model.
  const attempts: string[] = [];
  if (primaryModelId) {
    attempts.push(primaryModelId);
  }
  if (fallbackModelId && fallbackModelId !== primaryModelId) {
    attempts.push(fallbackModelId);
  }

  let lastError: unknown;
  for (const modelId of attempts) {
    try {
      return await run(modelId);
    } catch (err) {
      // Stop means stop: never fall back past an abort. The aborted signal is the
      // primary tell (the engine's own abort test); the name check covers callers
      // that pass no signal.
      if (signal?.aborted || isAbortError(err)) {
        throw err;
      }

      lastError = err;
      log.warn(`Lifecycle step '${stage}' failed on model ${modelId}`, err);
    }
  }

  if (attempts.length > 0) {
    log.error(`Lifecycle step '${stage}' failed after fallback`, lastError);
  }

  return null;
}
