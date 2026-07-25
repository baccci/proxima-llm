# The model catalog (`features/model/` + `infra/db/model-*` + seed)

The model catalog: what models the app knows about, where they come from (shipped in code versus synced
from OpenRouter), who is allowed to overwrite what, and how a cheap "title model" is chosen. This layer is
also the reference example for the repository conventions (see
[conventions/architecture.md](../conventions/architecture.md)).

## What the catalog is, in plain language

To show a model picker, stream a reply, or price a chat, the app needs a list of models and, per model, its
**capabilities** (thinking, vision, pdf, tools, context window, max output), **pricing**, and whether the
user **enabled** it. That list is the catalog: the `models` table in SQLite. The UI always reads from this
cached table so it renders instantly; the network never sits in the render path.

Models enter the catalog from **two sources**, and the source decides who may later overwrite the row:

- **`builtin`** — the handful of models shipped in code
  ([`model-seed.ts`](../../src/bun/infra/db/model-seed.ts)), inserted and refreshed on boot.
- **`openrouter`** — the full OpenRouter catalog, fetched from their API and synced in the background.

## The pieces

| File | Role |
|---|---|
| [`features/model/model.repository.ts`](../../src/bun/features/model/model.repository.ts) | The aggregate's data layer: the only module that queries `models` (plus its sync marker) and parses rows to DTOs. Owns the sync write-invariants. |
| [`features/model/model-sync.service.ts`](../../src/bun/features/model/model-sync.service.ts) | Orchestrates the OpenRouter fetch, parse, map, upsert/prune. Zero `db` imports. |
| [`features/model/title-model.service.ts`](../../src/bun/features/model/title-model.service.ts) | `resolveTitleModel` — pick the cheap model that auto-names chats and writes summaries. |
| [`features/model/title.ts`](../../src/bun/features/model/title.ts) | `generateChatTitle` — the actual LLM call that turns the first message into a title. |
| [`infra/db/model-seed.ts`](../../src/bun/infra/db/model-seed.ts) | `MODEL_SEED` — the builtin model definitions. |
| [`infra/db/seed.ts`](../../src/bun/infra/db/seed.ts) | `seedModels` — insert-on-first-boot / refresh-builtin-on-later-boot. |
| [`infra/db/model-source.ts`](../../src/bun/infra/db/model-source.ts) | `ModelSource` enum (`builtin` / `openrouter`) — the write-ownership discriminant. |
| [`shared-contracts/schemas/model.schema.ts`](../../src/shared-contracts/schemas/model.schema.ts) | `ModelDTO` / `ModelCapabilities` / `ModelDefinition`. |

## Source ownership: who may overwrite a row (the crux)

Three writers touch the `models` table, and the **`source` column** keeps them from stepping on each other.
`source` is DB-only: it is **not** on `ModelDTO`, because the renderer never needs it; it exists purely to
arbitrate writes.

| Writer | Inserts | May overwrite | Never touches |
|---|---|---|---|
| **seed** (`seedModels`) | new builtin rows | `capabilities` + `displayName` of existing **builtin** rows | openrouter rows; any `isEnabled` |
| **sync** (`upsertSyncedModel`) | new openrouter rows (**disabled**) | `displayName` / `capabilities` / `pricing` of existing **openrouter** rows | builtin rows; any `isEnabled` |
| **user** (`updateModel` RPC) | — | any field of any row (marketplace toggles) | — |

Two invariants fall out of this and matter a lot:

1. **`isEnabled` is the user's, always.** Neither seed nor sync ever writes `isEnabled` on an existing row.
   New synced rows insert **disabled** so the user opts in from the marketplace.
2. **A source only refreshes its own rows.** `seedModels` skips a row whose source is not `builtin`;
   `upsertSyncedModel` returns early if the existing row's source is not `openrouter`. So a model you enabled
   can never be silently reshaped by the wrong subsystem.

## Seeding (`seedModels`)

Runs at boot ([`index.ts`](../../src/bun/index.ts) calls `await seedModels()`), before the sync:

- Row not in the table, insert it as `source: builtin`.
- Row present and `builtin`, refresh `capabilities` + `displayName` only (specs may change between app
  versions).
- Row present and **not** builtin, leave it untouched.

`MODEL_SEED` is the three shipped Anthropic models (opus / sonnet / haiku) with hand-written capabilities.
Note `pricing: null` for builtins: Anthropic pricing is not tracked here, only capabilities and enablement.

## The OpenRouter sync (`syncOpenRouterModels`)

Kicked off **non-blocking** at boot (`syncOpenRouterModels(pushModelsUpdated).catch(...)`) so the UI renders
from the DB cache immediately and refreshes when the sync lands. Also callable forced from the marketplace
(`syncModels` RPC, `force = true`). The flow:

**1. Should we sync?** Skip when a sync ran within `SYNC_THROTTLE_HOURS` (24h), **unless** forced, the
`SYNC_VERSION` changed (bump it to force a re-sync when the mapping logic changes), or stored pricing is
stale (`hasStalePricing`, any synced row missing pricing). All three overrides log why.

**2. Fetch + parse at the boundary.** `fetch` the catalog, parse the envelope (`OpenRouterModelsResponse`),
then **`safeParse` each entry** with `OpenRouterModel` in the loop: one malformed catalog row is skipped
(and counted in a `log.warn`), never fatal to the whole sync. The network is the least trusted input in the
app.

**3. Map.** `mapToRow` turns an OpenRouter entry into a persistable row: capabilities derived from its
`supported_parameters` / `input_modalities` (thinking = `reasoning` or `include_reasoning`, vision = `image`
modality, pdf = `file` modality, tools), `promptCaching: false` and `webSearch: true` fixed (OpenRouter has
no per-model cache flag; web search is a universal plugin), `maxOutputTokens` with an 8192 fallback, and
`family` from the vendor prefix (`deriveFamily` = `id.split('/')[0]`, for example `google/gemma-2-9b` to
`google`).

**4. Upsert + prune.** Upsert every mapped row (see Source ownership), then
`pruneDisabledModelsMissing(keepIds)` deletes only **openrouter and disabled** rows the catalog dropped,
never a builtin, never one the user enabled. **Empty keep-set skips the delete**: a failed or empty fetch
must not wipe the table.

**5. Mark.** `setSyncState(now, SYNC_VERSION)` records the timestamp plus version.

## The repository (the reference example)

This module was the seam that proved the repository pattern. Two halves:

- **Reads** (`listModels`, `getModel`) parse each row through `rowToDTO` and `ModelDTO.parse`, so a bad
  provider or malformed capabilities blob fails **loudly here** instead of leaking a wrong type into the UI.
  This is the read-side boundary parse.
- **Writes** carry their invariants: `upsertSyncedModel` owns insert-disabled + skip-non-openrouter +
  refresh-metadata-only; `pruneDisabledModelsMissing` owns the empty-keep-set guard. Callers (`model-sync`)
  never reassemble these rules from bare `insert` / `update`, which is what keeps `model-sync` pure
  orchestration with **zero `db` imports**.

The **sync marker** is model's own slice of the shared `settings` key-value table: the `openrouter_sync` key
stores `{ ts, version }`. `getSyncState` parses the blob with a `z.union` (a legacy bare-number **or** the
versioned object) and treats any corrupt or unreadable marker as never-synced (`{ ts: null, version: 0 }`)
so a bad marker cannot crash the startup sync. There is no generic `settings.repository`: each aggregate owns
its key.

## Title model resolution (`title-model.service.ts` + `title.ts`)

Some jobs want a **cheap** model, not the chat's main one: auto-naming a new chat, and writing the
compaction and project-memory summaries. `resolveTitleModel(provider)` picks it:

- **`custom` plus a still-valid (enabled) id**, that id.
- **`custom` plus a dead or disabled id**, silently fall back to auto (the pinned model was removed).
- **`auto`**, `cheapestEnabled(provider)`: the cheapest enabled **non-free** model, ranked by
  `prompt + completion` price; unpriced models sort last and fall back to a known cheap family hint (`haiku`
  for Anthropic), then to the first enabled model.
- **no enabled models**, `null` (the caller skips titling or summarizing).

**The free-model exclusion is a real bug-fix, not a nicety.** `isFreeModel` excludes `:free` variants and
zero-priced models because OpenRouter deactivates free models without notice, and auto picking one would
resurrect the original "title generation silently broke" bug. `title.ts` then does the LLM call
(`generateChatTitle`), capping the result at 60 chars.

## Consumers

- **Compaction** ([compaction.md](compaction.md)) and **memory** ([memory.md](memory.md)) both call
  `resolveTitleModel` for their summary models.
- **Streaming** (`chat-stream.service`) calls `getModel(modelId)` to resolve the chat's model plus its
  capabilities.
- **The marketplace UI** reads `listModels` and writes enablement and title config through `updateModel`
  plus the settings RPCs; `syncModels` / `getModelSyncInfo` drive the manual re-sync.
- **Startup** (`index.ts`) seeds, then background-syncs, and wires `pushModelsUpdated` so a finished sync
  refreshes the renderer.

## Concerns / footguns

### `Number(x) || 0` swallows a genuinely bad price
`mapToRow` does `Number(m.pricing.prompt) || 0`. A non-numeric price string becomes `0`, which then looks
*free*, and a `0`/`0` model is treated as free by `isFreeModel`, so it is correctly excluded from auto title
selection. The failure mode is a real-but-unparseable price showing as free rather than erroring;
acceptable, but worth knowing.

### `deriveFamily`'s `?? 'unknown'` is effectively unreachable
`String.prototype.split` always returns at least one element, so `id.split('/')[0]` is never `undefined` and
the `'unknown'` fallback never fires (an empty id yields `''`, not `'unknown'`). Harmless, but do not rely on
seeing `'unknown'`.

### A failed sync is non-fatal and self-healing
The boot sync is `.catch`-logged; the throttle/version/stale-pricing gate re-runs it later. A model that was
malformed *this* sync and is disabled locally gets pruned, then re-added on the next clean sync
(disabled-only, self-heals).

### `family` stays open (`z.string()`)
Unlike `provider`, `family` is **not** a closed enum: sync is a real writer of arbitrary vendor slugs, so it
stays `z.string()`.

### `isFreeModel` is duplicated across the process boundary
The free-model rule lives in three places: this bun leaf (`select-title-model.ts`) and **two** renderer
copies, `mainview/entities/model/pricing.ts` and an inline copy in
`settings/components/title-model-control.tsx`. Both processes genuinely consume it, so it is a candidate to
promote to `shared-contracts` and collapse the three copies.

## Named constants

- `SYNC_THROTTLE_HOURS = 24` / `SYNC_THROTTLE_MS` — the minimum gap between background syncs.
- `SYNC_VERSION = 2` — bump to force a re-sync when the mapping or schema changes.
- `DEFAULT_MAX_OUTPUT_TOKENS = 8192` — the fallback when OpenRouter omits max output.
- `OPENROUTER_PARAM` / `OPENROUTER_MODALITY` — the token vocabulary read from the catalog.
- `SYNC_SETTINGS_KEY = 'openrouter_sync'` — model's key in the `settings` table.
- `MAX_TITLE_LENGTH = 60` — the hard cap on a generated chat title.

## Tests

- [`select-title-model.test.ts`](../../src/bun/features/model/select-title-model.test.ts) (12) — the
  extracted pure selection: `isFreeModel` (`:free` id, zero price, null-unknown, priced) and
  `selectTitleModel` (auto picks cheapest non-free, skips free, unpriced to family-hint to first, custom
  pinned id, dead/disabled custom to auto, provider filter to null). Load-bearing: compaction and memory both
  resolve their summary model through this.

**Still untested:** `mapToRow` — the capability derivation and the `Number() || 0` pricing footgun are pure
but private inside the IO-heavy `model-sync`. A candidate for the same leaf extraction; a bigger lift. The
repository (DB), the fetch, and the seed are integration surface.

## Links

- [compaction.md](compaction.md) · [memory.md](memory.md) — consumers of `resolveTitleModel`.
- [chat-bun.md](chat-bun.md) — `getModel` for the chat's model, and the title model used by auto-title.
- [../architecture.md](../architecture.md) — process model, IPC, DB.
