# Lifecycle and hook dispatch (`engine/lifecycle/`)

The named points in a chat turn, the retry-and-fallback policy the post-response steps share, and the
dispatch seam that runs registered logic at a stage. This is the source of truth for the layer.

## What it is, in plain language

A chat turn passes through a fixed sequence of moments: the user message is saved, the prompt is built,
the model streams, the reply is saved, and so on. This layer gives each moment a stable **name** (a
stage), so code can say "at the compaction stage" instead of pointing at a line inside `runTurn`. On top
of the names sits a small **dispatch** system: a stage can carry an ordered list of **actions**, and
reaching that stage runs them. The actions are a fixed, built-in set: three always-on core mechanics
(compaction, auto-title, memory-summary) plus four opt-in cues (a completion sound, a completion
notification, an error sound, and an approval-needed sound) a user turns on in Settings. The config only enables or disables shipped
actions; it never runs code the app did not ship.

The layer arrived in three pillars:

- **Stages** (`stages.ts`) — the vocabulary of named moments.
- **The resilient step** (`resilient-step.ts`) — the shared retry-and-fallback policy for the LLM calls
  inside the post-response steps.
- **Dispatch** (`action.ts`, `hook-config.ts`, `catalog.ts`, `dispatch.ts`) — the registry that maps a
  stage to its actions and runs them.

## The pieces

| File | Role |
|---|---|
| [`shared-contracts/lifecycle/`](../../src/shared-contracts/lifecycle/) | The renderer-visible vocabulary and metadata, lifted here so the config surface can name a stage/tier/provenance: `stages.ts`, `action-tier.ts`, `provenance.ts`, `sound.ts`, and `hook-catalog.ts` (`HOOK_ACTION_ID`, `HOOK_CATALOG`, `HOOK_META`, `DEFAULT_HOOK_CONFIG`, `HookConfigEntry` / `HookDetailRow`). |
| [`lifecycle/stages.ts`](../../src/bun/engine/lifecycle/stages.ts) | Re-exports `LIFECYCLE_STAGE` / `LifecycleStage` (the 15 named stages) from shared-contracts. |
| [`lifecycle/resilient-step.ts`](../../src/bun/engine/lifecycle/resilient-step.ts) | `runResilientStep` — the primary-then-fallback LLM retry policy the post-response steps share. |
| [`lifecycle/action.ts`](../../src/bun/engine/lifecycle/action.ts) | The action contract: `ACTION_TIER` (re-exported from shared), the per-stage context types (including `TurnDoneContext` / `TurnErrorContext`), `StageContextMap` / `DispatchStage`, `LifecycleAction` (authoring) and `AnyAction` (storage), `defineAction`, `ActionRegistry`. |
| [`lifecycle/hook-config.ts`](../../src/bun/engine/lifecycle/hook-config.ts) | Re-exports `HookConfigEntry`, `HOOK_PROVENANCE`, and `DEFAULT_HOOK_CONFIG` from shared-contracts (a thin bun-side alias). |
| [`lifecycle/catalog.ts`](../../src/bun/engine/lifecycle/catalog.ts) | `BUILTIN_ACTION_ID` (re-exported from shared `HOOK_ACTION_ID`) and `CATALOG` — the seven shipped actions (three Act core mechanics, four Observe cues), bound to their workflows and ports. |
| [`lifecycle/dispatch.ts`](../../src/bun/engine/lifecycle/dispatch.ts) | `runActions` (the ordered, error-isolated runner), `buildRegistry`, the mutable process-wide `registry` with `rebuildRegistry`, and `dispatchStage`. |
| [`features/hook-config/hook-config.repository.ts`](../../src/bun/features/hook-config/hook-config.repository.ts) | `load` / `setEnabled` / `listDetailed` — the sparse `hook_config` override map over the catalog default. |

## The stages

`stages.ts` declares `LIFECYCLE_STAGE`, an `as const` object of 15 names (`turn-triggered`,
`user-persisted`, `preflight`, `stream-registered`, `context-gathered`, `compaction`, `prompt-built`,
`model-streaming`, `approval-needed`, `stream-finished`, `assistant-saved`, `turn-done`, `auto-title`,
`memory-summary`, `turn-error`), shaped like `STREAM_CHUNK_KIND` so a stage is a checked literal and
renames are compiler-guided. Most stages are reference points with no machinery yet: they exist so a
future hook can attach by name. Six carry dispatch — `compaction`, `auto-title`, and `memory-summary`
(the post-response steps), plus `turn-done`, `turn-error`, and `approval-needed` (which carry the opt-in
completion, error, and approval cues).

## The resilient step

`runResilientStep` is the uniform policy for the LLM call inside each post-response step. It tries a
**primary** model, and if that model's endpoints are dead it falls back to a **known-live** model
(typically the chat's own model, which just answered, so its endpoints are warm). A user cancel or a
timeout aborts without falling back. If every attempt fails it degrades to `null` rather than throwing,
so a failed step never sinks the turn. This is the LLM retry policy that lives *inside* an action; it is
separate from dispatch, which is the per-action error isolation *around* an action. See
[`resilient-step.ts`](../../src/bun/engine/lifecycle/resilient-step.ts).

## Dispatch

At module load, `registry = buildRegistry(DEFAULT_HOOK_CONFIG, CATALOG)` seeds a map from each wired stage
to its ordered list of enabled actions, so dispatch is safe before the DB is up; boot then calls
`rebuildRegistry(hookConfigRepo.load())` to swap in the persisted config. `dispatchStage(stage, ctx)` looks
up that stage's actions and runs them in order through `runActions`, handing each the stage's typed context.

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

The catalog ships **both** tiers. The tier is declared intent that the config surface and a future agent
surface read, and the ground for tier-based gating. Neither tier mutates the in-flight prompt or vetoes
the turn: Block is not a hook tier, and tool blocking stays at the approval gate.

The catalog binds seven built-in actions. Three **Act** core mechanics run their relocated workflows:
`builtin.compaction` runs `compaction.service.maybeCompact`, `builtin.auto-title` runs
`chat-stream/auto-title.runAutoTitle`, and `builtin.memory-summary` runs
`memory-summary.service.regenerateProjectSummary`. Four **Observe** cues sit on the new stages:
`builtin.completion-sound` and `builtin.completion-notification` on `turn-done`, `builtin.error-sound`
on `turn-error`, and `builtin.approval-sound` on `approval-needed`. Each Observe cue is a pure function
of its context that pushes through an injected port: the completion sound plays on every finished turn,
the completion notification fires only when the window is unfocused, the error sound plays on any
failure, and the approval sound plays whenever a tool call needs approval, regardless of focus (see
[Notifications and sounds](#notifications-and-sounds)).

## The config shape and the trust model

The registry is built from a declarative config: a list of `HookConfigEntry`, each
`{ stage, actionId, enabled, provenance, params? }`. `provenance` (from `HOOK_PROVENANCE`: `built-in`,
`user`, `agent`, `imported`) records where an entry came from and shapes a trust model that a future
write surface will enforce, not this code: only `user` (a direct local human edit) may later mint a
raw-command hook; `agent` and `imported` are catalog-only. `params` is reserved and no v1 action reads
it; when an action starts reading `params` it must be safe under any attacker-chosen value, since an
`agent` or `imported` config may set it.

`DEFAULT_HOOK_CONFIG` is derived from the hook catalog, so every shipped action appears with its default
enabled bit. The effective config is that default overlaid with a persisted **sparse override map**: the
`hook_config` KV key (in the settings table) stores only the deviations a user has made, keyed by
`actionId`. Storing just the on/off bit keeps persisted data from ever drifting from a catalog action's
stage, tier, or provenance, and lets a new built-in appear automatically with its default. The `listHooks`
/ `setHook` RPC pair drives the Settings surface; `setHook` writes the override and calls
`rebuildRegistry(hookConfigRepo.load())`, and boot calls the same once the DB is up — so a toggle takes
effect immediately and survives relaunch. Only user-manageable actions are togglable: the three core
mechanics are `userManageable: false`, never listed and never written. The DB stays out of `dispatch.ts`'s
import graph — `rebuildRegistry` takes the config as a parameter and the caller loads it.

## What v1 does not build

So a reader does not go looking for it, v1 deliberately omits: a full hook editor (only on/off toggles
ship, in the Settings → Notifications tab), a command runner or `command` hook type (raw shell or JS
actions), the Block tier, an agent-facing config tool, a durable task queue, and any use of the reserved
`params` field. The three post-response steps kept their behavior when they moved onto dispatch, save one
intended refinement. Because
`runActions` isolates every action, the non-fatal envelope is now uniform: a failure in the compaction
trigger that could previously abort the turn is caught so the turn proceeds on full history, and a
memory-summary regen failure that was previously an unhandled rejection is now a stage-tagged non-fatal
log. Both changes move in the safe direction.

## Notifications and sounds

The `turn-done`, `turn-error`, and `approval-needed` cues reach the user through Bun-side ports the
orchestrator injects into the stage context, so an action never imports a transport:

- **Notification** — [`features/notifications/notification.ts`](../../src/bun/features/notifications/notification.ts)
  calls Electrobun's native `Utils.showNotification` (cross-platform via FFI). It is **silent** — the sound
  cue owns audio, so enabling both does not double up — and the OS handles Do-Not-Disturb. It fires only
  when the window is unfocused, which Bun tracks in `window-focus.ts` from Electrobun `focus`/`blur` events
  wired at boot.
- **Sound** — there are no bundled audio assets. Bun pushes a `playSound` message (`sound-push.ts`) to the
  renderer, and [`mainview/lib/sound-player.ts`](../../src/mainview/lib/sound-player.ts) synthesizes the cue
  with the Web Audio API (a two-note bell for completion, a soft double tap for approval, a lower tone
  for error). WKWebView blocks audio until a user gesture, so the AudioContext resumes on the first
  `pointerdown`.

The completion notification fires only when the window is unfocused; the completion sound, the error
cue, and the approval cue fire regardless of focus. The approval cue is dispatched mid-stream when a
tool call hits the approval gate, not at a turn boundary like the other cues.

## Links

- [chat-bun.md](chat-bun.md) — `runTurn`, which dispatches the `compaction`, `auto-title`, `turn-done`, `turn-error`, and `approval-needed` stages.
- [compaction.md](compaction.md) — the `compaction`-stage action (`maybeCompact`) and the `compact` flow.
- [memory.md](memory.md) — the `memory-summary` action, dispatched out of band on a project-memory write.
- [../architecture.md](../architecture.md) — process model, IPC, DB.
```
