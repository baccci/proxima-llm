# Feature: focus-mode

## Purpose

A fullscreen, distraction-free reading surface that walks a chat one exchange at a time, where
an exchange is a user prompt paired with the assistant reply it received. You open it from a
chat; it drives OS fullscreen and is keyboard-navigable (arrows plus vim `j`/`l`, and `p`, `f`).
The text auto-fits the height of the viewport (fluid typography), dropping to two columns only
for a response too long to fit one column at the smallest font size. It also shows a live
streaming turn, and offers a "jump into the new prompt" affordance when a fresh prompt starts
streaming while you are reading.

**Location:** `src/mainview/features/focus-mode/`

**Depends on:** the `chat` feature (`chat.store` for the live streaming message; the
`use-messages` read hook; `message-part-renderer`, `thinking-block`, and the `message-parts`
helpers; `on-control-navigate.jumpInto`), the root `navigation.store` (`selectedChatId`), the
shared `message.schema` (`MessageDTO` / `MessageRole`), shared-root utils (`clamp`, `cn`), and
the shared `use-mount-effect` hook. It is mounted by `app/layout/main-pane`.

## Structure

Focus mode owns its UI state (the open flag, the current index, show-prompt, pending-incoming)
and nothing else: its data comes from the chat feature's read hooks, so there is no `services/`.
The shape within the feature is `entities/helpers → hooks → store → components`.

| Path | Responsibility |
|---|---|
| `entities/group-into-exchanges.ts` | The `Exchange` domain type and `groupIntoExchanges`: fold a flat `MessageDTO[]` into user/assistant pairs (drop system messages, pair each user with the following assistant, skip orphan assistants). |
| `helpers/typography.ts` | The pure fluid-typography curves. Owns the `FONT_SIZE_MIN` / `FONT_SIZE_MAX` bounds (single source). `computeLineHeight` (ramps 1.65 to 1.2) and `computeFontWeight` (400 to 800, quadratic) derive from the resolved font size. |
| `hooks/use-fit-typography.ts` | Binary-searches the largest font size at which the single-column block fits the viewport height, committing two columns only at the floor. Uses `useLayoutEffect` and a `ResizeObserver` measuring real `scrollHeight`, the one sanctioned direct-measurement hook. |
| `hooks/use-focus-mode-exchanges.ts` | The current chat's messages grouped into exchanges with the in-flight stream merged in (a `useMemo` derive; per-field `navigation.store` and `chat.store` selectors). |
| `hooks/use-focus-mode-fullscreen.ts` | Drives OS fullscreen from the overlay's lifetime (request on mount, release on unmount); calls `onExit` when the user leaves fullscreen another way (Esc). Exposes a manual toggle for the nav button. |
| `hooks/use-focus-mode-keyboard.ts` | Binds the shortcut keys for the component's lifetime via a `NAV_KEYS` map and first-match dispatch; a latest-ref keeps the once-attached listener calling the current handlers. |
| `store/focus-mode.store.ts` | UI-only: `isOpen`, `exchangeIndex`, `showPrompt`, `pendingIncoming`. `open(atExchange)` is the entry point other features call, seeding the index and clearing any stale banner. |
| `components/focus-mode-overlay.tsx` | The top-level fullscreen layer: reads store state, computes the clamped index and handlers, wires the three hooks, renders the nav and reading surface. Private children: `IncomingBanner`, `FocusModeEmpty`, `ReadingSurface`. |
| `components/focus-mode-nav.tsx` | The top toolbar: prev/next and counter, prompt toggle, fullscreen, close. A private `NavIconButton` is shared by the four icon buttons. |
| `components/focus-mode-content.tsx` | Renders one exchange: `PromptBlock`, `ReasoningBlock` (the thinking trace), `ResponseBlock`. |

## Data flow

- The UI state (`isOpen`, `exchangeIndex`, `showPrompt`, `pendingIncoming`) are
  `focus-mode.store` slices. The overlay reads them through per-field selectors and writes
  through the setters.
- Messages come from the chat feature's `useMessages(selectedChatId)` (TanStack Query), with the
  chat id read from the root `navigation.store`. `use-focus-mode-exchanges` groups them and merges
  the live `chat.store.streaming` message so an in-flight turn shows immediately.
- The overlay is mounted only while the store's `isOpen`
  (`main-pane`: `{focusModeOpen && <FocusModeOverlay/>}`), so OS fullscreen enter/exit and the
  keyboard binding map cleanly onto mount and unmount.
- No RPC or mutations of its own. Navigation is store writes; `jumpInto` (a chat lib) handles
  "jump into the streaming prompt."

## Key decisions

- **Its own store, but still a chat sub-surface.** Focus mode's UI state is its own, so it lives
  in `focus-mode.store` rather than riding the chat feature's. The reads that remain into `chat`
  (the streaming message, the renderers, `useMessages`) are intentional: focus mode is a way of
  looking at a chat, not a sibling domain. See
  [conventions/architecture.md](../conventions/architecture.md).
- **Other features enter through `open(atExchange)`.** The chat header and `on-control-navigate`
  both start focus mode at a chosen exchange, so the store owns that sequence instead of each
  caller setting two fields in the right order.
- **`useLayoutEffect` is deliberate** in `use-fit-typography`: the fit depends on the real
  rendered `scrollHeight`, which is readable only after layout and cannot be derived from props.
- **The two-column lock.** Once two columns are committed for a `resetKey`, it stays locked:
  switching to two columns halves the element height, which would otherwise re-trigger
  single-column refitting and oscillate. During measurement `apply()` writes fontSize and
  line-height and weight together, because the committed render derives all three from fontSize;
  measuring with only fontSize would read `scrollHeight` against the previous line-height and make
  the fit disagree with the render (a visible flicker).
- **Latest-ref subscription** (keyboard and fullscreen `onExit`): attach the listener once on
  mount and read the changing callbacks through a ref reassigned each render, rather than
  re-subscribing on every dependency change.
- **A manual fullscreen toggle** exists because the auto-request on mount is rejected without a
  user gesture (an external control prompt carries no gesture).

## Known limitations

- Inline code and code blocks in the reading surface render at a fixed size (the overlay pins
  `[&_pre]` and `[&_code]` to `text-sm`), so they do not ride the fluid `fontSize` along with the
  prose.
