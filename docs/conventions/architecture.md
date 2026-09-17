# Architecture conventions

The decisions you make when you add code: where a file goes, whether something is a shared
contract, how to model a set of values, and when a chunk of data access has earned a
repository. For how the system is actually built (the process model, IPC, the database,
streaming) see the [architecture overview](../architecture.md).

## Where a file goes

**`entities/` vs `helpers/` inside a feature.** If a file exports a domain type the feature
talks about (an `Exchange`, a `Project`), it is an entity. If it only exports functions over
primitives or imported types (typography math, formatting), it is a helper.

**`lib/` vs `utils/` at the shared root.** If a file instantiates a singleton or wires two
subsystems together, it belongs in `lib/`. If it is a pure, stateless function over its inputs,
it belongs in `utils/`.

**Location encodes scope.** Anything at the root level (`components/`, `hooks/`, `lib/`,
`utils/`, `entities/`, `store/`) is shared, and any feature or `app/` may import it. Anything
under `features/<x>/` is scoped to feature x, and only x and `app/` may import it. A feature
reaching into a sibling feature is usually a smell: lift the shared piece up to the root
instead. The exceptions are the three named below, and nothing else.

**Not every `features/` directory is a peer.** The rule above reads every one of them as an
independent vertical slice. Three of ours are not, and forcing the rule onto them makes the
code worse:

- **A view onto another feature.** `sidebar` and `focus-mode` are ways of looking at chats,
  not rival domains. `sidebar` rendering chat's `ChatRow`, and `focus-mode` rendering its
  `MessagePartRenderer` and `ThinkingBlock`, is honest coupling. Duplicating those renderers
  would be worse, and hoisting them into root `components/` would dress chat-specific
  rendering up as generic UI. Leave them.
- **`devtools` is deliberately omniscient.** A debug panel inspects the app by design, so it
  reads whatever it needs to. Reshaping `getContextUsage` or `useMessages` into "shared"
  modules to serve a debug tool would corrupt the architecture to satisfy a grep. Leave it.
- **An entry point into a sibling view.** The chat header opens focus mode, so it calls that
  feature's `open(atExchange)`. Calling a sibling's entry point, one action that opens it or
  one component to render, is fine. Reaching past it into the sibling's internals, or
  rebuilding by hand the sequence of writes that entry point performs, is not.

Against a genuine peer the rule stands. `chat` and `projects` are separate domains, and a
direct import between them means the shared piece belongs at the root: that is why
`useProjects` lives in root `hooks/` and not in `features/projects/`.

## `shared-contracts/` is bun and renderer only

`src/shared-contracts/` holds the types and schemas that *both* processes agree on, the wire
contract between the Bun main process and the renderer. Put a symbol here only if both sides
consume it. The quick test: does anything in `src/bun/` import it? If not, it is not a contract.
Renderer-only presentation or domain logic, even typed data with pure functions over it, belongs
in `mainview/entities/` (a domain type) or `mainview/utils/` (a pure function), never at the
`shared-contracts` root.

One nuance: this targets renderer presentation dumped into shared, not a small domain-identity
primitive that sits right next to the data it works on. A pure predicate over a value set that
already lives in shared can stay there even if only the renderer calls it today, because keeping
it with its data is worth more than the strict two-consumer test. `isKnownProvider`, a guard over
the shared provider list, lives with that list for exactly this reason.

## Model values from schemas, and close the enum

A zod schema defines a set of values once, and the type comes from `z.infer`. Do not re-list a
schema's members as a separate array or a hand-written union elsewhere, and do not hoist them into
a parallel `const` map: both drift away from the schema over time. Derive from the schema itself
(`Schema.options`, `Schema.enum.member`). At a value site (a comparison, or a constructed object)
reach the value through its named accessor, `MessageRole.enum.user` rather than a bare `'user'`,
even inside the schema's own switch. The name tells the reader which vocabulary the value belongs
to, groups every use under one symbol, and jumps to a single documented definition.

**Close the enum unless a real write path needs it open.** Model a value to its actual domain, not
to some future openness. If no code path produces out-of-set values, make it a closed enum
(`z.enum`, or `as const` with a derived type). You get type-checked comparisons and compiler-guided
renames for free: change the value, and every stale literal turns into a compile error. Keep it
`z.string()` only when a real writer emits arbitrary values. Defensive handling for inputs that
nothing produces is slop: it switches the compiler off and lets unchecked literals spread. Where an
open source (a database row, wire bytes) first becomes the enum is a parse point, and that is what
`Schema.parse` is for.

**Local vocabularies that no schema owns** get a plain `as const` object, not a manufactured zod
schema: `const PROMPT_TARGET = { new: 'new', active: 'active' } as const`, compared as
`target === PROMPT_TARGET.new`. Rule of thumb: a zod accessor when a schema already owns the value,
an `as const` object when it is a local vocabulary with no schema. This is the single-home principle
from [style.md](style.md), applied to the contract layer.

## Data access: the repository

**One data module per aggregate.** Every query for an aggregate, and the row-to-DTO parse that
goes with it, live in a single module, and nothing else imports `db` or `sqlite` for that
aggregate. Services and orchestration call that module and read it as intent, never as raw SQL. The
module *is* the repository, whether or not it is named `.repository` yet.

**Write invariants live with the data, not the caller.** A write method names an intent and guards
the aggregate's rule end to end. `upsertSyncedModel` owns the whole "insert unless disabled, skip
built-ins, otherwise refresh metadata only" rule, so no caller has to reassemble it from bare
`insert` and `update` calls. A repository of bare CRUD primitives has leaked its invariants to every
caller and bought nothing. Simple reads can stay thin, but they still own their DTO parse.

**A shared key-value table has no single owner.** `settings` is a storage substrate, not an
aggregate. Each aggregate owns its own typed slice of it (its key, and its blob parse) from its own
data module. Do not build a generic `settings.repository` with `get(key)` and `set(key)`: that is the
anemic CRUD wrapper again under a different name.

**A repository is earned by scattered access, not required for every aggregate.** Split a service
into service plus repository only when the data access is genuinely spread across several files, or
when a distinct orchestration layer needs to read it as intent. When one cohesive module already
holds all of an aggregate's queries, even alongside some filesystem or validation work, that module
already is the repository, so leave it whole. `attachment` owns its entire table and blob access in
one file and was cleaned in place, not split.
