# Feature: devtools

## Purpose

A floating, draggable debug panel for pinning runtime behavior while you develop. It is gated
behind `import.meta.env.VITE_TWEAK === '1'` (mounted in `app.tsx`), so it exists only in tweak
builds and never ships. It does two things: it overrides compaction behavior on the bun side
(set the ratio threshold, fake the context-token count, or force a compaction now) so you can
exercise the compaction engine without filling a real context window, and it offers a quick
theme switcher (light / dark / system) that writes real settings.

**Location:** `src/mainview/features/devtools/`

**Depends on:** shared root (`components/{collapsible,logo}`,
`utils/{clamp,tailwind-class-merge,error-message}`, `lib/{query-keys,rpc.client}`) and
shared-contracts (`dev/dev-override-keys`, `schemas/settings.schema`). It also reads from
sibling features on purpose: `settings` (`use-settings`, `settings.api`), `chat`
(`context-usage`, `use-chats`, `use-messages`, `chat.store`), and `models` (`use-models`). See
Key decisions.

## Structure

A small feature. There is no `entities/` or `helpers/`: nothing here owns a domain type or a
pure transform, since the domain lives in the features it inspects.

| Path | Responsibility |
|---|---|
| `components/dev-panel.tsx` | The draggable shell. The open state (`DevPanelOpen`) shows the sections; the collapsed state (`DevPanelLauncher`) is the logo button plus a grip. Owns drag (motion), viewport clamping, and position reset. |
| `components/dev-section.tsx` | Presentational collapsible section wrapper (title plus panel). |
| `components/sections/appearance-section.tsx` | Theme switcher. Reads `useSettings`, writes `settings.update({ theme })`. |
| `components/sections/compaction-section.tsx` | Ratio slider, token faker, force-compact button. Reads real usage to show it beside the faker. |
| `store/devtools.store.ts` | Zustand UI store: `isOpen`, `position`, `compactionRatio`, `forcedTokens`. Persists only `position`. Exports `DEFAULT_POSITION`. |
| `devtools.api.ts` | The services layer: three TanStack Query mutations wrapping the RPC client. |

## Data flow

- **Compaction overrides.** The store holds the draft UI values the user is editing. On change,
  `useSetCompactionRatio` / `useSetForcedTokens` push to bun via `devSetOverride({ key, value })`,
  keyed by the `DevOverrideKey` enum. The bun side reads those back under the same key, so the
  key is a cross-process contract single-sourced in `shared-contracts/dev/dev-override-keys.ts`.
- **Force compact.** `useForceCompact` calls `devForceCompact({ chatId })` and, on success,
  invalidates `queryKeys.compaction(chatId)` so the compaction state re-reads.
- **Real usage readout.** The compaction section reads `useMessages` and `useModels` for the
  selected chat and computes `getContextUsage(...)?.used` to show the true token count next to
  the faker input.
- **Theme.** Reads `useSettings`; each button writes `settings.update({ theme })`.
- **Position.** Persisted to localStorage via zustand `persist` (`partialize` keeps only
  `position`). Clamped to the viewport on mount so a window resized smaller between sessions
  cannot strand the panel offscreen.

## Key decisions

- **The `VITE_TWEAK=1` gate.** This is dev-only; the panel never mounts in a shipped build.
- **The token faker resets by keyed remount, not an effect.** `TokenFaker`'s `key` is
  `` `${selectedChatId}:${forcedTokens}` ``, so switching chat or changing the override remounts
  it and re-seeds the draft from the current real usage. Reset happens through mount, with no
  syncing effect.
- **The cross-feature reads are intentional.** devtools imports from `settings`, `chat`, and
  `models`. Normally a feature reaching into a sibling is a smell to lift up, but devtools is a
  diagnostic inspector whose whole job is to observe and override other features. Lifting those
  hooks to the shared root would be wrong, since they are feature-owned, and the `VITE_TWEAK`
  gate keeps this coupling out of the shipped app.
- **The store is not the source of truth for the overrides.** The real override lives on the bun
  side; the store only echoes the draft the user typed, and `partialize` does not persist it. One
  known wrinkle: after a reload the store resets `compactionRatio` / `forcedTokens` to defaults
  even if a bun override is still pinned. Acceptable for a dev tool, left as is.
