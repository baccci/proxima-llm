# React

We lean on a few React conventions hard, because each one removes a whole category of
bugs or churn. The effect rule below is the one that shapes the most code.

## Hooks through the `React.*` namespace

Always `React.useState`, `React.useRef`, `React.useMemo`, and so on. Import React as a
default (`import React from 'react'`) and never destructure the hooks out of it. Two
reasons: hook calls stay easy to grep, and the import line at the top of the file does not
churn every time you add or drop a hook.

## Never call `useEffect` directly

The only direct `useEffect` in the app lives inside the shared `useMountEffect` wrapper
([use-mount-effect.ts](../../src/mainview/hooks/use-mount-effect.ts)). Everywhere else a raw
`useEffect` is a sign there is a cleaner tool for what you are actually doing. Reach for one
of these instead:

| What you need | What to use |
|---|---|
| A value derived from props or state | Compute it inline while rendering. Do not mirror it into state and keep it in sync with an effect. |
| To fetch data | TanStack Query. See [data-and-state.md](data-and-state.md). |
| To respond to a user action | An event handler. |
| One-time setup with an external system (DOM, a browser API, a subscription) | `useMountEffect`. |
| To reset or re-init when an id changes | A `key` prop on the component, or conditional mounting at the parent. |

**Conditional mounting beats an effect that guards on a flag.** If a subtree should only
exist under some condition, mount it conditionally at the parent (`{open && <Overlay/>}`). The
child then gets to assume its precondition holds, and its setup and teardown tie cleanly to
mount and unmount. `FocusModeOverlay` works this way: it mounts only while open, so entering
and leaving OS fullscreen is a plain mount effect.

**When a listener needs fresh values,** attach it once in `useMountEffect` and read the changing
values through a ref you reassign on each render, rather than tearing down and re-subscribing
every time a dependency changes. See `use-focus-mode-keyboard.ts`.

There are two narrow places where a raw `useEffect` really is the right tool:

- **A recurring imperative DOM effect, quarantined in a named hook.** Some effects push a
  derived value onto DOM the app does not own, and have to re-run when that value changes, so
  they cannot collapse into a one-shot mount effect. Keep the `useEffect`, but wrap it in a
  single hook whose name states the job, with a comment on why the effect is needed.
  `use-apply-theme` (it toggles `<html class="dark">` and re-subscribes to the system light/dark
  listener when the saved theme changes) and `use-auto-scroll` (it keeps the message list pinned
  to the newest content while a reply streams) are the two members. A raw `useEffect` sitting
  inline in a component is still a smell.
- **`useLayoutEffect` for genuine DOM measurement** that cannot be derived, such as reading
  `scrollHeight` to decide a layout. Wrap it in a named hook too. See `use-two-column-layout.ts`.

## Derive, don't sync

Most `setX`-inside-an-effect patterns are just an extra render you did not need. If `x` can be
computed from the props and state you already have, compute it during render instead of storing
a copy and keeping the copy in sync.

## Conditional rendering

Prefer `condition && <Component/>`, and push the condition *into* early-returning child
components (`if (!x) return null`) so the parent JSX stays a flat list of pieces. Guard on real
booleans: `count > 0 && ...`, never `count && ...`, since a bare `0` renders as the text "0".

Avoid `<Show>` or `<Render condition>` wrapper components. They are a non-idiomatic layer, their
children still evaluate, and they hide how React actually works. Reserve `<Activity>` for the one
case it is meant for: keeping a subtree mounted but hidden with its state intact (tab panels,
instant restore), not plain conditional logic where you want unmount semantics.

## Reusable components spread native props

A generic, reusable UI component (the ones in `components/`) should extend the underlying
element's props, so a caller can pass any native attribute straight through:

```tsx
type ButtonProps = React.ComponentProps<'button'> & { variant?: Variant }

export function Button({ variant = 'default', className, ...props }: ButtonProps) {
  return <button className={cn('base classes', variantClasses[variant], className)} {...props} />
}
```

Destructure your own props, spread the rest onto the root element, and merge `className` with
`cn('base', className)` so a caller can extend the styling without clobbering the base.

## Renderer quirks

Some misbehavior is a WebKit / Electrobun rendering quirk rather than a React one: ghost
compositing layers, missed repaints, tab-order gotchas. Those live in
[webkit-quirks.md](webkit-quirks.md). The one to keep in mind while writing components: hide a
keyboard-reachable control with `opacity-0`, never `visibility`, `display:none`, or an unmount,
all of which drop the control out of the tab order.
