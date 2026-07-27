# Infra: the LLM providers (`src/bun/infra/llm/`)

How the app turns "this model plus these request settings" into a configured LLM client plus the right
provider knobs, without the engine knowing any provider's specifics. This is the ports-and-adapters seam
for multi-provider support.

## What this is, in plain language

Proxima talks to more than one model provider (Anthropic direct, OpenRouter), and each wants its options
shaped differently: how you turn on "thinking", how you enable web search, how you set an effort level. The
engine should not care about those differences. This folder is the **translation layer**: a common
interface every provider implements, so the streaming code says "build me a model" and "give me the
provider options for this request" and gets back something uniform.

## The pattern: ports and adapters

| File | Role |
|---|---|
| [`adapter.ts`](../../src/bun/infra/llm/providers/adapter.ts) | **The port.** The `ProviderAdapter` interface every provider implements, plus the `ComposerRequest` shape (`thinking` / `effort` / `webSearch`). |
| [`anthropic.ts`](../../src/bun/infra/llm/providers/anthropic.ts) | **Adapter.** Anthropic-direct via `@ai-sdk/anthropic`. |
| [`openrouter.ts`](../../src/bun/infra/llm/providers/openrouter.ts) | **Adapter.** OpenRouter via `@openrouter/ai-sdk-provider`. |
| [`index.ts`](../../src/bun/infra/llm/providers/index.ts) | **The dispatch.** An `adapters` registry keyed by provider id, plus `getAdapter(provider)` and a `buildModel` convenience. |

The engine (`engine/stream/run.ts`) only ever calls `getAdapter(model.provider)` and the interface methods;
it never imports a concrete adapter. Adding a third provider is: write one adapter class, register it in
`index.ts`. Nothing else changes.

The `ProviderAdapter` interface:

- `buildModel(modelId, apiKey)` — construct the AI-SDK `LanguageModel` client for a call.
- `buildProviderOptions(model, req)` — turn the request (thinking on/off, effort, web search) into the
  provider-shaped options object, or `undefined` when there is nothing to set.
- `buildServerTools?(model, req)` — optional; provider-**hosted** tools (like Anthropic's server-side web
  search) that are not part of our own tool registry.

The adapter no longer computes effort levels. The tiers a model exposes are **data on the model**
(`capabilities.efforts`, ordered low→high), written by whoever owns the row — the OpenRouter sync parses
them, the seed declares them — so the renderer and the adapters just read them. `buildProviderOptions`
receives the already-chosen `req.effort` and never re-derives the list.

## How the two providers differ (the interesting part)

The same three request flags map to **different provider shapes**, which is exactly what the adapter hides:

**Thinking**
- Anthropic: `thinking: { type: 'adaptive' }` (plus `output_config.effort` when an effort is set), or
  `{ type: 'disabled' }`.
- OpenRouter: `reasoning: { enabled: true, effort? }` when thinking is on; `{ enabled: false }` when off —
  **unless** `capabilities.reasoningMandatory`, in which case `enabled: true` is forced even with thinking
  off. Mandatory-reasoning models 400 on `enabled: false`; the UI already prevents the off state, and this
  guard stops a stale client from sending the bad request anyway.

**Web search** (note these are *not the same kind of thing*):
- Anthropic exposes it as a **server tool** (`buildServerTools` returns a `web_search` tool the model
  calls), gated on `req.webSearch`.
- OpenRouter exposes it as a **provider-options plugin** (`plugins: [{ id: 'web' }]`), set in
  `buildProviderOptions`. This is the universal OpenRouter web mechanism.

**Prompt caching** is Anthropic-only: `cacheControl: { type: 'ephemeral' }` when the model supports it;
OpenRouter has no equivalent knob here.

Both wrap their result under the provider key (`{ anthropic: opts }` / `{ openrouter: opts }`) and both
return `undefined` when the options object came out empty, so the SDK is passed no `providerOptions` at all
rather than an empty object.

## The base system prompt (`system-prompt.ts`)

`system-prompt.ts` holds two things: `MEMORY_GUIDANCE` (the standing instructions on when to read, write,
and delete memory) and `buildBaseSystemPrompt(model, webSearchActive)`, the base identity text ("You are
{displayName}, accessed via {provider}, running inside Proxima..."), the web-access line, and the
`get_capability_detail` usage note.

This is the **base** layer only. The full system message is assembled up in `engine/build-prompt.ts` (base
plus project instructions plus memory slice titles plus project file names plus any compaction snapshot). It
lives in infra because it is static prompt text with no app-state dependencies beyond the model; the engine
composes app state around it.

## Concerns / footguns

- **Version-skew cast in `buildServerTools`.** `anthropicProvider.tools.webSearch_20260209(...) as unknown
  as Tool` bridges the `Tool` type from `@ai-sdk/provider-utils` to the `Tool` from `ai` when the two
  packages drift. The shapes match at runtime; the cast is the seam to revisit on an SDK bump.
- **`buildProviderOptions` returning `undefined` is meaningful.** Empty options become `undefined`, so the
  SDK gets no provider options. If you add a knob, keep the "empty means undefined" guard or you will send
  `{}`.
- **The `get_capability_detail` disclaimer lives in the prompt text.** The base prompt explicitly tells the
  model that tool only looks up app features and does *not* browse or run code, a guard against the model
  advertising abilities it lacks. Keep it if you edit the prompt.

## Named constants / vocabulary

- `adapters` — the provider-id to adapter registry (the one place to register a provider).
- `MEMORY_GUIDANCE` — the memory usage instructions injected into the system prompt.

## Tests

`buildProviderOptions` is **pure** (model plus request to options object, no IO) and carries the real
branching, so it is covered by colocated unit tests:
[`anthropic.test.ts`](../../src/bun/infra/llm/providers/anthropic.test.ts) (prompt caching; thinking
adaptive / effort / disabled; empty to `undefined`; the `{ anthropic }` wrapper; `buildServerTools` web
search on/off) and [`openrouter.test.ts`](../../src/bun/infra/llm/providers/openrouter.test.ts) (reasoning
enabled / effort / disabled; mandatory reasoning stays enabled with thinking off; the `web` plugin; empty to
`undefined`; the `{ openrouter }` wrapper). Only `buildModel` (which constructs an SDK client) is left out,
as it is a thin SDK passthrough.

## Links

- [stream-engine.md](stream-engine.md) — `run.ts` calls `getAdapter` / `buildModel` / `buildProviderOptions`
  / `buildServerTools`, and merges server tools with the gated tools.
- [model.md](model.md) — the capabilities (`thinking`, `promptCaching`, `webSearch`) that gate these
  options.
- [infra-keychain.md](infra-keychain.md) — where `buildModel`'s `apiKey` comes from.
- [../architecture.md](../architecture.md) — process model, streaming path.
