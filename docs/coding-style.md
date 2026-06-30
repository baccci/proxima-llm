# Coding style

Biome is the source of truth for formatting and lint — run `bunx biome check --write`
before finishing. The conventions below are the ones Biome can't enforce.

## Syntax

- No semicolons. Single quotes.

## Conditionals

Prefer usign multiline conditionals over one-liners, except when it's
very small.

## Naming & files

- **Filenames are kebab-case**, React components included: `focus-mode-overlay.tsx`,
  not `FocusModeOverlay.tsx`.
- **One concern per file**, kept small and scannable. A component file holds its
  component (plus tiny private sub-components used only there); standalone logic
  moves to its own file.
- **`entities/` vs `helpers/`** inside a feature: a file exporting a domain type the
  feature talks about (e.g. `Exchange`) is an entity; a file exporting only functions
  over primitives/imported types (e.g. typography math) is a helper. Full rule in
  [../local-docs/ARCHITECTURE.md](../local-docs/ARCHITECTURE.md).

## Component props

- **Always type props with `type`, never `interface`.** Name it `<Component>Props`.
- **Components meant to be extended — all generic/reusable UI components (`components/`)
  — extend the underlying element's props:**
  `type ButtonProps = React.ComponentProps<'button'> & { variant?: Variant }`.
- **Destructure your own props, spread the rest into the main element** (the first/root
  ancestor the component renders), so every native attribute passes through:
  ```tsx
  export function Button({ variant = 'default', className, ...props }: ButtonProps) {
    return <button className={cn('base classes', variantClasses[variant], className)} {...props} />
  }
  ```
- **Merge `className` via `cn('classes…', className)`** — pull `className` from props so
  callers can extend styling without clobbering the base classes.
- Leaf/feature components that render nothing extendable still use `type` for props;
  they just don't extend a DOM element or spread `...props`.

## Constants vs inline

- **Replace magic values with named constants** — keyboard keys, event names
  (`'keydown'`), numeric thresholds, ratios. The name documents intent and stops the
  value drifting out of sync across uses.
- **But keep Tailwind class strings inline in the JSX.** They're co-located styling,
  not logic; hoisting them to `const FOO_CLASS = '…'` adds indirection and hurts
  scannability. Use `cn()` (`@utils/tailwind-class-merge`) for conditional classes.

## Comments

- A short one-line comment above non-obvious logic — derived values, subscriptions,
  layout tricks (column flow, overflow handling). Explain _why_, not _what_.
