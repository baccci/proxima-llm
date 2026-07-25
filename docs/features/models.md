# Feature: models

## Purpose

The models marketplace. It is a modal where you browse every model the app knows about (the
built-in Anthropic models plus the OpenRouter models pulled in by a sync), grouped under
per-provider tabs, and switch each one on or off. Only enabled models appear in the composer's
model switcher, so this modal is how you curate that list. It opens from the sidebar footer and
from the model-switcher dropdown in a chat.

The feature also owns the read hooks (`useModels`, `useModelSyncInfo`) that the rest of the app
uses: the composer, the model-switcher, the settings title-model control, the chat view, and
the devtools compaction section all read the model list through `useModels`.

**Location:** `src/mainview/features/models/`

**Depends on:** `@shared/providers/registry` (`ProviderId`, `PROVIDER_IDS`, `getProvider`,
`isKnownProvider`), `@shared/schemas/model.schema` (`ModelDTO`), `@shared/models/pricing`
(`isFreeModel`); `entities/model` (company, pricing, short-name), `entities/provider`
(`PROVIDER_LOGOS`); `components/{modal,modal-nav,pagination,switch,tooltip}`; `hooks/use-is-dark`;
`lib` (query-client, query-keys, rpc.client); `utils/time` (`relativeTime`),
`utils/format-tokens`; and, cross-feature, `features/settings/settings.api` (`syncModels`).

## Structure

There is no `entities/`, `store/`, or `services/` here. The model domain types and pure helpers
live in the shared root (`entities/model`, `shared-contracts`), because this feature is UI over a
shared aggregate rather than the owner of the aggregate.

| Path | Responsibility |
|---|---|
| `components/models-marketplace.tsx` | The modal: provider tabs (`ProviderTab`), search plus all/enabled filter, the enabled/available grid, pagination, empty states, resync. |
| `components/model-card.tsx` | One model card: name and company, capability badges, context window, pricing, the enable switch. |
| `components/marketplace.constants.ts` | `MARKETPLACE_MODAL_ID`, in its own one-line file so the openers import the id without pulling in the ~300-line component. |
| `hooks/use-models.ts` | `useQuery` over `listModels`, the reactive model list read app-wide. |
| `hooks/use-model-sync-info.ts` | `useQuery` over `getModelSyncInfo`, the last-sync timestamp. |
| `models.api.ts` | The imperative api object. Only `update` remains (toggle enable, then invalidate). |

## Data flow

- **Reads.** `useModels` / `useModelSyncInfo` wrap the typed RPC (`listModels` /
  `getModelSyncInfo`), keyed by `queryKeys.models()` and `queryKeys.modelSyncInfo()`.
- **Toggle.** A card's switch calls `models.update({ id, isEnabled })`, which awaits `updateModel`
  and invalidates `queryKeys.models()`. The list re-fetches and the card reflects the new state.
- **Resync.** The marketplace runs `settings.syncModels()` through a `useMutation`; its `isPending`
  drives the Resync / Sync-now button label and disabled state. The refresh is push-driven: on
  sync the bun side emits an event that `rpc.client` uses to invalidate `queryKeys.models()` and
  `queryKeys.modelSyncInfo()`, so the list and the sync-time label update on their own and the
  marketplace invalidates nothing itself.
- **Provider tabs.** `providerTabs(allModels)` lists the built-in providers that have at least one
  model, then any custom providers seen in the data (deduped, first-seen order). `currentProvider`
  defaults to the first tab.
- **Filtering.** By provider, then all/enabled, then the search box; sorted enabled-first; sliced
  into pages of `PAGE_SIZE` (24); split into enabled/available sections whose headings appear only
  when both sections are on the page.

## Key decisions

- **`MARKETPLACE_MODAL_ID` sits in its own file** so the two openers (the sidebar footer and the
  model-switcher) can reference the modal-registry id without importing the big component.
- **`isKnownProvider` is a registry primitive.** It lives in
  `shared-contracts/providers/registry.ts` beside `getProvider` and `providerSupportsWebSearch`, a
  type guard that narrows `string` to `ProviderId`. It belongs there because it is provider
  identity, not renderer presentation, even though only the renderer calls it today. See
  [conventions/architecture.md](../conventions/architecture.md).
- **`models.api` keeps only the imperative write** (`update`); reactive reads go through the hooks.
  The dead `list` method that no caller used was removed.
- **The resync mutation has no success-invalidation on purpose.** The refresh is push-driven from
  bun, so a manual invalidate would be redundant.
- **`ProviderTab` owns its own brand-color derivation.** A selected branded tab paints the whole
  button in the accent, an unselected branded tab tints only the logo, and unknown providers stay
  neutral.
