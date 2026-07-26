# Lifecycle and hook dispatch (`engine/lifecycle/`)

The named points in a chat turn, the retry-and-fallback policy the post-response steps share, and the
dispatch seam that runs registered logic at a stage. This is the source of truth for the layer.

## What it is, in plain language

A chat turn passes through a fixed sequence of moments: the user message is saved, the prompt is built,
the model streams, the reply is saved, and so on. This layer gives each moment a stable **name** (a
stage), so code can say "at the compaction stage" instead of pointing at a line inside `runTurn`. On top
of the names sits a small **dispatch** system: a stage can carry an ordered list of **actions**, and
reaching that stage runs them. In v1 the actions are a fixed, built-in set (compaction, auto-title,
memory-summary); the system is shaped so a user or agent could later enable or disable them through
config, without ever running code the app did not ship.

The layer arrived in three pillars:

- **Stages** (`stages.ts`) — the vocabulary of named moments.
- **The resilient step** (`resilient-step.ts`) — the shared retry-and-fallback policy for the LLM calls
  inside the post-response steps.
- **Dispatch** (`action.ts`, `hook-config.ts`, `catalog.ts`, `dispatch.ts`) — the registry that maps a
  stage to its actions and runs them.

## The pieces

| File | Role |
|---|---|
| [`lifecycle/stages.ts`](../../src/bun/engine/lifecycle/stages.ts) | `LIFECYCLE_STAGE` — the 14 named stages, plus the `LifecycleStage` union. |
| [`lifecycle/resilient-step.ts`](../../src/bun/engine/lifecycle/resilient-step.ts) | `runResilientStep` — the primary-then-fallback LLM retry policy the post-response steps share. |
| [`lifecycle/action.ts`](../../src/bun/engine/lifecycle/action.ts) | The action contract: `ACTION_TIER`, the per-stage context types, `StageContextMap` / `DispatchStage`, `LifecycleAction` (authoring) and `AnyAction` (storage), `defineAction`, `ActionRegistry`. |
| [`lifecycle/hook-config.ts`](../../src/bun/engine/lifecycle/hook-config.ts) | `HOOK_PROVENANCE`, `HookConfigEntry`, and `DEFAULT_HOOK_CONFIG` — the declarative config and its built-in seed. |
| [`lifecycle/catalog.ts`](../../src/bun/engine/lifecycle/catalog.ts) | `BUILTIN_ACTION_ID` and `CATALOG` — the fixed set of shipped actions, bound to their workflows. |
| [`lifecycle/dispatch.ts`](../../src/bun/engine/lifecycle/dispatch.ts) | `runActions` (the ordered, error-isolated runner), `buildRegistry`, the process-wide `registry`, and `dispatchStage`. |

## The stages

`stages.ts` declares `LIFECYCLE_STAGE`, an `as const` object of 14 names (`turn-triggered`,
`user-persisted`, `preflight`, `stream-registered`, `context-gathered`, `compaction`, `prompt-built`,
`model-streaming`, `stream-finished`, `assistant-saved`, `turn-done`, `auto-title`, `memory-summary`,
`turn-error`), shaped like `STREAM_CHUNK_KIND` so a stage is a checked literal and renames are
compiler-guided. Most stages are reference points with no machinery yet: they exist so a future hook can
attach by name. Only three carry dispatch in v1 — `compaction`, `auto-title`, and `memory-summary` — the
three post-response steps.

## The resilient step

`runResilientStep` is the uniform policy for the LLM call inside each post-response step. It tries a
**primary** model, and if that model's endpoints are dead it falls back to a **known-live** model
(typically the chat's own model, which just answered, so its endpoints are warm). A user cancel or a
timeout aborts without falling back. If every attempt fails it degrades to `null` rather than throwing,
so a failed step never sinks the turn. This is the LLM retry policy that lives *inside* an action; it is
separate from dispatch, which is the per-action error isolation *around* an action. See
[`resilient-step.ts`](../../src/bun/engine/lifecycle/resilient-step.ts).

## Dispatch

At boot, `registry = buildRegistry(DEFAULT_HOOK_CONFIG, CATALOG)` builds a map from each wired stage to
its ordered list of enabled actions. `dispatchStage(stage, ctx)` looks up that stage's actions and runs
them in order through `runActions`, handing each the stage's typed context.

`runActions` isolates errors per action: a thrown action is logged and the next still runs, and the call
resolves even when every action throws (**non-fatal by contract**). Actions are awaited in order, so an
Act action that writes state (a compaction snapshot) has finished before the caller reads it. The context
is injected per stage — the orchestrator hands in `emitChunk`, `notifyChatsUpdated`, and so on — so an
action never imports the webview senders, and the import graph stays acyclic
(`chat-stream.service → dispatch → catalog → { compaction.service, auto-title, memory-summary.service }`,
with no edge back).

`buildRegistry` walks the config in order and skips two kinds of entry: a disabled one, and one whose
`actionId` is not in the catalog (a config from a file or a future agent can name an action this build
does not ship). Each kept action lands in its own stage's bucket, preserving config order.

## The action contract

An action is shipped logic bound to one stage. Two types describe it:

- **`LifecycleAction<S>`** is the authoring type: stage-precise, so its `run` is type-checked against
  that stage's context (`StageContextMap[S]`).
- **`AnyAction`** is the erased storage type: the stage parameter is dropped so actions for different
  stages sit in one catalog and one registry.

`defineAction` is the identity function that narrows the input (checked authoring) and widens the output
(erased storage). It is the single place a stage's context is verified. One documented `any`, on
`AnyAction.run`, is the erasure seam; the two boundaries recover the type (`defineAction` going in,
`dispatchStage` coming out), so there are no casts anywhere else.

Each action declares a **tier** via `ACTION_TIER`:

- **Observe** — told a stage happened, does a side effect (a sound, a notification, a log).
- **Act** — writes state a later stage reads (a title, a compaction snapshot, a memory slice).

v1 ships an **Act-only** catalog. The tier is declared intent that a later editor or agent surface reads,
and the ground for tier-based gating. Neither tier mutates the in-flight prompt or vetoes the turn: Block
is not a hook tier, and tool blocking stays at the approval gate.

The catalog binds three built-in actions to their relocated workflows: `builtin.compaction` runs
`compaction.service.maybeCompact`, `builtin.auto-title` runs `chat-stream/auto-title.runAutoTitle`, and
`builtin.memory-summary` runs `memory-summary.service.regenerateProjectSummary`.

## The config shape and the trust model

The registry is built from a declarative config: a list of `HookConfigEntry`, each
`{ stage, actionId, enabled, provenance, params? }`. `provenance` (from `HOOK_PROVENANCE`: `built-in`,
`user`, `agent`, `imported`) records where an entry came from and shapes a trust model that a future
write surface will enforce, not this code: only `user` (a direct local human edit) may later mint a
raw-command hook; `agent` and `imported` are catalog-only. `params` is reserved and no v1 action reads
it; when an action starts reading `params` it must be safe under any attacker-chosen value, since an
`agent` or `imported` config may set it.

v1 seeds the registry from a code constant, `DEFAULT_HOOK_CONFIG` (the three post-response steps, each
enabled and `built-in`), not from the database. A settings surface that edits and persists this config
comes later; when it lands, the registry rebuilds from the persisted config instead of the constant.

## What v1 does not build

So a reader does not go looking for it, v1 deliberately omits: a hook editor UI, a command runner or
`command` hook type (raw shell or JS actions), the Block tier, an agent-facing config tool, a durable
task queue, and config persistence to the DB. Dispatch is the internal seam only; the three post-response
steps are relocated onto it with their behavior preserved, save one intended refinement. Because
`runActions` isolates every action, the non-fatal envelope is now uniform: a failure in the compaction
trigger that could previously abort the turn is caught so the turn proceeds on full history, and a
memory-summary regen failure that was previously an unhandled rejection is now a stage-tagged non-fatal
log. Both changes move in the safe direction.

## Links

- [chat-bun.md](chat-bun.md) — `runTurn`, which dispatches the `compaction` and `auto-title` stages.
- [compaction.md](compaction.md) — the `compaction`-stage action (`maybeCompact`) and the `compact` flow.
- [memory.md](memory.md) — the `memory-summary` action, dispatched out of band on a project-memory write.
- [../architecture.md](../architecture.md) — process model, IPC, DB.
```
