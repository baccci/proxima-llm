# The stream engine (`src/bun/engine/stream/`)

How one LLM turn is streamed: prompt assembly, the tool gate, the delta loop, abort handling, and usage.
This is the source of truth for the layer.

## What this layer is

`engine/stream/` is the **behavior of a single model turn**: take a chat's history, produce an assistant
reply, stream it out chunk by chunk. It owns **no lifecycle**: it never touches SQLite, the stream
registry, compaction, or retry/cancel bookkeeping. That is the caller's job
([`engine/chat-stream/chat-stream.service.ts`](../../src/bun/engine/chat-stream/chat-stream.service.ts)),
which persists messages, tracks in-flight streams, and calls in here.

The one entry point is `runStream(opts)` in [`run.ts`](../../src/bun/engine/stream/run.ts). It returns
`{ parts, usage, stopReason? }` and pushes live fragments through the `onChunk` callback it is handed.
Everything else in the folder is a piece `run.ts` composes.

## The files

| File | Role | Side of the turn |
|---|---|---|
| `build-prompt.ts` | `buildSystem` (assemble the system prompt) + `toCoreMessages` (map stored history to provider messages) | **input** |
| `gate-tools.ts` | `buildGatedTools` — wrap each tool's `execute` with the permission gate | **input** (tools) |
| `run.ts` | `runStream` — orchestrate the one `streamText` call and its finish | **orchestration** |
| `idle-timeout.ts` | `createIdleTimeout` — the stall watchdog: an armed `AbortController` plus a resettable timer, handed back as `{ signal, reset, clear }` | **orchestration** (helper) |
| `consume-stream.ts` | `consumeStream` — drain the SDK delta stream into live chunks plus the accumulator | **orchestration** (helper) |
| `stream-accumulator.ts` | `createStreamAccumulator` — fold the delta stream into the final `parts` | **output** (state) |
| `stream-result.ts` | `classifyAbort` + `extractUsage` (+ `IDLE_TIMEOUT_ERROR_NAME`) | **output** (interpret) |

`run.ts` composes the rest, and nothing imports `run.ts`. Within the folder the two orchestration helpers
lean on one neighbor each: `consume-stream.ts` takes the `StreamAccumulator` type from
`stream-accumulator.ts`, and `idle-timeout.ts` reads `IDLE_TIMEOUT_ERROR_NAME` from `stream-result.ts`.

## `runStream`: the lifecycle of one turn

Read top to bottom, it is five phases:

**1. Assemble.** Resolve `webSearchActive` (the request flag AND the provider supports it AND the model
advertises the capability, all three). Build the language model, the system prompt (`buildSystem`), and the
tool set: the gated builtin tools (`buildGatedTools`) merged with any provider-native server tools
(`getAdapter(provider).buildServerTools?.`, for example Anthropic's own web search).

**2. Wire the abort.** Two independent things can end a turn early:

- **user cancel** — `opts.signal`, aborted from the outside (the renderer clicks stop).
- **idle timeout** — `createIdleTimeout(requestTimeoutMs)` (in `idle-timeout.ts`) hands back
  `{ signal, reset, clear }`: an `AbortController` plus a `setTimeout`, armed on creation. Every delta calls
  `reset()`; if `requestTimeoutMs` passes with *no* delta, its `signal` aborts with a
  `DOMException('idle-timeout', IDLE_TIMEOUT_ERROR_NAME)`.

`AbortSignal.any([opts.signal, idle.signal])` merges them into the one signal handed to `streamText`. Which
one fired is recovered later from the signal's `reason`.

**3. Call `streamText`.** With the assembled model / system / messages / tools, `stopWhen:
stepCountIs(MAX_STEPS)` (agentic tool round-trips before it stops on its own), the merged abort signal, and
the provider options.

**4. Consume the delta loop.** `consumeStream(result.fullStream, { onChunk, acc, onActivity })` (in
`consume-stream.ts`) runs the `for await` plus a `switch (delta.type)` that does exactly two things per arm:
emit the live chunk to the renderer (`onChunk`) and fold it into the accumulator (`acc.addText` /
`addReasoning` / ...). `onActivity` (wired to `idle.reset`) fires once per delta, so the loop pokes the idle
guard without knowing about timeouts. Dispatch and transport only; the stateful accumulation lives in the
accumulator. `run.ts` wraps the call in the try/catch/finally that classifies an abort and clears the timer.

**5. Finish.** `acc.finish()` hands back the built `parts` (with reasoning duration stamped) plus any
mid-stream error. Then classify: if the turn was aborted, return `{ parts, usage: null, stopReason }`; if a
real error surfaced, throw it; otherwise await `result.usage` plus `result.providerMetadata` and return the
parsed `usage`.

## Key concerns (the non-obvious bits)

### Abort surfaces two ways, so `classifyAbort` runs at two sites

An abort can present as a **thrown error** (caught around the loop) or as a `delta.type === 'error'` event
that ends the loop **cleanly** with nothing thrown. Both leave the merged signal `aborted`. So the code does
not classify from the throw site: `classifyAbort(signal)` reads `signal.reason` and asks, is it a
`DOMException` named `IDLE_TIMEOUT_ERROR_NAME`? If so, `idle-timeout`, else `user-cancel`. It is called in
the `catch` (the thrown path) and again after `acc.finish()` (the clean-loop path). Same function, two entry
points, which is why the check looks duplicated.

### The accumulator folds fragments into parts

The model streams **fragments**: `"Hel"`, `"lo"`. The stored message should be one
`{ type: 'text', text: 'Hello' }` part, not many tiny ones. `createStreamAccumulator` holds the in-progress
`parts` between deltas and **coalesces** a run of the same kind (append to the last part if it matches, else
push a new one). It also owns the reasoning-duration clock (the first visible text closes the thinking
window) and the first mid-stream error. It takes **plain domain inputs** (`addText(text)`), never the SDK's
`TextStreamPart` union, so it stays decoupled from the provider and is trivially testable (feed fakes,
assert `parts`). See [`stream-accumulator.ts`](../../src/bun/engine/stream/stream-accumulator.ts).

### Tools pass a two-layer permission gate

`buildGatedTools` wraps every builtin tool's `execute`:

- **Layer 1, global policy** (`getPolicy`, persisted per tool): `deny` blocks, `allow` runs, `ask` falls
  through.
- **Layer 2, per-chat grant** (only when Layer 1 is `ask`): a prior grant for this chat can `allow` or
  `deny`; otherwise emit a `tool-approval-request` chunk and **await** the user's decision (`awaitApproval`,
  a promise resolved from the RPC side). `remember` persists the choice back to the global policy.

Server tools (provider-native) skip this gate; they run inside the provider. See
[`gate-tools.ts`](../../src/bun/engine/stream/gate-tools.ts).

### `toCoreMessages` backfills interrupted tool calls

Mapping stored history to provider messages, a cancelled turn can leave an assistant `tool-call` with **no**
matching `tool-result`. Providers reject a dangling call. So `toCoreMessages` scans each assistant turn and
injects a synthetic `{ interrupted: true }` tool-result for any unmatched call. This is a silent-correctness
spot, flagged as a test target. See [`build-prompt.ts`](../../src/bun/engine/stream/build-prompt.ts).

### Compaction snapshot splits the prompt

When a `CompactionSnapshot` is present: `buildSystem` appends the summary as an "Earlier conversation
summary" block, and `toCoreMessages` **filters history** to only messages newer than
`snapshot.coveredThroughAt`. So the model sees `summary + recent tail` instead of the full log.

### Usage extraction lives at one boundary

`extractUsage(rawUsage, meta)` pulls input and output tokens plus provider-specific cache counts: Anthropic
reports cache read/write in its metadata block; OpenRouter nests a cached-prompt count. The OpenRouter shape
is not typed by the SDK, so this is where the one metadata `as` cast lives, isolated in a named function
instead of buried mid-orchestration.

## Boundary casts (two, both legitimate)

Type discipline in bun is otherwise clean (0 `any`, 0 `@ts-ignore`). The stream layer has two `as` casts,
both at a provider/SDK seam where an untyped or foreign shape is asserted to read it:

1. `run.ts` — `buildProviderOptions(...) as Parameters<typeof streamText>[0]['providerOptions']`: our
   adapter's typed output to the SDK's own union. There is no clean alternative; the SDK types are hostile.
2. `stream-result.ts` — `meta?.openrouter as { promptTokensDetails?: { cachedTokens?: number } }`: plucking
   one field from an untyped provider-metadata blob. A parse point; assert to read.

## Named constants

- `MAX_STEPS = 5` (`run.ts`) — agentic tool round-trips before the run stops on its own.
- `IDLE_TIMEOUT_ERROR_NAME = 'TimeoutError'` (`stream-result.ts`) — the `DOMException.name` the idle guard
  aborts with; `idle-timeout.ts` constructs it, `classifyAbort` reads it back. This is the only true magic
  string here (untyped, cross-file). The part/chunk/stop-reason literals stay **bare**: they are
  schema-typed discriminants single-sourced by the Zod schema, and a const map would duplicate the schema
  and hide the compiler-guided rename.

## Links

- Caller: [chat-bun.md](chat-bun.md) — the lifecycle (persist, registry, compaction, retry/cancel) around
  `runStream`.
- [compaction.md](compaction.md) — how the snapshot that splits the prompt is built and stored.
- [tools.md](tools.md) — the tool set and the permission gate behind `buildGatedTools`.
- [../architecture.md](../architecture.md) — the full process model, IPC, DB, and the end-to-end message
  flow.
