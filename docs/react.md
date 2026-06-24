# React conventions

## Hooks via the `React.*` namespace

Always `React.useState`, `React.useRef`, `React.useMemo`, … — never destructure hooks
from the import. Import as `import React from 'react'`. (Keeps hook usage greppable and
avoids a long, churning named-import list.)

## Never call `useEffect` directly

The only acceptable direct `useEffect` lives inside the shared `useMountEffect` wrapper
([../src/mainview/hooks/use-mount-effect.ts](../src/mainview/hooks/use-mount-effect.ts)).
For everything else, reach for one of these:

| Need | Do this instead |
|---|---|
| State derived from props/state | Compute it inline during render — don't mirror it into state via an effect |
| Fetch data | TanStack Query — see [data-and-state.md](data-and-state.md) |
| Respond to a user action | Event handler |
| One-time setup with an external system (DOM, browser API, subscription) | `useMountEffect` |
| Reset/re-init when an id changes | `key` prop on the component, or conditional mounting at the parent |

**Conditional mounting over effect guards.** If a subtree should only exist under some
condition, mount it conditionally at the parent (`{open && <Overlay/>}`) so the child can
assume its precondition holds and tie setup/teardown to mount/unmount — instead of an
effect guarding on a flag. Example: `FocusModeOverlay` mounts only while open, so OS
fullscreen enter/exit is a clean mount effect (`use-focus-mode-fullscreen.ts`).

**Subscriptions that need fresh values:** attach the listener once in `useMountEffect` and
read changing values through a ref updated each render (see `use-focus-mode-keyboard.ts`),
rather than re-subscribing on every dependency change.

**`useLayoutEffect` is allowed only for genuine DOM measurement** that can't be derived
(e.g. reading `scrollHeight` to decide a layout). Wrap it in a named hook — see
`use-two-column-layout.ts`.

## Derive, don't sync

Most `setX` effects are an unnecessary extra render. If `x` can be computed from existing
props/state, compute it inline rather than storing a mirror and syncing it.

## Conditional rendering

1. **Preferred:** `condition && <Component/>`, and push the condition *into* early-returning
   child components (`if (!x) return null`) so the parent JSX stays a flat list. Guard on
   real booleans — `count && …` renders a literal `0`.
2. **Avoid** `<Render condition>` / `<Show>` wrapper components: a non-idiomatic abstraction
   whose children are still evaluated and which hides React's model.
3. **`<Activity>`** is only for keeping a subtree *mounted but hidden with state preserved*
   (tab panels, instant restore). Don't use it for plain conditional logic where you want
   unmount semantics.
