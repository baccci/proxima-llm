# Coding style

Biome is the source of truth for formatting and lint — run `bunx biome check --write`
before finishing. The conventions below are the ones Biome can't enforce.

## Syntax

- No semicolons. Single quotes.

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

## Constants vs inline

- **Replace magic values with named constants** — keyboard keys, event names
  (`'keydown'`), numeric thresholds, ratios. The name documents intent and stops the
  value drifting out of sync across uses.
- **But keep Tailwind class strings inline in the JSX.** They're co-located styling,
  not logic; hoisting them to `const FOO_CLASS = '…'` adds indirection and hurts
  scannability. Use `cn()` (`@utils/tailwind-class-merge`) for conditional classes.

## Comments

- A short one-line comment above non-obvious logic — derived values, subscriptions,
  layout tricks (column flow, overflow handling). Explain *why*, not *what*.
