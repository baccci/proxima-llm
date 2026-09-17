# Feature: settings

## Purpose

The settings modal. A six-tab dialog opened from the sidebar footer and the model-switcher. The tabs
are Appearance (theme, send-on-Enter), Providers (a per-provider API key plus title-model choice),
Memory (global memory notes), Tools (a per-tool allow/ask/deny policy), Connect (the local control
server: enable, port, pairing code, connected clients), and Advanced (max retries, request timeout,
and diagnostics/log actions).

**Location:** `src/mainview/features/settings/`

**Depends on:** shared root (`lib/{query-client,query-keys,rpc.client}`, several `components/*`
primitives, `hooks/{use-mount-effect,use-is-dark}`, `utils/tailwind-class-merge`); shared-contracts
(`schemas/settings.schema`, `providers/registry`, `tools/{tool-policy,tool-catalog}`, `models/pricing`,
`schemas/model.schema`, `schemas/memory-slice.schema`); the models feature (`useModels`,
`models.api.syncModels`); and the memory feature (`MemorySliceList`).

## Structure

The standard feature shape. There is no `store` (the dialog registers with the shared modal store
under `SETTINGS_MODAL_ID`, so the sidebar footer opens it without importing the dialog) and no
`entities` or `helpers` (the domain types live in shared-contracts; small pure helpers stay inline in
their component file).

| Path | Responsibility |
|---|---|
| `components/settings-dialog.tsx` | The modal shell and tab nav. One config row per tab carries id, label, icon, and the panel node; nav and content both read it. |
| `components/appearance-section.tsx` | Theme segmented control plus send-on-Enter switch. |
| `components/providers-section.tsx` · `provider-card.tsx` · `api-key-row.tsx` · `title-model-control.tsx` | The per-provider card: brand header, API-key form (React Hook Form), and the Auto/Custom title-model picker. |
| `components/tools-section.tsx` | The tool catalog grouped by group, each a segmented allow/ask/deny control. |
| `components/memory-section.tsx` | Global memory, delegating to the memory feature's `MemorySliceList`. |
| `components/control-server-section.tsx` | The control server: enable/status, follow-incoming, `PortField`, `PairingCodeCard`, the connected-client list. |
| `components/advanced-section.tsx` · `diagnostics-section.tsx` | Retry/timeout `OptionRow`s plus log-folder/file/clear buttons. |
| `components/section-label.tsx` | The shared uppercase section heading. |
| `constants/tabs.ts` · `constants/providers.ts` | `TABS` as-const vocabulary plus the derived `Tab`; the `PROVIDERS` list built from the shared registry. |
| `settings.api.ts` | Writes and actions only: `settings.update`, `setApiKey`, `generatePairingCode`, `revokeControlToken`, and `logs.openFolder/openFile/clear`. |
| `hooks/use-settings.ts` · `use-tool-policies.ts` · `use-log-info.ts` · `use-control-tokens.ts` | TanStack Query read hooks (plus the `useSetToolPolicy` mutation). |

## Data flow

Reads go through the hooks (`useSettings`, `useApiKeyStatus` / `useApiKeyStatuses`, `useToolPolicies`,
`useLogInfo`, `useControlTokens`), each a `useQuery` over the typed RPC client keyed by `queryKeys.*`.
Writes go through the `settings` / `logs` api objects (each `req().X()` then an `invalidateQueries` on
the matching key), or through `useSetToolPolicy` (a `useMutation`). Components derive everything else
during render; no data lives in a store.

Model-catalog refresh (`syncModels`) is not a settings action: it lives in `models.api`, and both the
marketplace and the provider title-model resync call it there.

## Key decisions

- **`syncModels` belongs to models, not settings.** Refreshing the model catalog is a models-domain
  action; it only sat in `settings.api` for historical key-adjacency. Moving it removed the
  settings-to-models reach, and `title-model-control` reaching models is free because that file already
  depends on the models feature through `useModels`.
- **The api objects hold writes and actions only; reads are hooks.** Five imperative-read mirrors
  (`settings.get`, `getApiKeyStatus`, `listControlTokens`, `logs.getInfo`, `logs.logClientError`) had
  zero callers once the read hooks and direct `electroview` reads took over, and were removed.
- **The tool-policy vocabulary is the `ToolPolicy` schema.** The `'allow' | 'ask' | 'deny'` union was
  hand-written in two files; both now use the schema. The segmented control keeps its allow/ask/deny
  display order, so the tokens are named individually (`ToolPolicy.enum.*`) rather than mapped from
  `ToolPolicy.options` (whose order differs).
- **The control-server port default and bounds are single-sourced from the schema.**
  `CONTROL_SERVER_PORT_MIN` / `_MAX` and `DEFAULT_SETTINGS.controlServerPort` live in `settings.schema`;
  the component's client-side validation and the input's `min` / `max` read them, so they cannot drift
  from the zod contract.
- **The pairing countdown is a mount-scoped child.** `PairingCodeCard` mounts only while a code exists,
  so the once-a-second ticker is a plain `useMountEffect` interval; when it hits zero, `onExpire` clears
  the code, which unmounts the card and tears down the interval.
- **`PortField` re-seeds through a key.** The editable port draft is seeded from the loaded port and the
  parent keys the field on that value, so it corrects once async settings arrive instead of sticking on
  the pre-load default.
- **`useApiKeyStatuses` stays a manual two-call unroll.** The rules of hooks forbid looping
  `useApiKeyStatus` over the provider list, so the two calls are explicit, but keyed and argued by
  `ProviderId.enum.*`, so a reorder cannot mismatch them and adding a provider becomes a compile error on
  the returned `Record`.

## Known limitations

- The connected-clients list does not refresh when a new client pairs externally; it needs a
  bun-to-renderer push and updates on modal reopen for now.
- Clearing logs currently fails on the bun side (the `clearLogs` handler).
