# Tools (the model's tool system)

How the model calls **tools** (read memory, read a project file, look up a capability) and how each call
is gated by a user policy before it runs. The system spans four small layers across two processes. It
partly overlaps [stream-engine.md](stream-engine.md) (which owns the streaming side of approval); this doc
owns the catalog, registry, gate, and policy.

## What a "tool" is, in plain language

A **tool** is a function the model is allowed to call mid-answer. The model does not run code itself: it
emits a request ("call `read_memory` with `{title: 'coding-style'}`"), the app runs the real function, and
the result goes back into the conversation. Proxima ships five built-in tools:

| Tool | What it does | Group |
|---|---|---|
| `read_memory` | read a saved memory slice by title | memory |
| `write_memory` | save / update a memory slice | memory |
| `delete_memory` | delete a memory slice | memory |
| `read_project_file` | read a project file by name | files |
| `get_capability_detail` | fetch help text about an app feature on demand | app |

Every call passes through a **gate** first: the user has a standing policy per tool (allow / ask / deny),
and "ask" pops an approve/deny prompt in the UI. That is the whole system: a catalog of what exists, a
registry of what backs each one, a gate that enforces the policy, and a tiny store for the policies.

## The four layers (and why they are split)

The system is deliberately cut into four files by concern, and split **across the process boundary** by who
consumes each piece:

| Layer | File | Process | Job |
|---|---|---|---|
| **Catalog** | [`shared-contracts/tools/tool-catalog.ts`](../../src/shared-contracts/tools/tool-catalog.ts) | shared | Static metadata: name, UI labels, description, group, default policy, `alwaysAllow`/`silent` flags. The source of truth for *what tools exist*. |
| **Policy vocab** | [`shared-contracts/tools/tool-policy.ts`](../../src/shared-contracts/tools/tool-policy.ts) | shared | The two enums: `ToolDecision` (allow/deny) and `ToolPolicy` (allow/deny/ask). |
| **Registry** | [`engine/tools/registry.ts`](../../src/bun/engine/tools/registry.ts) | bun | Runtime wiring: `BUILTIN_TOOLS` maps each name to its actual AI-SDK `Tool` (or a factory that takes `{ projectId }`). |
| **Gate + persistence** | [`engine/stream/gate-tools.ts`](../../src/bun/engine/stream/gate-tools.ts) + [`features/tool-permission/tool-permission.repository.ts`](../../src/bun/features/tool-permission/tool-permission.repository.ts) | bun | Wrap each tool's `execute` with the policy check; read/write the stored policies. |

**Why the catalog is shared but the registry is bun-only.** Both processes need to know a tool *exists* and
how to *label* it: the renderer draws the settings list and the tool-call chips, the bun gate reads its
default policy and flags. That metadata is static, so it lives in shared-contracts. But the *implementation*
of a tool (its `execute`, its DB reads) only runs in bun, so `BUILTIN_TOOLS` stays in bun. One tool, its
metadata and its code deliberately on opposite sides of the wire.

## The catalog

`TOOL_CATALOG` is a plain array of entries, frozen `as const satisfies readonly ToolCatalogEntry[]`. Each
entry carries:

- `name` — the wire id the model calls (`read_memory`).
- `label` / `runningLabel` / `doneLabel` — the three strings the renderer shows on the tool-call chip (idle,
  mid-run, finished).
- `description` — one line, shown in Settings.
- `group` — one of `TOOL_GROUPS` (`memory` / `files` / `app`), for grouping in the UI.
- `defaultPolicy` — the policy used when the user has not set one.
- `alwaysAllow?` — bypass the gate entirely (read-only, safe tools).
- `silent?` — hide the call from the message list (housekeeping the user need not see).

`ToolName` is derived from the array (`(typeof TOOL_CATALOG)[number]['name']`), so adding a catalog entry
automatically widens the type the registry must satisfy: you cannot register a tool the catalog does not
know, and you cannot forget to back a catalog tool. Three accessors read the catalog through a `META` map:
`isAlwaysAllowed`, `isSilentTool`, `defaultPolicyFor`.

The `as const satisfies` combo is the point: `as const` keeps the literals narrow (so `ToolName` stays a
union of exact strings), while `satisfies ToolCatalogEntry[]` type-checks every entry without widening it.
The bare `'allow'` / `'ask'` string literals in the array are fine un-accessorised: the array **is** the
definition site, and `satisfies` closes it against the schema. The accessor rule for schema enums is about
*comparison* sites elsewhere, not the source table itself.

## The policy vocabulary

Two tiny enums, and the second is built from the first:

```ts
export const ToolDecision = z.enum(['allow', 'deny'])
export const ToolPolicy = z.enum([...ToolDecision.options, 'ask'])
```

- **`ToolDecision`** — the resolved outcome of the gate: run it or block it.
- **`ToolPolicy`** — the user's standing setting: `ToolDecision` **plus** the `'ask'` escape hatch.

Composing `ToolPolicy` from `ToolDecision.options` (rather than re-typing `['allow','deny','ask']`) means
the two can never drift: `ToolPolicy` is *by construction* "a decision, or ask." Small, but it is the clean
version of a relationship that is usually copy-pasted.

## The gate (`buildGatedTools`)

This is the heart. `buildGatedTools` takes the per-chat context plus four callbacks and returns a
`Record<string, Tool>` where every tool's `execute` is wrapped in a **two-layer** check:

**Layer 1, the global policy** (`getPolicy`, persisted, set in Settings):

- `alwaysAllow` tool, run immediately, skip everything.
- `deny`, return `{ blocked: true, reason: 'Denied by policy.' }` (a tool *result*, not a throw, so the
  model sees the denial and can react).
- `allow`, run.
- `ask`, fall through to Layer 2.

**Layer 2, the per-chat grant** (only reached when the global policy is `ask`):

- grant `deny`, `{ blocked: true, reason: 'Denied for this chat.' }`.
- grant `allow`, run.
- no grant yet, emit a `toolApprovalRequest` stream chunk to the renderer, `await` the user's decision,
  optionally remember it for the chat (`setToolGrant`), then run or block per the answer.

The allow/deny/ask matrix itself is a pure leaf, `decideToolGate` (see the Tests section): `buildGatedTools`
calls it and just carries out the returned action, keeping the IO (the DB read, the chunk, the await) at the
edge.

The two layers answer two different questions. **Global policy** is your durable setting for a tool
everywhere ("never let it delete memory without asking"). **Per-chat grant** is the ephemeral, in-memory
answer to a single "ask" prompt, with an optional "remember for this chat": it lives on the stream, not in
the DB, so it resets when the chat's stream ends. `getToolGrant` / `setToolGrant` are injected by the
chat-stream layer (dependency injection, so the gate does not reach into stream state).

The approve/deny round-trip (chunk to renderer UI to `resolveToolApproval` RPC to the awaited promise
resolving) is owned by [stream-engine.md](stream-engine.md); the gate only fires the chunk and awaits.

## The individual tools

Each tool is one file, one tool. Two shapes:

- **Static tool** — a bare `tool({...})`, no context needed. `sliceTool` (`get_capability_detail`): its
  input is an enum of `CAPABILITY_SLICES` keys, and it returns that slice's help text. This is the same lazy
  pattern as memory's title-index: the system prompt lists capability *names*, the model pulls the detail on
  demand instead of stuffing every feature's help into every prompt.
- **Factory tool** — `(ctx: { projectId?: string }) => tool({...})`, for tools that need per-chat context.
  `readProjectFileTool` closes over `projectId` and returns `{ error }` (not a throw) when no project is
  active or the read fails, so the model gets a usable message instead of a crashed turn.

`registry.ts` distinguishes them by `typeof factory === 'function'`: a factory is called with the context, a
plain tool is used as-is. The memory tools (documented in [memory.md](memory.md)) are the other three.

## Policy persistence (`tool-permission.repository.ts`)

Owns the `tool_policies` slice of the **shared settings key-value table**: a shared key-value table has no
single owner aggregate, so each module owns just its own key (`KEY = 'tool_policies'`), the same table other
modules read.

- `getPolicy(name)` — `alwaysAllow` short-circuits to `'allow'`; else the stored map, else
  `defaultPolicyFor(name)`. Always resolves *something*.
- `setPolicy(name, policy)` — no-ops for `alwaysAllow` tools (their policy is not user-settable).
- `listPoliciesDetailed()` — the catalog joined with each tool's effective policy; the shape the Settings
  screen renders.

The stored blob is parsed with `PolicyMap = z.record(z.string(), ToolPolicy)` on every read (at the DB
boundary), so a corrupt or stale policy value fails here, not at the gate.

## Concerns / footguns

### `alwaysAllow` must not contradict `defaultPolicy`
`alwaysAllow` wins in every path (the gate skips both layers, `getPolicy` short-circuits to `'allow'`,
`setPolicy` refuses to change it), so an `alwaysAllow` tool's `defaultPolicy` is never consulted. It used to
be able to lie: `get_capability_detail` declared `defaultPolicy: 'ask'` while `alwaysAllow: true`, reading as
if it prompts when it cannot. It is fixed two ways: the entry now says `'allow'`, and `tool-catalog.ts`
asserts at load that every `alwaysAllow` tool has `defaultPolicy: 'allow'`, so the contradiction cannot come
back.

### The gate leans on non-null / `never` casts
`originalExecute!(input as never, callOpts)`: AI-SDK's `Tool.execute` is optional and each tool's input type
is distinct, so the wrapper asserts both. This is legitimate at this boundary (the SDK has already validated
`input` against the tool's `inputSchema` before `execute` runs, and every built-in tool defines `execute`),
but a future tool with no `execute` would crash on the `!` rather than be caught.

### Blocked calls return a result, not an error
A denied tool returns `{ blocked: true, reason }` as its *output*. That is deliberate: the model reads the
denial and adapts, instead of the turn throwing. Keep this shape if you add block reasons.

### Per-chat grants do not survive a restart
"Remember for this chat" (`setToolGrant`) is in-memory on the stream. This is intended: the durable setting
is the global policy; per-chat is a convenience within one session.

## Named constants / vocabulary

- `TOOL_CATALOG` — the tool list plus metadata (the source of truth).
- `TOOL_GROUPS` — the `memory` / `files` / `app` UI groupings.
- `BUILTIN_TOOLS` — name to the runtime `Tool` or factory.
- `KEY = 'tool_policies'` — the settings-table key the policy store owns.
- `CAPABILITY_SLICES` — feature name to help-text markdown for `get_capability_detail`.

## Tests

The gate's decision matrix is a pure leaf, `decideToolGate({ alwaysAllowed, policy, grant })` in
[`engine/stream/gate-decision.ts`](../../src/bun/engine/stream/gate-decision.ts), returning a discriminated
`GateAction` (`run` / `block(reason)` / `ask`). `buildGatedTools` calls it and just carries out the action
(block, prompt-then-decide, or run), so the allow/deny/ask logic no longer needs a DB or callbacks to test.
Covered by [`gate-decision.test.ts`](../../src/bun/engine/stream/gate-decision.test.ts) (6 tests): the six
matrix rows plus the two dominance edges (`alwaysAllow` beats a `deny` policy; a global `allow` ignores a
per-chat `deny` grant).

## Links

- [stream-engine.md](stream-engine.md) — the approval round-trip (chunk to UI to `resolveToolApproval`), and
  where `buildGatedTools` is merged with provider server tools in `run.ts`.
- [memory.md](memory.md) — the three memory tools and the title-index / lazy-fetch pattern
  `get_capability_detail` also uses.
- [../architecture.md](../architecture.md) — process model, IPC, DB.
