# The model catalog (`features/model/` + `infra/db/model-*`)

The model catalog: what models the app knows about, where they come from (synced from Anthropic and
OpenRouter), who is allowed to overwrite what, and how a cheap "title model" is chosen. This layer is
also the reference example for the repository conventions (see
[conventions/architecture.md](../conventions/architecture.md)).

## What the catalog is, in plain language

To show a model picker, stream a reply, or price a chat, the app needs a list of models and, per model, its
**capabilities** (thinking plus its reasoning schema, vision, pdf, tools, context window, max output),
**pricing**, and whether the user **enabled** it. That list is the catalog: the `models` table in SQLite. The UI always reads from this
cached table so it renders instantly; the network never sits in the render path.

Models enter the catalog from **two synced sources**, and the source decides who may later overwrite the row:

- **`anthropic`** — the Anthropic catalog, fetched from `GET /v1/models` and synced in the background.
  Needs an API key, so no Claude models appear until a key is configured and a sync completes.
- **`openrouter`** — the full OpenRouter catalog, fetched from their API and synced in the background.

`builtin` survives in the `ModelSource` enum only as a legacy value: the old hardcoded Anthropic seed
wrote it, and a one-time migration ([`migrate.ts`](../../src/bun/infra/db/migrate.ts)) converts those
rows to `anthropic`. Nothing writes `builtin` after that.

## The pieces

| File | Role |
|---|---|
| [`features/model/model.repository.ts`](../../src/bun/features/model/model.repository.ts) | The aggregate's data layer: the only module that queries `models` (plus its sync marker) and parses rows to DTOs. Owns the sync write-invariants. |
| [`features/model/model-sync.service.ts`](../../src/bun/features/model/model-sync.service.ts) | Orchestrates the OpenRouter fetch, parse, map, upsert, reconcile. Zero `db` imports. |
| [`features/model/anthropic-model-sync.service.ts`](../../src/bun/features/model/anthropic-model-sync.service.ts) | The same for Anthropic's `GET /v1/models`: fetch (paginated, keyed), map the capability tree, insert newest-per-family enabled, reconcile. Zero `db` imports. |
| [`features/model/reconcile-missing-models.ts`](../../src/bun/features/model/reconcile-missing-models.ts) | `planMissingModels` — the pure, source-scoped decision for rows a source dropped: disable an enabled one, delete a disabled one. |
| [`features/model/title-model.service.ts`](../../src/bun/features/model/title-model.service.ts) | `resolveTitleModel` — pick the cheap model that auto-names chats and writes summaries. |
| [`features/model/title.ts`](../../src/bun/features/model/title.ts) | `generateChatTitle` — the actual LLM call that turns the first message into a title. |
| [`infra/db/model-source.ts`](../../src/bun/infra/db/model-source.ts) | `ModelSource` enum (`anthropic` / `openrouter`, plus legacy `builtin`) — the write-ownership discriminant. |
| [`shared-contracts/schemas/model.schema.ts`](../../src/shared-contracts/schemas/model.schema.ts) | `ModelDTO` / `ModelCapabilities` / `ModelDefinition`. |

## Source ownership: who may overwrite a row (the crux)

The writers that touch the `models` table are the per-source syncs (`upsertSyncedModel` +
`reconcileMissingModels`, shared by both providers) and the user, and the **`source` column** keeps them from
stepping on each other. `source` is DB-only: it is **not** on `ModelDTO`, because the renderer never needs it;
it exists purely to arbitrate writes.

| Writer | Inserts | May overwrite | Never touches |
|---|---|---|---|
| **sync upsert** (`upsertSyncedModel`) | new rows for its source — OpenRouter **disabled**, Anthropic's newest-per-family **enabled**, the rest disabled | `displayName` / `capabilities` / `pricing` of existing rows **of the same source** | rows of a different source; any `isEnabled` on update |
| **sync reconcile** (`reconcileMissingModels`) | — | within its own source: sets `isEnabled=false` on an **enabled** dropped row; deletes a **disabled** dropped one | rows of a different source; any row still in the catalog |
| **user** (`updateModel` RPC) | — | any field of any row (marketplace toggles) | — |

Two invariants fall out of this and matter a lot:

1. **`isEnabled` is the user's, written by sync only on insert.** `upsertSyncedModel` never writes `isEnabled`
   on an existing row. On insert it is the one deliberate write: OpenRouter inserts every row disabled (opt in
   from the marketplace), while the Anthropic sync inserts the newest model per core family (opus/sonnet/haiku)
   **enabled** and everything else disabled. The other exception is `reconcileMissingModels`: when a source
   drops a model the user had enabled, sync disables it, because a model with no endpoints can no longer be
   called and would otherwise silently break the title picker (step 4). A future `retired` flag could carry
   this state without writing `isEnabled`.
2. **A source only refreshes its own rows.** `upsertSyncedModel` returns early when the existing row's source
   differs from the row it is writing, and both reconcile passes are scoped to a single source. So an Anthropic
   sync can never reshape an OpenRouter row (or vice versa), and a model you enabled can't be silently reshaped
   by the wrong subsystem.

## From seed to sync (the migration)

Anthropic used to be three hand-written `source: builtin` rows inserted by a `seedModels` boot step. That seed
is gone: Anthropic is now a synced source like OpenRouter, and its `GET /v1/models` is the single source of the
Anthropic catalog. A one-time migration in [`migrate.ts`](../../src/bun/infra/db/migrate.ts) converts existing
`source: builtin` rows to `source: anthropic`, preserving each row's `isEnabled`, so nothing disappears and the
sync adopts them. It is an idempotent `UPDATE … WHERE source = 'builtin'`: after the first run no builtin rows
remain, so it is a cheap no-op on later boots.

Consequence: a fresh install shows no Claude models until an Anthropic key is configured and a sync completes
(you cannot call them without a key anyway).

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
`supported_parameters` / `input_modalities` (vision = `image` modality, pdf = `file` modality, tools),
`promptCaching: false` and `webSearch: true` fixed (OpenRouter has no per-model cache flag; web search is a
universal plugin), `maxOutputTokens` with an 8192 fallback, and `family` from the vendor prefix
(`deriveFamily` = `id.split('/')[0]`, for example `google/gemma-2-9b` to `google`). The catalog's `reasoning`
object is parsed through the pure `mapReasoning` helper into the reasoning capability fields — `thinking`
(has a `reasoning` object, or an older row advertising `reasoning` / `include_reasoning`),
`reasoningMandatory`, `efforts` (`supported_efforts` filtered to our `Effort` vocabulary and sorted
low→high), and `defaultEffort`. Those three reasoning fields are defaulted in the schema
(`reasoningMandatory: false`, `efforts: []`, `defaultEffort: null`), so a capability blob stored before they
existed still parses.

**4. Upsert + reconcile.** Upsert every mapped row (see Source ownership), then
`reconcileMissingModels(keepIds)` handles rows the catalog dropped, its plan decided by the pure
`planMissingModels`: a **disabled** dropped row is deleted (declutter), an **enabled** dropped row is
**disabled** (a dead model the user chose, kept as a row but no longer offered to the picker or marketplace),
and builtin rows are never touched. **Empty keep-set is a no-op**: a failed or empty fetch must not wipe or
disable the table. A row disabled here becomes a disabled-dropped row and is deleted on a later sync;
`reconcileMissingModels` returns the disabled ids so the sync `log.warn`s them.

**5. Mark.** `setSyncState('openrouter_sync', now, SYNC_VERSION)` records the timestamp plus version.

## The Anthropic sync (`syncAnthropicModels`)

Mirrors `syncOpenRouterModels` step for step, on its own marker (`anthropic_sync`) and `SYNC_VERSION`. The
differences that matter:

- **Precondition: a key.** It reads the Anthropic API key from the keychain and skips quietly when absent
  (OpenRouter's catalog is unauthenticated and never needs one). So the sync is a no-op until a key exists;
  saving one kicks a forced sync (see Consumers → Startup / key add below).
- **No stale-pricing trigger.** Anthropic pricing is intentionally `null`, so a stale-pricing check would force
  a re-sync forever. The gate is throttle + version + `force` only.
- **Fetch is paginated and keyed.** `GET /v1/models` with `x-api-key` + `anthropic-version`, following
  `has_more` / `last_id` (query param `after_id`). Entries are `safeParse`d per item, like OpenRouter's.
- **Capabilities derive from the API's `capabilities` tree**, read through a defensive `leafSupported` walker so
  a shape change can't reject an otherwise-valid model: `contextWindow` ← `max_input_tokens`, `maxOutputTokens`
  ← `max_tokens`, `vision` ← `image_input.supported`, `thinking` ← `thinking.types.adaptive.supported`,
  `efforts` ← the supported `effort.<level>` leaves (filtered to the `Effort` vocabulary, low→high).
  `defaultEffort` picks `medium` when supported, else the lowest supported tier, else `null` (the API publishes
  no default). Fields the tree does not expose (`tools`, `promptCaching`, `pdf`, `webSearch`) take
  Anthropic-wide defaults (`true`) plus a tiny per-family exception table (`haiku → pdf:false, webSearch:false`),
  matching the retired seed. `pricing` is `null` (the title-model resolver handles unpriced Anthropic via its
  `haiku` family hint).
- **Family is derived by scanning the id's segments** for a known token (opus/sonnet/haiku/fable/mythos), not
  positionally, so a legacy id like `claude-3-5-sonnet-20241022` still lands under `sonnet`.
- **Enable-on-insert.** `selectNewestPerFamily` computes, per core family (opus/sonnet/haiku), the id with the
  latest `created_at`; those insert **enabled** (via `upsertSyncedModel`'s `insertEnabled`), everything else
  disabled. It only fires on insert of a new id, so a future flagship auto-enables the first time it is seen,
  and a model you later disable stays disabled through every subsequent sync.

## The repository (the reference example)

This module was the seam that proved the repository pattern. Two halves:

- **Reads** (`listModels`, `getModel`) parse each row through `rowToDTO` and `ModelDTO.parse`, so a bad
  provider or malformed capabilities blob fails **loudly here** instead of leaking a wrong type into the UI.
  This is the read-side boundary parse.
- **Writes** carry their invariants: `upsertSyncedModel` owns insert (disabled by default, or enabled when the
  caller passes `insertEnabled` for Anthropic's newest-per-family) + skip-if-not-my-source + refresh-metadata-
  only; `reconcileMissingModels` owns the drop handling (delete disabled, disable enabled) scoped to one source
  and delegates the decision to the pure `planMissingModels`, which owns the empty-keep-set guard. The sync
  services never reassemble these rules from bare `insert` / `update`, which is what keeps them pure
  orchestration with **zero `db` imports**.

The **sync markers** are model's own slices of the shared `settings` key-value table: each source keeps its own
key (`openrouter_sync`, `anthropic_sync`) storing `{ ts, version }`, and `getSyncState(key)` /
`setSyncState(key, ts, version)` take the caller's key. `getSyncState` parses the blob with a `z.union` (a
legacy bare-number **or** the versioned object) and treats any corrupt or unreadable marker as never-synced
(`{ ts: null, version: 0 }`) so a bad marker cannot crash the startup sync. There is no generic
`settings.repository`: each aggregate owns its keys.

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
  plus the settings RPCs; `syncModels` re-syncs every syncable provider, and `getModelSyncInfo` reports the
  last-sync timestamp **per provider** (the marketplace shows the active tab's).
- **Startup** (`index.ts`) runs the migration, then fires both background syncs and wires `pushModelsUpdated`
  so a finished sync refreshes the renderer. Saving an Anthropic key (`setApiKey` RPC) kicks a forced Anthropic
  sync so Claude models appear without waiting for the next boot.

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

- `SYNC_THROTTLE_HOURS = 24` / `SYNC_THROTTLE_MS` — the minimum gap between background syncs (both services).
- `SYNC_VERSION` — each sync service has its own (OpenRouter `4`, Anthropic `1`); bump to force a re-sync when
  that provider's mapping or schema changes.
- `DEFAULT_MAX_OUTPUT_TOKENS = 8192` — the fallback when a catalog omits max output (both services).
- `OPENROUTER_PARAM` / `OPENROUTER_MODALITY` — the token vocabulary read from the OpenRouter catalog.
- `KNOWN_FAMILIES` / `CORE_FAMILIES` / `FAMILY_CAP_OVERRIDES` — the Anthropic family-token scan, the enable-set
  tiers, and the capability exception table.
- `OPENROUTER_SYNC_KEY = 'openrouter_sync'` / `ANTHROPIC_SYNC_KEY = 'anthropic_sync'` — each source's marker key
  in the `settings` table; passed to `getSyncState` / `setSyncState`.
- `MAX_TITLE_LENGTH = 60` — the hard cap on a generated chat title.

## Tests

- [`select-title-model.test.ts`](../../src/bun/features/model/select-title-model.test.ts) (12) — the
  extracted pure selection: `isFreeModel` (`:free` id, zero price, null-unknown, priced) and
  `selectTitleModel` (auto picks cheapest non-free, skips free, unpriced to family-hint to first, custom
  pinned id, dead/disabled custom to auto, provider filter to null). Load-bearing: compaction and memory both
  resolve their summary model through this.
- [`reconcile-missing-models.test.ts`](../../src/bun/features/model/reconcile-missing-models.test.ts) (6) —
  the pure `planMissingModels`: an enabled dropped row is disabled, a disabled dropped row is deleted, a row
  still in the catalog is untouched, builtin rows are never reconciled, an empty keep-set is a no-op, and — the
  source-scoping case — reconciling one source never touches another's rows.
- [`anthropic-model-sync.service.test.ts`](../../src/bun/features/model/anthropic-model-sync.service.test.ts)
  (14) — the pure Anthropic helpers: `deriveFamily` (modern, legacy-dated segment scan, unknown fallback),
  `deriveDefaultEffort` (medium / lowest / null), `mapToRow` capability derivation (efforts, the haiku
  pdf/webSearch exception, defaults, a missing tree degrading to defaults), and `selectNewestPerFamily`
  (newest per core family, non-core families excluded, deterministic ties).
- [`model-sync.service.test.ts`](../../src/bun/features/model/model-sync.service.test.ts) (8) — the pure
  `mapReasoning`: `mandatory` true / false / absent, `supported_efforts` sorted low→high with `minimal` kept
  and `none` / unknown tokens dropped, `default_effort` parsed or null, and the `supported_parameters`
  thinking fallback when there is no `reasoning` object.

**Still untested:** the rest of `mapToRow` — the modality / tools derivation and the `Number() || 0` pricing
footgun are pure but private inside the IO-heavy `model-sync` (the reasoning half is now extracted into the
tested `mapReasoning`). A candidate for the same leaf extraction; a bigger lift. The repository (DB), the
fetch, and the seed are integration surface.

## Links

- [compaction.md](compaction.md) · [memory.md](memory.md) — consumers of `resolveTitleModel`.
- [chat-bun.md](chat-bun.md) — `getModel` for the chat's model, and the title model used by auto-title.
- [../architecture.md](../architecture.md) — process model, IPC, DB.
