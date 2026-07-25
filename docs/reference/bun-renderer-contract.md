# The bun and renderer contract (`src/shared-contracts/`)

The layer both processes agree on. Read this when touching `shared-contracts/`, RPC, or wiring a new
cross-process call.

## The bridge

Proxima runs as two processes that **cannot see each other's memory**:

- **bun** — the backend. Owns SQLite, filesystem, network, API keys, the LLM stream. No UI.
- **mainview (renderer)** — the React UI. A sandboxed WebKit view: it **cannot** touch the DB or disk
  directly. It can only ask bun.

They talk over Electrobun's RPC pipe (typed message passing). `src/shared-contracts/` is the **shared
agreement** describing what may cross that pipe. It is the only folder both processes import, so the test
for whether something belongs here is: does something in `src/bun/` **and** something in `mainview/`
consume it? If not, it is not a contract (see
[conventions/architecture.md](../conventions/architecture.md)).

## Two layers: nouns and verbs

| Layer | Folder | What it is | Compile / runtime |
|---|---|---|---|
| **Nouns** | `schemas/*.schema.ts` | Zod objects, the data shapes (`ProjectDTO`, `SettingsDTO`) and call inputs (`CreateChatInput`). Type derived through `z.infer`. | Runtime **values**, can `.parse()`. |
| **Verbs** | `rpc/app-rpc.types.ts` | One big `AppRPC` type, the method list. Maps each call to `{ params; response }`, referencing the schema types. | Type-only, **erased** at build. |

Schemas define *a `ProjectDTO`*. The rpc types define *`createProject` takes `CreateProjectInput`, returns
`ProjectDTO`*. The rpc file mostly **imports** the nouns; it rarely defines its own (the few it does,
`StreamChunk` and `SendMessageInput`, are candidates to move to schemas).

`AppRPC` has two directions:

- `bun.requests` — renderer to bun calls. `{ params; response }`. The renderer asks, bun answers.
- `webview.messages` — bun to renderer pushes, fire-and-forget (`streamChunk`, `modelsUpdated`,
  `memoryChanged`). No response. `StreamChunk` is the streaming sub-protocol payload.

## Why both exist: a type is a promise, a schema is a check

A TS type vanishes at build, so it cannot inspect real bytes arriving at a boundary. A schema can. Four
jobs the rpc types file **cannot** do, that schemas do:

1. **Runtime gate.** Data off the pipe, SQLite, or the control-server HTTP is untrusted bytes.
   `Schema.parse(x)` throws on the wrong shape. The type merely *assumed* it was right. ("Parse, don't
   validate.")
2. **One source for the type *and* the validator.** `z.infer` hands back the TS type for free, with no
   separate hand-written validator that could drift.
3. **Constraints and defaults a type cannot hold.** `z.number().int().min(0).max(5)`, `.default({})`,
   `DEFAULT_SETTINGS`. A type says `number`; the schema says *integer 0 to 5*.
4. **Reuse across boundaries.** One `ProjectDTO` schema validates the RPC reply, the DB row, and the
   control-server payload. The rpc types describe only the Electrobun pipe.

One caveat: schemas *enable* the runtime gate, they do not force it. A handler must actually call
`.parse()`. Some handlers currently take a *typed* input and pass it straight through (for example
`createProject`). Whether every input is parsed is worth auditing. An input typed *only* in the rpc file,
such as `SendMessageInput`, has no schema and therefore no possible gate; that is the smell behind the
"give inputs schemas" follow-up.

## Where these plug in (three moments, you never "run" this)

1. **Renderer calls.** `Electroview.defineRPC<AppRPC>` (`mainview/lib/rpc.client.ts`) stamps the contract on
   the client. `rpcRequest().listModels({})` autocompletes params and knows the reply is `ModelDTO[]`.
2. **Bun answers.** `BrowserView.defineRPC<AppRPCTyped>` (`bun/rpc.ts`) stamps the same contract on the
   handlers. A handler that returns the wrong shape will not compile.
3. **Adding a feature.** Add the call to `AppRPC` **first**; both sides go red until you write the bun
   handler and call it from the renderer. The contract is the checklist.

## Building a feature: the shared-contracts step

Any feature needing bun-to-renderer data does this in `shared-contracts/` before touching UI or services:

1. **Scheme the nouns.** Add or extend the Zod schema in `schemas/` for the DTO and the call input(s). The
   type comes free through `z.infer`. Add real constraints (`.min`, `.enum`, defaults).
2. **Type the verb.** Add the method to `AppRPC` in `rpc/app-rpc.types.ts`, referencing those schema types.
   Pick the direction (`bun.requests` for a call, `webview.messages` for a push).
3. Then implement the bun handler plus the renderer TanStack Query hook against it.

## Gotcha: do not re-list a schema's members

The enum lives in the schema once (`MemoryScope = z.enum(['global','project'])`). Comparing a bare member
(`scope === 'project'`) is fine and type-checked. But **hand-copying the union**
(`scope: 'global' | 'project'`) into the rpc file or a handler signature is drift: add a third scope later
and the copies silently disagree. Reference the schema type instead. See
[conventions/architecture.md](../conventions/architecture.md).

## Links

- [../architecture.md](../architecture.md) — the full process model, IPC, DB, streaming.
- [entry-rpc.md](entry-rpc.md) — the RPC door on the bun side.
