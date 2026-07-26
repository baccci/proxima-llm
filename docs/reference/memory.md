# Memory

The durable memory layer, spanning both processes: the bun side (storage, tools, the project
summary) and the small renderer editor feature. This is the source of truth for the layer.

## What memory is, in plain language

A chat forgets everything the moment it ends. Memory is the small set of durable notes that carry
across chats. Each note is a slice: a `{ title, content }` pair. Two axes describe it:

- **scope** — `global` (user-wide, every chat sees it) or `project` (only chats in that project).
- **source** — `user` (typed by hand in the UI) or `model` (the assistant saved it with a tool).

The natural key of a slice is scope plus projectId plus title: within one scope and project a title
is unique, so writing the same title again updates that note rather than making a duplicate.

## The pieces

| File | Role |
|---|---|
| [`features/memory/memory.repository.ts`](../../src/bun/features/memory/memory.repository.ts) | The one owner of the `memorySlices` table: list / upsert / delete, by id and by title. |
| [`features/memory/memory-notify.ts`](../../src/bun/features/memory/memory-notify.ts) | The single write/delete notify hub plus two injected hooks (renderer push, summary regen). |
| [`features/memory/memory-summary-llm.ts`](../../src/bun/features/memory/memory-summary-llm.ts) | `generateMemorySummary`, the LLM call that condenses a project's slices to one paragraph. |
| [`features/memory/tools/*`](../../src/bun/features/memory/tools/) | `read_memory` / `write_memory` / `delete_memory`, the model's access to memory. |
| [`engine/memory-summary.service.ts`](../../src/bun/engine/memory-summary.service.ts) | `regenerateProjectSummary`, the cross-domain workflow that picks a model, regenerates, and persists. It is the `memory-summary` catalog action's implementation, invoked through `dispatchStage`. |
| [`stream/build-prompt.ts`](../../src/bun/engine/stream/build-prompt.ts) | Consumer: lists slice titles in the system prompt. |
| [`shared-contracts/schemas/memory-slice.schema.ts`](../../src/shared-contracts/schemas/memory-slice.schema.ts) | `MemoryScope`, `MemorySource`, `MemorySliceDTO`, and the RPC input schemas. |
| [`src/mainview/features/memory/`](../../src/mainview/features/memory/) | The renderer editor: `MemorySliceList` (add / edit / delete UI, either scope) plus `use-memory-slices` (read plus upsert/delete mutations). Consumed by projects (`memories-card`, project scope) and settings (`memory-section`, global scope). See [../features/projects.md](../features/projects.md). |

## How the model sees memory (the key idea)

Memory could be large, so the app does not dump every note's content into every prompt. Instead the
system prompt carries only the titles, a cheap index:

```
Global notes: "Kebab-case filenames", "Code style"
Project notes: "v1 scope"
```

(or `none saved yet.`). When a title looks relevant, the model calls `read_memory(title)` to pull
that one note's content on demand. This is the classic index-plus-lazy-fetch: a constant small prompt
cost, full content only when needed. The model writes with `write_memory` and prunes with
`delete_memory`. `buildSystem` renders this block (`MEMORY_GUIDANCE` plus the two title lists); the
titles come from `chat-stream.service` calling `listSlices('global')` and
`listSlices('project', projectId)`.

## The three tools

Each is a factory `(ctx: { projectId? }) => tool(...)` registered in `engine/tools/registry.ts` under
a `ToolName`. All three guard the same way: `scope: 'project'` with no active project returns an error
telling the model to use `global` instead (it never throws; the model reads the error and adapts).

| Tool | Does | Notify? |
|---|---|---|
| `read_memory` | `readByTitle` to `{ title, content }` or a not-found error | no (read-only) |
| `write_memory` | `writeByTitle(..., source: 'model')` to `{ saved, title }` | yes |
| `delete_memory` | `deleteByTitle` to `{ deleted, title }` | yes |

Their descriptions carry the policy the model follows: save only durable cross-chat facts, reuse an
exact existing title to update, delete only when a note is outdated or when the user asks.

## The slice store (`memory.repository.ts`)

One module owns every query for `memorySlices`. Two things worth knowing:

- **The shared where-clause.** `sliceByTitle(scope, projectId, title)` builds the three-part
  natural-key lookup once and is reused by the upsert's title branch and the by-title read and delete,
  so the clause never drifts. `projectIdCond` handles the `null` project as `IS NULL` (not `= null`,
  which never matches in SQL).
- **Upsert precedence** (`upsertSlice`): an explicit id updates that row; otherwise a same-title slice
  in the same scope and project is updated (the title left as-is); otherwise insert. This is what makes
  a re-used title an update instead of a duplicate.

Two delete paths exist because the callers differ: `deleteSlice(id)` (an RPC user edit) returns the
deleted row's `{ scope, projectId }` so the caller can notify; `deleteByTitle(...)` (the tool) already
knows the scope, so it returns nothing.

## The project summary (derived data)

Separate from the title index, a project's slices are condensed into one short paragraph shown in the
project UI. Two files:

- **`generateMemorySummary`** (`memory-summary-llm.ts`) formats the slices as `- title: content` lines,
  asks the model for "one short paragraph (no markdown, 60 words or fewer)", and hard-caps the result at
  `MAX_SUMMARY_LENGTH = 400` characters.
- **`regenerateProjectSummary`** (`engine/memory-summary.service.ts`) is the workflow: no slices clears
  the summary; otherwise pick a provider (`resolveGenArgs`), generate, and persist through
  `projectService.setMemorySummary`.

**Why the workflow lives in `engine/`, not the feature.** It coordinates four domains: the model list,
keychain, project, and llm. A feature reaching into sibling features is a smell, so the cross-domain
orchestrator is lifted up to `engine/` and injected back (see the hooks below), which keeps zero
feature-to-engine edges.

**Provider choice** (`resolveGenArgs`): prefer the project's default model's provider, then any other
enabled provider; the first provider with both a resolvable title model and a stored API key wins. If
none qualifies it returns `null` and regen silently does nothing (see Things worth knowing).

**The race guard.** Rapid edits fire overlapping async regens. A per-project generation token
(`genTokens` map) is incremented at the start of each call; after the slow LLM returns, the call
persists only if its token is still the latest, so a slower earlier regen cannot clobber a newer
summary. Last write wins, correctly.

## The notify pipeline and injected hooks

Every memory mutation, both RPC user edits and model tools, funnels through one entry point,
`notifyMemoryChanged(scope, projectId)`, which does two things:

1. Push to the renderer so the slice list refreshes live (no restart).
2. For project scope, kick off async summary regen.

Two functions, on purpose:

- `emitMemoryChanged` pushes only. The regen workflow calls it after writing a fresh summary, so the UI
  updates without re-triggering regen (which would loop).
- `notifyMemoryChanged` pushes and regens. It is the public entry point for writes and deletes.

Both effects are injected hooks, not imports, so the feature stays free of `engine/` and the RPC layer:

- `setMemoryChangedPush(fn)` is wired by `rpc.ts` (`setSendMemoryChanged`) to the renderer channel.
- `setMemoryRegenHook(fn)` is wired by `index.ts` at boot to dispatch the `memory-summary` stage
  (`dispatchStage(memorySummary, { projectId })`), which runs the `regenerateProjectSummary` catalog
  action. It fires out of band on any project-memory write or delete, not on every turn.

Both hooks are nullable module singletons set once at startup (`fn?.()` if unset). This is the
module-singleton dependency-injection pattern used across bun's app wiring: the leaf declares a setter,
the app entry injects the real implementation, and the dependency direction stays one-way.

## Things worth knowing

**`resolveGenArgs` can silently skip regen.** If no enabled provider has both a title model and a
stored key, `regenerateProjectSummary` returns without generating and the summary stays stale or
absent. This is non-fatal by design, but a project can hold slices and show no summary when no provider
is configured.

**Two different length limits on the summary.** The prompt asks for 60 words or fewer; the code
hard-caps 400 characters. The character cap is the real guard (a model can ignore the word count); the
two are not kept in sync and do not need to be.

**Title is the identity.** Because the natural key is scope plus project plus title, a model that
invents a slightly different title creates a new slice instead of updating. The `write_memory`
description leans on the model to reuse the exact existing title; there is no fuzzy-match safety net.

## Named constants

- `MAX_SUMMARY_LENGTH = 400` (`memory-summary-llm.ts`), the hard cap on the stored summary length.

## Tests

None yet. Candidates, both pure and cheap to add:

- **The `buildSystem` memory block**, in the existing pure `build-prompt.test.ts`: the title lists
  rendered for global and project, the `none saved yet.` fallbacks, and the project line omitted when
  there is no project. No extraction, no DB.
- **`resolveGenArgs` provider ordering**, real logic (preferred-first, dedup, first-viable), but
  currently IO-coupled (`listModels` / keychain); testing it wants an extraction that takes the model
  list and a key-checker as arguments.

The repository (DB), the LLM call, and the regen workflow are integration surface, not unit-tested.

## Links

- [compaction.md](compaction.md) — the neighbouring `engine/` summary workflow; the same title-model,
  non-fatal, and pure-leaf patterns.
- [lifecycle.md](lifecycle.md) — the dispatch seam and the `memory-summary` stage the regen hook fires.
- [stream-engine.md](stream-engine.md) — `buildSystem` (the memory-title consumer) and the tool gate.
- [../architecture.md](../architecture.md) — process model, IPC, DB.
