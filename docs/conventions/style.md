# Style

Most of what keeps this codebase consistent is not written here, because you can pick
it up by reading a couple of files: how code is spaced, named, and shaped. This page is
the smaller set of conventions that are either easy to get wrong or worth a short
explanation. When you are unsure, match the surrounding code.

Biome takes care of the mechanical layer for you: formatting, import order, single
quotes, semicolons (none, in every folder, `src/bun/**` included), and nested ternaries.
Run `bunx biome check --write` before you finish. This page does not repeat anything
Biome already fixes.

## The ones that fight your instinct

Start here. Each of these goes against a common habit, so it is the kind of thing you
will reach for the wrong way without noticing.

**Filenames are kebab-case, even React components.** So `focus-mode-overlay.tsx`, not
`FocusModeOverlay.tsx`. Most React projects name the file after the component in
PascalCase, which is exactly why this one takes a conscious effort. The reward is that
every path in the tree looks the same and nothing surprises you.

**Use `type`, not `interface`.** For what we do they overlap almost entirely, so we pick
one and stick with it. Reach for `interface` only in the rare case you actually need
declaration merging.

**Brace every conditional, guard clauses included.** Even a one-line early return gets
its own braced block on its own line. A bare `if (x) return` reads fine today, but the
day someone adds a second line under it and forgets the braces, the bug is quiet and
annoying. One extra line buys that away.

**Comments are written for the next person reading the code.** Plain language, since that
reader may not be a fluent English speaker. No em dashes, and a colon only when it really
earns its place. Say why the code is the way it is, not what each line does.

## Types

**Name a component's props `<Component>Props`.** A tiny habit, but it means the prop type
for any component is always findable by its name.

**Keep types close only while they are few.** A couple of small types can live in the file
that uses them. Once there are more than that, or the type describes something from the
domain, move it out: to `entities/` if it carries domain meaning, otherwise to its own
`types/` file. This keeps each file about one thing.

**Give values a single home and derive the type from it.** If you write a type as a
literal union and also write those same values somewhere else, the two will drift apart
over time. Put the values in one `const` array or map and derive the type from it with
`(typeof ARR)[number]`. When a zod schema already holds the values, the schema is that
single home. See [architecture.md](architecture.md).

## Constants

**Name your magic values.** A bare `0.75` or `'keydown'` sitting in the middle of logic
tells the reader nothing, and when the same value appears in two places it silently drifts.
A name explains the intent and gives you one spot to change it.

**But leave Tailwind class strings inline in the JSX.** Those strings are styling, and
styling belongs right next to the markup it dresses. Hoisting them into a named constant
just adds a hop for whoever is reading. Use `cn()` (`@utils/tailwind-class-merge`) when a
class needs to be conditional.

**A named constant lives with the code it governs, not in a central config file.** The tuning
values we have, `MAX_STEPS` in `run.ts`, `MAX_MB` in `attachment.repository`,
`LOG_RETENTION_DAYS` in `logger`, each have exactly one consumer, and each sits a few lines
above the code that enforces it. Changing the limit and changing the enforcement is then one
edit in one file, so the two cannot drift. Collecting them into a shared `config.ts` buys a
list you can skim and costs cohesion on every read, and a module every layer imports but no
layer owns is the junk-drawer shape that produces stores like the old `chat.store`. If the
question is really "what can I tune here", grep answers it without moving any code.

Two things do move. A constant that gains a second consumer in another module gets hoisted to
the nearest home both already share, the way `NEWEST_EXCHANGE` sits with the `open()` action
it is an argument to. A constant that turns out to be a user preference in disguise belongs in
the settings schema, not in a constants file.

## Control flow

**Prefer early returns over `if/else`.** Handle the edge cases up top with guard clauses,
then let the main path run unindented below. It reads top to bottom without you holding a
branch in your head. When you are choosing between several cases, a lookup map is usually
clearer than a long `if/else` ladder.

**Avoid `else` entirely.** There is almost always a cleaner shape: a guard with an early
return, a small extracted helper, or a named variable assigned under a plain `if`.

**Use a ternary only for a short, single-line value pick.** Both branches should be simple:
a literal, a property read, a short `??`, or a single pure formatter call such as
`cond ? formatBytes(x) : null`. The moment it spans multiple lines, calls something that
does real work or has a side effect, or nests inside another ternary, restructure it.

**Watch what `cond && expr` binds.** `&&` returns its left side when that side is falsy,
and a boolean's falsy value is `false`, not `undefined`. So it is safe where the result is
read as a boolean or rendered as a node (`cond && <JSX/>`). It is not safe for binding
nullable data: the falsy case gives you `false`, which quietly turns a `T` into `false | T`.
Use a guard or a single-line ternary there instead.

## Formatting

Separate distinct blocks of logic with a blank line so the shape of the function is visible
at a glance. Give a multi-line control block (`if`, `for`, `while`, `switch`, `try`) room to
breathe with a blank line before and after, unless it sits flush against an enclosing brace
or belongs to a run of related guards that read as one group.

## Comments

A short comment above a non-obvious piece of logic (a derived value, a subscription, a
layout trick) is welcome. Spend it on why the code is shaped this way.

Do not use comments as a diary. No `for now`, no `until X lands`, no `we decided to`. Notes
like that rot as the code moves on, and they are noise to someone reading cold. Known
limitations belong in the roadmap, where you can link to them.

## Files

**One concern per file, kept small and scannable.** A component file holds its component
plus the tiny private sub-components used only there. Anything that stands on its own moves
to its own file.

**Lead with the exported component.** The main component comes first, and the private
sub-components it uses sit below it, in roughly the order they appear in its JSX. You open
`message-bubble.tsx`, you see `MessageBubble`, and then you drill down into its pieces.

Where a file belongs (`entities/` vs `helpers/` inside a feature, `lib/` vs `utils/` at the
shared root, and what counts as shared) is covered in [architecture.md](architecture.md).
